import { Texture } from 'playcanvas';

import { Events } from './events';
import { ReferenceImageHistory } from './reference-image-history';
import { ReferenceImageLoader } from './reference-image-loader';
import { ReferenceImageRenderer } from './reference-image-renderer';
import { DEFAULT_REFERENCE_IMAGE_STATE, ReferenceImageLayer, ReferenceImageState } from './reference-image-types';
import { Scene } from './scene';

type ViewportMapping = {
    logicalW: number;
    logicalH: number;
    rectPxRaw: { x: number; y: number; w: number; h: number; };
};

type RenderBoxAnchor = { ax: number; ay: number; };

class ReferenceImageController {
    private events: Events;
    private scene: Scene;
    private loader = new ReferenceImageLoader();
    private renderer: ReferenceImageRenderer;
    private history: ReferenceImageHistory | null = null;
    private applyingHistory = false;
    private state: ReferenceImageState = { ...DEFAULT_REFERENCE_IMAGE_STATE };
    private runtime: { texture: Texture | null; blob: Blob | null; objectUrl: string | null; canvas: HTMLCanvasElement | null; } = {
        texture: null,
        blob: null,
        objectUrl: null,
        canvas: null
    };
    private renderBoxAnchor: RenderBoxAnchor = { ax: 0.5, ay: 0.5 };

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        this.renderer = new ReferenceImageRenderer();
        this.scene.add(this.renderer);
        this.registerEvents();
        this.events.on('cameraFrames.stateChanged', (cfState: any) => this.onCameraFramesState(cfState));
        this.events.on('prerender', () => this.updateRenderer());
        this.events.on('scene.clear', () => this.reset());
    }

    setHistory(history: ReferenceImageHistory) {
        this.history = history;
    }

    private registerEvents() {
        this.events.function('referenceImage.state', () => this.snapshot());
        this.events.on('referenceImage.setEnabled', (value: boolean) => this.setEnabled(value));
        this.events.on('referenceImage.setVisible', (value: boolean) => this.setVisible(value));
        this.events.on('referenceImage.setLayer', (layer: ReferenceImageLayer) => this.setLayer(layer));
        this.events.on('referenceImage.setOpacity', (opacity: number) => this.setOpacity(opacity));
        this.events.on('referenceImage.setScale', (pct: number) => this.setScalePct(pct));
        this.events.on('referenceImage.setOffset', (offset: { x?: number; y?: number }) => this.setOffset(offset));
        this.events.on('referenceImage.setAnchor', (anchor: RenderBoxAnchor) => this.setAnchor(anchor));
        this.events.on('referenceImage.setIncludeInRender', (value: boolean) => this.setIncludeInRender(value));
        this.events.on('referenceImage.clear', () => this.clearWithHistory());
        this.events.function('referenceImage.loadBlob', async (blob: Blob, filename?: string) => {
            await this.loadFromBlob(blob, filename);
            return true;
        });
        this.events.function('docSerialize.referenceImage', () => this.serializeDoc());
        this.events.function('docDeserialize.referenceImage', async (docState: any, blob?: Blob | null) => {
            await this.deserializeDoc(docState, blob ?? null);
        });
        this.events.function('referenceImage.docAsset', () => {
            if (!this.runtime.blob || !this.state.source) {
                return null;
            }
            return {
                blob: this.runtime.blob,
                filename: this.state.source.filename
            };
        });
    }

    private historyBegin(label: string) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) return;
        this.history.begin(label);
    }

    private historyCommit(label?: string) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) return;
        this.history.commit(label);
    }

    private historyRecord(label: string, fn: () => void) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            fn();
            return;
        }
        this.history.record(label, fn);
    }

    snapshot(): ReferenceImageState {
        return JSON.parse(JSON.stringify(this.state));
    }

    applySnapshot(snapshot: ReferenceImageState) {
        this.applyingHistory = true;
        try {
            this.state = {
                ...DEFAULT_REFERENCE_IMAGE_STATE,
                ...(snapshot ?? {})
            };
            this.state.scaleK = this.state.scalePct / 100;
            this.renderBoxAnchor = snapshot?.anchor ?? this.renderBoxAnchor;
            if (!this.state.source) {
                this.destroyTexture();
                this.runtime = { texture: null, blob: null, objectUrl: null, canvas: null };
            }
            this.updateRenderer();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        } finally {
            this.applyingHistory = false;
        }
    }

    private reset() {
        this.clear(false, false);
        this.applySnapshot({ ...DEFAULT_REFERENCE_IMAGE_STATE });
    }

    private onCameraFramesState(cfState: any) {
        if (!cfState?.renderBox?.anchor) {
            return;
        }
        this.renderBoxAnchor = cfState.renderBox.anchor;
        if (!this.applyingHistory) {
            this.setAnchor(cfState.renderBox.anchor, true);
        }
    }

    private getViewportMapping(): ViewportMapping | null {
        const mapping = this.events.invoke('cameraFrames.viewportMapping') as any;
        if (!mapping || !mapping.rectPxRaw) {
            return null;
        }
        if (mapping.anchor) {
            this.renderBoxAnchor = mapping.anchor;
        }
        return {
            logicalW: mapping.logicalW,
            logicalH: mapping.logicalH,
            rectPxRaw: mapping.rectPxRaw
        };
    }

    private computePixelPerfect(mapping: ViewportMapping | null) {
        const source = this.state.source;
        if (!mapping || !source) {
            this.state.pixelPerfectEligible = false;
            return;
        }
        const sameSize = Math.round(mapping.logicalW) === Math.round(source.appliedSize.w) &&
            Math.round(mapping.logicalH) === Math.round(source.appliedSize.h);
        const offsetZero = Math.abs(this.state.offsetPx.x) < 1e-3 && Math.abs(this.state.offsetPx.y) < 1e-3;
        const scaleDefault = Math.abs(this.state.scalePct - 100) < 1e-3;
        this.state.pixelPerfectEligible = sameSize && offsetZero && scaleDefault;
    }

    private computeRect(mapping: ViewportMapping | null) {
        const source = this.state.source;
        if (!mapping || !source || !this.state.visible || !this.state.enabled || !this.runtime.texture) {
            return null;
        }
        const viewScale = mapping.logicalW > 0 ? mapping.rectPxRaw.w / mapping.logicalW : 0;
        if (!isFinite(viewScale) || viewScale <= 0) {
            return null;
        }
        const anchor = this.state.anchor ?? this.renderBoxAnchor;
        const logicalAnchorX = mapping.logicalW * anchor.ax;
        const logicalAnchorY = mapping.logicalH * anchor.ay;
        const imgW = source.appliedSize.w * this.state.scaleK;
        const imgH = source.appliedSize.h * this.state.scaleK;
        const topLeftX = logicalAnchorX - anchor.ax * imgW - this.state.offsetPx.x;
        const topLeftY = logicalAnchorY - anchor.ay * imgH - this.state.offsetPx.y;
        return {
            x: mapping.rectPxRaw.x + topLeftX * viewScale,
            y: mapping.rectPxRaw.y + topLeftY * viewScale,
            w: imgW * viewScale,
            h: imgH * viewScale
        };
    }

    private updateRenderer() {
        const mapping = this.getViewportMapping();
        this.computePixelPerfect(mapping);
        const rect = this.computeRect(mapping);
        const params = rect ? {
            rectPx: rect,
            opacity: Math.max(0, Math.min(1, this.state.opacity)),
            texture: this.runtime.texture,
            pixelPerfect: !!this.state.pixelPerfectEligible
        } : null;
        if (this.state.layer === 'back') {
            this.renderer.setParams('back', params);
            this.renderer.setParams('front', null);
        } else {
            this.renderer.setParams('front', params);
            this.renderer.setParams('back', null);
        }
    }

    private setEnabled(value: boolean) {
        const next = !!value;
        if (next === this.state.enabled) return;
        this.historyRecord('referenceImage.enabled', () => {
            this.state.enabled = next;
            this.updateRenderer();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private setVisible(value: boolean) {
        const next = !!value;
        if (next === this.state.visible) return;
        this.historyRecord('referenceImage.visible', () => {
            this.state.visible = next;
            this.updateRenderer();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private setLayer(layer: ReferenceImageLayer) {
        if (layer !== 'back' && layer !== 'front') {
            return;
        }
        if (layer === this.state.layer) return;
        this.historyRecord('referenceImage.layer', () => {
            this.state.layer = layer;
            this.updateRenderer();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private setOpacity(opacity: number) {
        const clamped = Math.max(0, Math.min(1, opacity ?? 0));
        if (Math.abs(clamped - this.state.opacity) < 1e-4) {
            return;
        }
        this.historyRecord('referenceImage.opacity', () => {
            this.state.opacity = clamped;
            this.updateRenderer();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private setScalePct(pct: number) {
        const clamped = Math.max(1, Math.min(400, pct ?? 100));
        if (Math.abs(clamped - this.state.scalePct) < 1e-3) {
            return;
        }
        this.historyRecord('referenceImage.scale', () => {
            this.state.scalePct = clamped;
            this.state.scaleK = clamped / 100;
            this.updateRenderer();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private setOffset(offset: { x?: number; y?: number }) {
        const next = {
            x: offset?.x ?? this.state.offsetPx.x,
            y: offset?.y ?? this.state.offsetPx.y
        };
        if (Math.abs(next.x - this.state.offsetPx.x) < 1e-3 && Math.abs(next.y - this.state.offsetPx.y) < 1e-3) {
            return;
        }
        this.historyRecord('referenceImage.offset', () => {
            this.state.offsetPx = next;
            this.updateRenderer();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private setAnchor(anchor: RenderBoxAnchor, silent = false) {
        if (!anchor) return;
        const next = { ax: anchor.ax ?? this.state.anchor.ax, ay: anchor.ay ?? this.state.anchor.ay };
        if (next.ax === this.state.anchor.ax && next.ay === this.state.anchor.ay) {
            return;
        }
        const apply = () => {
            this.state.anchor = next;
            this.renderBoxAnchor = next;
            this.updateRenderer();
        };
        if (silent) {
            apply();
            return;
        }
        this.historyRecord('referenceImage.anchor', () => {
            apply();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private setIncludeInRender(include: boolean) {
        const next = !!include;
        if (next === this.state.includeInRender) return;
        this.historyRecord('referenceImage.includeInRender', () => {
            this.state.includeInRender = next;
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private destroyTexture() {
        if (this.runtime.texture) {
            this.runtime.texture.destroy();
            this.runtime.texture = null;
        }
    }

    private clear(revokeObjectUrl: boolean, resetState = true) {
        this.destroyTexture();
        if (this.runtime.canvas) {
            this.runtime.canvas.width = 0;
            this.runtime.canvas.height = 0;
        }
        if (revokeObjectUrl) {
            this.loader.revoke(this.runtime.objectUrl);
        }
        this.runtime = {
            texture: null,
            blob: null,
            objectUrl: null,
            canvas: null
        };
        if (resetState) {
            this.state = {
                ...this.state,
                ...DEFAULT_REFERENCE_IMAGE_STATE,
                layer: this.state.layer,
                anchor: this.renderBoxAnchor
            };
        } else {
            this.state.source = null;
            this.state.pixelPerfectEligible = false;
        }
        this.renderer.clearParams();
        this.updateRenderer();
    }

    private clearWithHistory() {
        this.historyRecord('referenceImage.clear', () => {
            this.clear(true);
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        });
    }

    private async loadFromBlob(blob: Blob, filename?: string, recordHistory = true) {
        const decoded = await this.loader.decode(blob, filename);
        this.destroyTexture();

        const texture = this.loader.createTexture(this.scene.app.graphicsDevice, decoded.canvas, this.state.pixelPerfectEligible);
        this.runtime = {
            texture,
            blob,
            objectUrl: decoded.source.objectUrl ?? null,
            canvas: decoded.canvas
        };

        const apply = () => {
            this.state.source = decoded.source;
            this.state.enabled = true;
            this.state.visible = true;
            this.state.scalePct = 100;
            this.state.scaleK = 1;
            this.state.offsetPx = { x: 0, y: 0 };
            this.computePixelPerfect(this.getViewportMapping());
            this.updateRenderer();
            this.events.fire('referenceImage.stateChanged', this.snapshot());
        };
        if (recordHistory) {
            this.historyRecord('referenceImage.load', apply);
        } else {
            apply();
        }
    }

    private serializeDoc() {
        if (!this.state.source || !this.runtime.blob) {
            return null;
        }
        return this.snapshot();
    }

    private async deserializeDoc(docState: any, blob: Blob | null) {
        if (!docState) {
            this.clear(true, false);
            this.applySnapshot({ ...DEFAULT_REFERENCE_IMAGE_STATE });
            return;
        }
        if (!blob) {
            console.warn('reference image blob missing; skipped');
            this.clear(true);
            return;
        }
        await this.loadFromBlob(blob, docState?.source?.filename ?? 'reference-image', false);
        this.applySnapshot({
            ...this.snapshot(),
            ...docState
        });
    }
}

const registerReferenceImage = (events: Events, scene: Scene) => {
    const controller = new ReferenceImageController(events, scene);
    return controller;
};

export { ReferenceImageController, registerReferenceImage };
