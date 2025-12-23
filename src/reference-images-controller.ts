import { readPsd, type Layer } from 'ag-psd';
import { Texture } from 'playcanvas';

import { Events } from './events';
import { DEFAULT_REFERENCE_IMAGE_FILENAME, normalizeReferenceImageFilename } from './reference-image-filename';
import { ReferenceImageLoader } from './reference-image-loader';
import { ReferenceImageRenderer, type RenderParams } from './reference-image-renderer';
import type { ReferenceImageSourceMeta, ReferenceImageState } from './reference-image-types';
import type { ReferenceImagesHistory } from './reference-images-history';
import { DEFAULT_REFERENCE_IMAGES_STATE, type ReferenceImageItemGroup, type ReferenceImageItemState, type ReferenceImagesDocState, type ReferenceImagesExportLayer, type ReferenceImagesState } from './reference-images-types';
import { Scene } from './scene';

type ViewportMapping = {
    logicalW: number;
    logicalH: number;
    rectPxRaw: { x: number; y: number; w: number; h: number; };
    rectNormRaw: { x: number; y: number; w: number; h: number; };
};

type ReferenceImageItemRuntime = {
    blob: Blob | null;
    previewCanvas: HTMLCanvasElement | null;
    texture: Texture | null;
};

type ExportWorkEntry = {
    canvas: HTMLCanvasElement | null;
    promise: Promise<HTMLCanvasElement> | null;
};

type ReferenceImageItemPatch = Partial<ReferenceImageItemState>;

type ReferenceImagesUpdateManyPayload = {
    ids?: string[];
    patch?: ReferenceImageItemPatch;
    updates?: Array<{ id: string; patch: ReferenceImageItemPatch; }>;
};

type PendingAdd = {
    id: string;
    decoded: Awaited<ReturnType<ReferenceImageLoader['decode']>>;
    blob: Blob;
    group: ReferenceImageItemGroup;
    name: string;
    visible: boolean;
    includeInRender: boolean;
    opacity: number;
    scalePct: number;
    offsetPx: { x: number; y: number; };
    anchor: { ax: number; ay: number; };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

let fallbackIdCounter = 0;
const createId = () => {
    try {
        const uuid = (globalThis.crypto as any)?.randomUUID?.();
        if (typeof uuid === 'string' && uuid) {
            return uuid;
        }
    } catch {
        // ignore
    }
    fallbackIdCounter++;
    return `refimg_${Date.now().toString(16)}_${fallbackIdCounter.toString(16)}_${Math.random().toString(16).slice(2)}`;
};

const createCanvasBlob = (canvas: HTMLCanvasElement, type: string) => {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create blob from canvas'));
            }
        }, type);
    });
};

const isReferenceImageGroup = (value: unknown): value is ReferenceImageItemGroup => value === 'back' || value === 'front';

const normalizeGroup = (value: unknown, fallback: ReferenceImageItemGroup): ReferenceImageItemGroup => {
    return isReferenceImageGroup(value) ? value : fallback;
};

const normalizeBool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

const normalizeAnchor = (value: any, fallback: { ax: number; ay: number; }) => {
    const ax = isFiniteNumber(value?.ax) ? clamp(value.ax, 0, 1) : fallback.ax;
    const ay = isFiniteNumber(value?.ay) ? clamp(value.ay, 0, 1) : fallback.ay;
    return { ax, ay };
};

const normalizeOffset = (value: any, fallback: { x: number; y: number; }) => {
    const x = isFiniteNumber(value?.x) ? value.x : fallback.x;
    const y = isFiniteNumber(value?.y) ? value.y : fallback.y;
    return { x, y };
};

const normalizeItem = (value: any): ReferenceImageItemState | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const rawId = typeof value.id === 'string' && value.id ? value.id : createId();
    const id = rawId.replace(/[\\/]/g, '_');
    const source = value.source as ReferenceImageSourceMeta | null;
    if (!source || typeof source !== 'object') {
        return null;
    }
    const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : (source.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
    const group = normalizeGroup(value.group, 'front');
    const order = isFiniteNumber(value.order) ? Math.max(0, Math.floor(value.order)) : 0;
    const visible = normalizeBool(value.visible, true);
    const includeInRender = normalizeBool(value.includeInRender, false);
    const opacity = clamp(isFiniteNumber(value.opacity) ? value.opacity : 0.7, 0, 1);
    const scalePct = clamp(isFiniteNumber(value.scalePct) ? value.scalePct : 100, 1, 400);
    const offsetPx = normalizeOffset(value.offsetPx, { x: 0, y: 0 });
    const anchor = normalizeAnchor(value.anchor, { ax: 0.5, ay: 0.5 });

    return {
        id,
        name,
        group,
        order,
        visible,
        includeInRender,
        opacity,
        scalePct,
        offsetPx,
        anchor,
        source
    };
};

const normalizeOrders = (items: ReferenceImageItemState[]) => {
    const groups: ReferenceImageItemGroup[] = ['back', 'front'];
    groups.forEach((group) => {
        const groupItems = items
        .filter(i => i.group === group)
        .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
        groupItems.forEach((item, index) => {
            item.order = index;
        });
    });
};

const normalizeState = (value: any): ReferenceImagesState => {
    const masterVisible = normalizeBool(value?.masterVisible, DEFAULT_REFERENCE_IMAGES_STATE.masterVisible);
    const itemsRaw = Array.isArray(value?.items) ? value.items : [];
    const items = itemsRaw.map(normalizeItem).filter(Boolean) as ReferenceImageItemState[];
    normalizeOrders(items);
    const ids = new Set(items.map(i => i.id));
    const activeId = (typeof value?.activeId === 'string' && ids.has(value.activeId)) ? value.activeId : (items[0]?.id ?? null);
    return {
        masterVisible,
        activeId,
        items
    };
};

class ReferenceImagesController {
    private events: Events;
    private scene: Scene;
    private loader = new ReferenceImageLoader();
    private renderer: ReferenceImageRenderer;
    private history: ReferenceImagesHistory | null = null;
    private applyingHistory = false;
    private state: ReferenceImagesState = { ...DEFAULT_REFERENCE_IMAGES_STATE, items: [] };
    private runtimeById = new Map<string, ReferenceImageItemRuntime>();
    private sourceCache = new Map<string, { blob: Blob; previewCanvas: HTMLCanvasElement; }>();
    private sourceCacheOrder: string[] = [];
    private exportWorkBySourceKey = new Map<string, ExportWorkEntry>();
    private exportWorkOrder: string[] = [];

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        this.renderer = new ReferenceImageRenderer();
        this.scene.add(this.renderer);
        this.registerEvents();
        this.events.on('cameraFrames.stateChanged', () => this.requestRender());
        this.events.on('prerender', () => this.updateRenderer());
        this.events.on('scene.clear', () => this.reset());
    }

    private requestRender() {
        this.scene.forceRender = true;
    }

    setHistory(history: ReferenceImagesHistory) {
        this.history = history;
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

    private fireStateChanged() {
        const snapshot = this.snapshot();
        this.events.fire('referenceImages.stateChanged', snapshot);
        this.events.fire('referenceImage.stateChanged', this.snapshotSingle());
    }

    snapshot(): ReferenceImagesState {
        return JSON.parse(JSON.stringify(this.state));
    }

    private snapshotSingle(): ReferenceImageState {
        const active = this.getActiveItem();
        if (!active) {
            return {
                enabled: false,
                visible: false,
                layer: 'front',
                opacity: 0.7,
                scalePct: 100,
                scaleK: 1,
                offsetPx: { x: 0, y: 0 },
                anchor: { ax: 0.5, ay: 0.5 },
                includeInRender: false,
                source: null,
                pixelPerfectEligible: false
            };
        }
        const offsetXInt = Math.abs(active.offsetPx.x - Math.round(active.offsetPx.x)) < 1e-3;
        const offsetYInt = Math.abs(active.offsetPx.y - Math.round(active.offsetPx.y)) < 1e-3;
        const scaleDefault = Math.abs(active.scalePct - 100) < 1e-3;
        const pixelPerfectEligible = scaleDefault && offsetXInt && offsetYInt;
        return {
            enabled: true,
            visible: this.state.masterVisible && active.visible,
            layer: active.group,
            opacity: active.opacity,
            scalePct: active.scalePct,
            scaleK: active.scalePct / 100,
            offsetPx: active.offsetPx,
            anchor: active.anchor,
            includeInRender: active.includeInRender,
            source: active.source,
            pixelPerfectEligible
        };
    }

    applySnapshot(snapshot: ReferenceImagesState) {
        this.applyingHistory = true;
        try {
            const prevState = this.state;
            const prevItemsById = new Map(prevState.items.map(i => [i.id, i]));
            this.state = normalizeState(snapshot ?? DEFAULT_REFERENCE_IMAGES_STATE);

            const nextIds = new Set(this.state.items.map(i => i.id));
            for (const [id, runtime] of this.runtimeById) {
                if (nextIds.has(id)) {
                    continue;
                }
                const prevItem = prevItemsById.get(id);
                this.rememberSource(id, prevItem?.source ?? null, runtime.blob, runtime.previewCanvas);
                this.destroyRuntime(runtime);
                this.runtimeById.delete(id);
            }

            for (const item of this.state.items) {
                const runtime = this.runtimeById.get(item.id) ?? { blob: null, previewCanvas: null, texture: null };
                this.runtimeById.set(item.id, runtime);
                if (!runtime.blob || !runtime.previewCanvas || !runtime.texture) {
                    this.restoreRuntimeFromCache(item.id, item.source, runtime, item);
                }
                if (!runtime.texture && runtime.previewCanvas) {
                    runtime.texture = this.loader.createTexture(this.scene.app.graphicsDevice, runtime.previewCanvas, this.previewPreferNearest(item));
                }
            }

            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        } finally {
            this.applyingHistory = false;
        }
    }

    private reset() {
        this.clearAllInternal();
        this.sourceCache.clear();
        this.sourceCacheOrder = [];
        this.exportWorkBySourceKey.clear();
        this.exportWorkOrder = [];
        this.applySnapshot({ ...DEFAULT_REFERENCE_IMAGES_STATE, items: [] });
    }

    private registerEvents() {
        this.events.function('referenceImages.state', () => this.snapshot());
        this.events.on('referenceImages.setMasterVisible', (visible: boolean) => this.setMasterVisible(visible));
        this.events.on('referenceImages.toggleMasterVisible', () => this.toggleMasterVisible());
        this.events.function('referenceImages.addBlob', async (blob: Blob, filename?: string, opts?: { group?: ReferenceImageItemGroup; }) => {
            return await this.addBlobsInternal([{ blob, filename }], { group: opts?.group }, true).then(ids => ids[0] ?? null);
        });
        this.events.function('referenceImages.addBlobs', async (files: Array<{ blob: Blob; filename?: string }>, opts?: { group?: ReferenceImageItemGroup; }) => {
            return await this.addBlobsInternal(files, { group: opts?.group }, true);
        });
        this.events.function('referenceImages.importPsd', async (blob: Blob, filename?: string, opts?: { group?: ReferenceImageItemGroup; }) => {
            return await this.importPsd(blob, filename, opts);
        });
        this.events.on('referenceImages.remove', (id: string) => this.remove(id));
        this.events.on('referenceImages.clearAll', () => this.clearAllWithHistory());
        this.events.on('referenceImages.setActive', (id: string | null) => this.setActive(id));
        this.events.on('referenceImages.update', (id: string, patch: ReferenceImageItemPatch) => this.update(id, patch));
        this.events.on('referenceImages.updateMany', (payload: ReferenceImagesUpdateManyPayload) => this.updateMany(payload));
        this.events.on('referenceImages.center', (id: string) => this.center(id));
        this.events.on('referenceImages.reorder', (payload: { id: string; group: ReferenceImageItemGroup; toIndex: number; }) => this.reorder(payload));
        this.events.on('referenceImages.historyBegin', (label: string) => this.historyBegin(label));
        this.events.on('referenceImages.historyCommit', (label?: string) => this.historyCommit(label));

        this.events.function('referenceImages.renderExportLayers', async (width: number, height: number, options?: { applyOpacity?: boolean; }) => {
            return await this.renderExportLayers(width, height, options);
        });

        this.events.function('docSerialize.referenceImages', () => this.serializeDoc());
        this.events.function('docDeserialize.referenceImages', async (docState: any, blobs: Map<string, Blob>) => {
            await this.deserializeDoc(docState, blobs);
        });
        this.events.function('referenceImages.docAssets', () => this.docAssets());

        // legacy wrappers (single active item)
        this.events.function('referenceImage.state', () => this.snapshotSingle());
        this.events.on('referenceImage.setVisible', (value: boolean) => this.legacySetVisible(value));
        this.events.on('referenceImage.setLayer', (layer: ReferenceImageItemGroup) => this.legacyUpdate({ group: layer }));
        this.events.on('referenceImage.setOpacity', (opacity: number) => this.legacyUpdate({ opacity }));
        this.events.on('referenceImage.setScale', (pct: number) => this.legacyUpdate({ scalePct: pct }));
        this.events.on('referenceImage.setOffset', (offset: { x?: number; y?: number }) => this.legacyUpdateOffset(offset));
        this.events.on('referenceImage.center', () => {
            const activeId = this.state.activeId;
            if (activeId) {
                this.center(activeId);
            }
        });
        this.events.on('referenceImage.setAnchor', (anchor: { ax: number; ay: number }) => this.legacyUpdate({ anchor }));
        this.events.on('referenceImage.setIncludeInRender', (value: boolean) => this.legacyUpdate({ includeInRender: value }));
        this.events.on('referenceImage.historyBegin', (label: string) => this.historyBegin(label));
        this.events.on('referenceImage.historyCommit', (label?: string) => this.historyCommit(label));
        this.events.on('referenceImage.clear', () => this.legacyClear());
        this.events.function('referenceImage.loadBlob', async (blob: Blob, filename?: string) => {
            try {
                const ids = await this.addBlobsInternal([{ blob, filename }], {}, true);
                return ids.length > 0;
            } catch (error) {
                console.error('referenceImage.loadBlob failed', error);
                const message = (error as Error)?.message ?? `${error}`;
                await this.events.invoke('showPopup', {
                    type: 'error',
                    header: 'Reference Images',
                    message: `'${message}'`
                });
                return false;
            }
        });
        this.events.function('referenceImage.renderExportLayer', async (width: number, height: number, options?: { applyOpacity?: boolean; }) => {
            const activeId = this.state.activeId;
            if (!activeId) {
                return null;
            }
            const layer = await this.renderExportLayerForId(activeId, width, height, options);
            return layer?.canvas ?? null;
        });
        this.events.function('referenceImage.docAsset', () => {
            const active = this.getActiveItem();
            if (!active) {
                return null;
            }
            const runtime = this.runtimeById.get(active.id);
            if (!runtime?.blob) {
                return null;
            }
            return {
                blob: runtime.blob,
                filename: active.source?.filename
            };
        });
        this.events.function('docSerialize.referenceImage', () => null);
        this.events.function('docDeserialize.referenceImage', async () => {
            // handled by docDeserialize.referenceImages
        });
    }

    private getActiveItem() {
        const activeId = this.state.activeId;
        if (!activeId) {
            return null;
        }
        return this.state.items.find(i => i.id === activeId) ?? null;
    }

    private legacyClear() {
        const activeId = this.state.activeId;
        if (!activeId) {
            return;
        }
        this.remove(activeId);
    }

    private legacySetVisible(value: boolean) {
        const active = this.getActiveItem();
        if (!active) {
            return;
        }
        const next = !!value;
        this.historyRecord('referenceImage.visible', () => {
            if (next && !this.state.masterVisible) {
                this.state.masterVisible = true;
            }
            active.visible = next;
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private legacyUpdate(patch: Partial<ReferenceImageItemState>) {
        const activeId = this.state.activeId;
        if (!activeId) {
            return;
        }
        this.update(activeId, patch);
    }

    private legacyUpdateOffset(offset: { x?: number; y?: number }) {
        const active = this.getActiveItem();
        if (!active) {
            return;
        }
        const nextOffset = {
            x: isFiniteNumber(offset?.x) ? offset.x : active.offsetPx.x,
            y: isFiniteNumber(offset?.y) ? offset.y : active.offsetPx.y
        };
        this.update(active.id, { offsetPx: nextOffset } as any);
    }

    private setMasterVisible(value: boolean) {
        const next = !!value;
        if (next === this.state.masterVisible) {
            return;
        }
        this.historyRecord('referenceImages.masterVisible', () => {
            this.state.masterVisible = next;
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private toggleMasterVisible() {
        this.setMasterVisible(!this.state.masterVisible);
    }

    private previewPreferNearest(item: ReferenceImageItemState) {
        return Math.abs(item.scalePct - 100) < 1e-3;
    }

    private rememberSource(id: string, source: ReferenceImageSourceMeta | null, blob: Blob | null, previewCanvas: HTMLCanvasElement | null) {
        if (!id || !blob || !previewCanvas || !source) {
            return;
        }
        this.sourceCache.set(id, { blob, previewCanvas });
        this.sourceCacheOrder = this.sourceCacheOrder.filter(k => k !== id);
        this.sourceCacheOrder.push(id);
        const MAX_CACHE = 8;
        while (this.sourceCacheOrder.length > MAX_CACHE) {
            const drop = this.sourceCacheOrder.shift();
            if (drop) {
                this.sourceCache.delete(drop);
            }
        }
    }

    private restoreRuntimeFromCache(id: string, source: ReferenceImageSourceMeta, runtime: ReferenceImageItemRuntime, item: ReferenceImageItemState) {
        const cached = this.sourceCache.get(id);
        if (!cached) {
            return;
        }
        runtime.blob = cached.blob;
        runtime.previewCanvas = cached.previewCanvas;
        if (!runtime.texture && cached.previewCanvas) {
            runtime.texture = this.loader.createTexture(this.scene.app.graphicsDevice, cached.previewCanvas, this.previewPreferNearest(item));
        }
    }

    private destroyRuntime(runtime: ReferenceImageItemRuntime) {
        if (runtime.texture) {
            runtime.texture.destroy();
        }
        runtime.texture = null;
        runtime.blob = null;
        runtime.previewCanvas = null;
    }

    private getViewportMapping(): ViewportMapping | null {
        const mapping = this.events.invoke('cameraFrames.viewportMapping') as any;
        if (!mapping || !mapping.rectPxRaw) {
            return null;
        }
        return {
            logicalW: mapping.logicalW,
            logicalH: mapping.logicalH,
            rectPxRaw: mapping.rectPxRaw,
            rectNormRaw: mapping.rectNormRaw
        };
    }

    private computeMappingViewportSize(mapping: ViewportMapping | null) {
        const rectPxRaw = mapping?.rectPxRaw;
        const rectNormRaw = mapping?.rectNormRaw;
        if (!rectPxRaw || !rectNormRaw) {
            return null;
        }
        const vw = rectNormRaw.w !== 0 ? (rectPxRaw.w / rectNormRaw.w) : null;
        const vh = rectNormRaw.h !== 0 ? (rectPxRaw.h / rectNormRaw.h) : null;
        if (typeof vw !== 'number' || typeof vh !== 'number' || !isFinite(vw) || !isFinite(vh) || vw <= 0 || vh <= 0) {
            return null;
        }
        return { vw, vh };
    }

    private getRenderTargetSize() {
        const rt = this.scene.camera.entity.camera.renderTarget;
        if (rt && rt.width > 0 && rt.height > 0) {
            return { w: rt.width, h: rt.height };
        }
        const device = this.scene.app.graphicsDevice;
        return { w: device.width, h: device.height };
    }

    private computeRect(item: ReferenceImageItemState, runtime: ReferenceImageItemRuntime, mapping: ViewportMapping | null) {
        if (!mapping || !runtime.texture || !this.state.masterVisible || !item.visible) {
            return null;
        }
        const viewScale = mapping.logicalW > 0 ? mapping.rectPxRaw.w / mapping.logicalW : 0;
        if (!isFinite(viewScale) || viewScale <= 0) {
            return null;
        }
        const anchor = item.anchor;
        const logicalAnchorX = mapping.logicalW * anchor.ax;
        const logicalAnchorY = mapping.logicalH * anchor.ay;
        const scaleK = item.scalePct / 100;
        const imgW = item.source.appliedSize.w * scaleK;
        const imgH = item.source.appliedSize.h * scaleK;
        const topLeftX = logicalAnchorX - anchor.ax * imgW - item.offsetPx.x;
        const topLeftY = logicalAnchorY - anchor.ay * imgH - item.offsetPx.y;
        const rect = {
            x: mapping.rectPxRaw.x + topLeftX * viewScale,
            y: mapping.rectPxRaw.y + topLeftY * viewScale,
            w: imgW * viewScale,
            h: imgH * viewScale
        };
        const viewport = this.computeMappingViewportSize(mapping);
        const rtSize = this.getRenderTargetSize();
        if (!viewport) {
            return rect;
        }
        const sx = viewport.vw > 0 ? (rtSize.w / viewport.vw) : 1;
        const sy = viewport.vh > 0 ? (rtSize.h / viewport.vh) : 1;
        return {
            x: rect.x * sx,
            y: rect.y * sy,
            w: rect.w * sx,
            h: rect.h * sy
        };
    }

    private updateRenderer() {
        if (this.scene.camera.suppressFinalBlit && !this.scene.renderFlags.offscreenIncludeReferenceImage) {
            this.renderer.clearParams();
            return;
        }
        if (!this.state.masterVisible) {
            this.renderer.clearParams();
            return;
        }
        const mapping = this.getViewportMapping();
        const backParams: RenderParams[] = [];
        const frontParams: RenderParams[] = [];
        const sorted = [...this.state.items].sort((a, b) => {
            const groupOrder = (a.group === b.group) ? 0 : (a.group === 'back' ? -1 : 1);
            if (groupOrder !== 0) return groupOrder;
            return (a.order - b.order) || a.id.localeCompare(b.id);
        });
        sorted.forEach((item) => {
            const runtime = this.runtimeById.get(item.id);
            if (!runtime?.texture) {
                return;
            }
            const rect = this.computeRect(item, runtime, mapping);
            if (!rect) {
                return;
            }
            const params = {
                rectPx: rect,
                opacity: clamp(item.opacity, 0, 1),
                texture: runtime.texture,
                pixelPerfect: this.previewPreferNearest(item)
            };
            if (item.group === 'back') {
                backParams.push(params);
            } else {
                frontParams.push(params);
            }
        });

        this.renderer.setParamsList('back', backParams);
        this.renderer.setParamsList('front', frontParams);
    }

    private async decodeForAdd(blob: Blob, filename?: string) {
        const normalizedFilename = normalizeReferenceImageFilename(filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
        const device = this.scene.app.graphicsDevice;
        const deviceMaxTextureSize = (typeof device.maxTextureSize === 'number' && isFinite(device.maxTextureSize) && device.maxTextureSize > 0) ?
            device.maxTextureSize :
            4096;
        const maxPreviewDim = Math.max(1, Math.min(4096, deviceMaxTextureSize));
        const decoded = await this.loader.decode(blob, normalizedFilename, maxPreviewDim);
        return decoded;
    }

    private applyPendingAdds(pending: PendingAdd[], recordHistory: boolean, label: string) {
        if (pending.length === 0) {
            return [];
        }

        const apply = () => {
            const nextOrderByGroup = {
                back: this.state.items.filter(i => i.group === 'back').length,
                front: this.state.items.filter(i => i.group === 'front').length
            };

            pending.forEach((entry) => {
                const order = entry.group === 'back' ? nextOrderByGroup.back++ : nextOrderByGroup.front++;
                const item: ReferenceImageItemState = {
                    id: entry.id,
                    name: entry.name,
                    group: entry.group,
                    order,
                    visible: entry.visible,
                    includeInRender: entry.includeInRender,
                    opacity: entry.opacity,
                    scalePct: entry.scalePct,
                    offsetPx: entry.offsetPx,
                    anchor: entry.anchor,
                    source: entry.decoded.source
                };
                const texture = this.loader.createTexture(this.scene.app.graphicsDevice, entry.decoded.canvas, this.previewPreferNearest(item));
                this.runtimeById.set(entry.id, {
                    texture,
                    blob: entry.blob,
                    previewCanvas: entry.decoded.canvas
                });
                this.rememberSource(entry.id, item.source, entry.blob, entry.decoded.canvas);
                this.state.items.push(item);
                this.state.activeId = entry.id;
            });
            normalizeOrders(this.state.items);
            if (!this.state.masterVisible) {
                this.state.masterVisible = true;
            }
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        };

        if (recordHistory) {
            this.historyRecord(label, apply);
        } else {
            apply();
        }

        return pending.map(entry => entry.id);
    }

    private async addBlobsInternal(files: Array<{ blob: Blob; filename?: string }>, opts?: { group?: ReferenceImageItemGroup; }, recordHistory = true) {
        const pending: PendingAdd[] = [];
        const fallbackGroup = normalizeGroup(opts?.group, 'front');
        for (const file of (files ?? [])) {
            if (!(file?.blob instanceof Blob)) {
                continue;
            }
            const id = createId();
            const decoded = await this.decodeForAdd(file.blob, file.filename);
            pending.push({
                id,
                decoded,
                blob: file.blob,
                group: fallbackGroup,
                name: decoded.source.filename ?? normalizeReferenceImageFilename(file.filename),
                visible: true,
                includeInRender: false,
                opacity: 0.7,
                scalePct: 100,
                offsetPx: { x: 0, y: 0 },
                anchor: { ax: 0.5, ay: 0.5 }
            });
        }
        return this.applyPendingAdds(pending, recordHistory, 'referenceImages.add');
    }

    private remove(id: string) {
        if (typeof id !== 'string' || !id) {
            return;
        }
        const index = this.state.items.findIndex(i => i.id === id);
        if (index < 0) {
            return;
        }
        this.historyRecord('referenceImages.remove', () => {
            const removed = this.state.items[index];
            const runtime = this.runtimeById.get(id) ?? null;
            if (runtime) {
                this.rememberSource(id, removed.source, runtime.blob, runtime.previewCanvas);
                this.destroyRuntime(runtime);
                this.runtimeById.delete(id);
            }
            this.state.items.splice(index, 1);
            normalizeOrders(this.state.items);
            if (this.state.activeId === id) {
                this.state.activeId = this.state.items[0]?.id ?? null;
            }
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private clearAllInternal() {
        const prevItemsById = new Map(this.state.items.map(i => [i.id, i]));
        for (const [id, runtime] of this.runtimeById) {
            const item = prevItemsById.get(id);
            this.rememberSource(id, item?.source ?? null, runtime.blob, runtime.previewCanvas);
            this.destroyRuntime(runtime);
        }
        this.runtimeById.clear();
        this.state = { ...DEFAULT_REFERENCE_IMAGES_STATE, masterVisible: this.state.masterVisible, items: [] };
        this.renderer.clearParams();
        this.updateRenderer();
        this.requestRender();
    }

    private clearAllWithHistory() {
        if (this.state.items.length === 0) {
            return;
        }
        this.historyRecord('referenceImages.clearAll', () => {
            this.clearAllInternal();
            this.fireStateChanged();
        });
    }

    private setActive(id: string | null) {
        const next = typeof id === 'string' ? id : null;
        if (next === this.state.activeId) {
            return;
        }
        if (next && !this.state.items.some(i => i.id === next)) {
            return;
        }
        this.state.activeId = next;
        this.fireStateChanged();
    }

    private applyPatchToItem(item: ReferenceImageItemState, patch: ReferenceImageItemPatch) {
        let groupChanged = false;
        if (typeof patch.name === 'string' && patch.name.trim()) {
            item.name = patch.name.trim();
        }
        if (typeof (patch as any).visible === 'boolean') {
            item.visible = patch.visible as any;
            if (item.visible && !this.state.masterVisible) {
                this.state.masterVisible = true;
            }
        }
        if (typeof (patch as any).includeInRender === 'boolean') {
            item.includeInRender = patch.includeInRender as any;
        }
        if (typeof (patch as any).opacity === 'number') {
            item.opacity = clamp(patch.opacity as any, 0, 1);
        }
        if (typeof (patch as any).scalePct === 'number') {
            item.scalePct = clamp(patch.scalePct as any, 1, 400);
        }
        if ((patch as any).offsetPx && typeof (patch as any).offsetPx === 'object') {
            item.offsetPx = normalizeOffset((patch as any).offsetPx, item.offsetPx);
        }
        if ((patch as any).anchor && typeof (patch as any).anchor === 'object') {
            item.anchor = normalizeAnchor((patch as any).anchor, item.anchor);
        }
        if (typeof (patch as any).group === 'string' && isReferenceImageGroup((patch as any).group)) {
            const nextGroup = patch.group as any;
            if (nextGroup !== item.group) {
                groupChanged = true;
                item.group = nextGroup;
                item.order = this.state.items.filter(i => i.group === nextGroup && i.id !== item.id).length;
            }
        }
        return groupChanged;
    }

    private updateMany(payload: ReferenceImagesUpdateManyPayload) {
        let updates: Array<{ id: string; patch: ReferenceImageItemPatch; }> = [];
        if (Array.isArray(payload?.updates)) {
            updates = payload.updates;
        } else if (Array.isArray(payload?.ids)) {
            updates = payload.ids.map(id => ({ id, patch: payload?.patch ?? {} }));
        }
        if (updates.length === 0) {
            return;
        }
        const itemsById = new Map(this.state.items.map(item => [item.id, item]));
        this.historyRecord('referenceImages.update', () => {
            let groupChanged = false;
            updates.forEach((update) => {
                if (!update?.id || !update.patch) {
                    return;
                }
                const item = itemsById.get(update.id);
                if (!item) {
                    return;
                }
                if (this.applyPatchToItem(item, update.patch)) {
                    groupChanged = true;
                }
            });
            if (groupChanged) {
                normalizeOrders(this.state.items);
            }
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private update(id: string, patch: ReferenceImageItemPatch) {
        if (typeof id !== 'string' || !id || !patch) {
            return;
        }
        this.updateMany({ updates: [{ id, patch }] });
    }

    private center(id: string) {
        const item = this.state.items.find(i => i.id === id);
        if (!item) {
            return;
        }
        this.update(id, { offsetPx: { x: 0, y: 0 }, anchor: { ax: 0.5, ay: 0.5 } } as any);
    }

    private reorder(payload: { id: string; group: ReferenceImageItemGroup; toIndex: number; }) {
        const id = payload?.id;
        if (typeof id !== 'string' || !id) {
            return;
        }
        const item = this.state.items.find(i => i.id === id);
        if (!item) {
            return;
        }
        const toGroup = normalizeGroup(payload?.group, item.group);
        const toIndex = isFiniteNumber(payload?.toIndex) ? Math.max(0, Math.floor(payload.toIndex)) : 0;

        this.historyRecord('referenceImages.reorder', () => {
            item.group = toGroup;
            const groupItems = this.state.items
            .filter(i => i.group === toGroup && i.id !== id)
            .sort((a, b) => a.order - b.order);
            const clampedIndex = Math.max(0, Math.min(groupItems.length, toIndex));
            groupItems.splice(clampedIndex, 0, item);
            groupItems.forEach((i, idx) => {
                i.order = idx;
            });
            const otherGroup: ReferenceImageItemGroup = toGroup === 'back' ? 'front' : 'back';
            const otherItems = this.state.items.filter(i => i.group === otherGroup).sort((a, b) => a.order - b.order);
            otherItems.forEach((i, idx) => {
                i.order = idx;
            });
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private sourceKey(source: ReferenceImageSourceMeta | null) {
        if (!source) {
            return null;
        }
        const ratio = Number.isFinite(source.pixelRatio) ? source.pixelRatio : 1;
        return [
            source.filename ?? '',
            source.mime ?? '',
            `${source.originalSize?.w ?? 0}x${source.originalSize?.h ?? 0}`,
            `${source.appliedSize?.w ?? 0}x${source.appliedSize?.h ?? 0}`,
            ratio.toFixed(6)
        ].join('|');
    }

    private trimExportCanvas(options: { outW: number; outH: number; x0: number; y0: number; w: number; h: number; }) {
        const left = clamp(Math.floor(options.x0), 0, options.outW);
        const top = clamp(Math.floor(options.y0), 0, options.outH);
        const right = clamp(Math.ceil(options.x0 + options.w), 0, options.outW);
        const bottom = clamp(Math.ceil(options.y0 + options.h), 0, options.outH);
        if (right <= left || bottom <= top) {
            return null;
        }
        return { left, top, right, bottom };
    }

    private async getExportWorkCanvas(source: ReferenceImageSourceMeta, blob: Blob) {
        const key = this.sourceKey(source);
        if (!key) {
            return null;
        }
        const existing = this.exportWorkBySourceKey.get(key);
        if (existing?.canvas) {
            return existing.canvas;
        }
        if (existing?.promise) {
            return await existing.promise;
        }
        const entry: ExportWorkEntry = { canvas: null, promise: null };
        const promise = this.loader.decode(blob, source.filename).then(decoded => decoded.canvas);
        entry.promise = promise;
        this.exportWorkBySourceKey.set(key, entry);
        this.exportWorkOrder = this.exportWorkOrder.filter(k => k !== key);
        this.exportWorkOrder.push(key);
        const MAX_CACHE = 3;
        while (this.exportWorkOrder.length > MAX_CACHE) {
            const drop = this.exportWorkOrder.shift();
            if (drop) {
                this.exportWorkBySourceKey.delete(drop);
            }
        }
        try {
            const canvas = await promise;
            entry.canvas = canvas;
            entry.promise = null;
            return canvas;
        } catch (error) {
            this.exportWorkBySourceKey.delete(key);
            this.exportWorkOrder = this.exportWorkOrder.filter(k => k !== key);
            throw error;
        } finally {
            if (entry.promise === promise) {
                entry.promise = null;
            }
        }
    }

    private async renderExportLayerForId(id: string, width: number, height: number, options?: { applyOpacity?: boolean; }): Promise<ReferenceImagesExportLayer | null> {
        const item = this.state.items.find(i => i.id === id);
        if (!item || !item.includeInRender) {
            return null;
        }
        const runtime = this.runtimeById.get(id);
        const blob = runtime?.blob;
        const source = item.source;
        if (!blob || !source) {
            return null;
        }
        const image = await this.getExportWorkCanvas(source, blob);
        if (!image) {
            return null;
        }
        const outW = Math.max(1, Math.round(width));
        const outH = Math.max(1, Math.round(height));
        const applyOpacity = options?.applyOpacity !== false;
        const opacity = clamp(item.opacity, 0, 1);
        if (applyOpacity && opacity <= 0) {
            return null;
        }

        const anchor = item.anchor;
        const scaleK = item.scalePct / 100;
        const imgW = source.appliedSize.w * scaleK;
        const imgH = source.appliedSize.h * scaleK;
        let x0 = outW * anchor.ax - anchor.ax * imgW - item.offsetPx.x;
        let y0 = outH * anchor.ay - anchor.ay * imgH - item.offsetPx.y;
        let drawW = imgW;
        let drawH = imgH;

        const scaleDefault = Math.abs(item.scalePct - 100) < 1e-3;
        if (scaleDefault) {
            x0 = Math.round(x0);
            y0 = Math.round(y0);
            drawW = source.appliedSize.w;
            drawH = source.appliedSize.h;
        }

        const bounds = this.trimExportCanvas({ outW, outH, x0, y0, w: drawW, h: drawH });
        if (!bounds) {
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = bounds.right - bounds.left;
        canvas.height = bounds.bottom - bounds.top;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for reference image export');
        }

        if (applyOpacity) {
            ctx.globalAlpha = opacity;
        }

        if (scaleDefault) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(image, x0 - bounds.left, y0 - bounds.top);
        } else {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(image, x0 - bounds.left, y0 - bounds.top, imgW, imgH);
        }

        return {
            group: item.group,
            name: item.name ?? item.source.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME,
            opacity,
            canvas,
            bounds
        };
    }

    private async renderExportLayers(width: number, height: number, options?: { applyOpacity?: boolean; }): Promise<ReferenceImagesExportLayer[]> {
        const layers: ReferenceImagesExportLayer[] = [];
        const candidates = [...this.state.items]
        .filter(i => i.includeInRender)
        .sort((a, b) => {
            const groupOrder = (a.group === b.group) ? 0 : (a.group === 'back' ? -1 : 1);
            if (groupOrder !== 0) return groupOrder;
            return (a.order - b.order) || a.id.localeCompare(b.id);
        });

        for (const item of candidates) {
            const layer = await this.renderExportLayerForId(item.id, width, height, options);
            if (layer) {
                layers.push(layer);
            }
        }
        return layers;
    }

    private serializeDoc(): ReferenceImagesDocState | null {
        if (this.state.items.length === 0) {
            return null;
        }
        const snapshot = this.snapshot();
        snapshot.items.forEach((item) => {
            if (item.source?.filename) {
                item.source.filename = normalizeReferenceImageFilename(item.source.filename);
            }
            if (item.source && 'objectUrl' in (item.source as any)) {
                delete (item.source as any).objectUrl;
            }
        });
        normalizeOrders(snapshot.items);
        return {
            version: 1,
            masterVisible: !!snapshot.masterVisible,
            activeId: snapshot.activeId,
            items: snapshot.items
        };
    }

    private docAssets() {
        const assets: Array<{ path: string; blob: Blob }> = [];
        this.state.items.forEach((item) => {
            const runtime = this.runtimeById.get(item.id);
            const blob = runtime?.blob;
            if (!blob || !item.source?.filename) {
                return;
            }
            const safeName = normalizeReferenceImageFilename(item.source.filename);
            assets.push({
                path: `reference-images/${item.id}/${safeName}`,
                blob
            });
        });
        return assets;
    }

    private async deserializeDoc(docState: any, blobs: Map<string, Blob>) {
        const normalizeDoc = (docState && typeof docState === 'object' && Array.isArray((docState as any).items)) ? docState : null;
        if (!normalizeDoc) {
            // migration from legacy referenceImage state if provided as docState
            if (docState?.source && blobs instanceof Map) {
                const legacyBlob = blobs.get(`reference-image/${normalizeReferenceImageFilename(docState?.source?.filename)}`) ?? null;
                if (legacyBlob) {
                    const decoded = await this.decodeForAdd(legacyBlob, docState?.source?.filename);
                    const id = createId();
                    const item: ReferenceImageItemState = {
                        id,
                        name: decoded.source.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME,
                        group: normalizeGroup(docState?.layer, 'front'),
                        order: 0,
                        visible: normalizeBool(docState?.visible, true),
                        includeInRender: normalizeBool(docState?.includeInRender, false),
                        opacity: clamp(isFiniteNumber(docState?.opacity) ? docState.opacity : 0.7, 0, 1),
                        scalePct: clamp(isFiniteNumber(docState?.scalePct) ? docState.scalePct : 100, 1, 400),
                        offsetPx: normalizeOffset(docState?.offsetPx, { x: 0, y: 0 }),
                        anchor: normalizeAnchor(docState?.anchor, { ax: 0.5, ay: 0.5 }),
                        source: decoded.source
                    };
                    this.clearAllInternal();
                    this.state = {
                        masterVisible: true,
                        activeId: id,
                        items: [item]
                    };
                    const texture = this.loader.createTexture(this.scene.app.graphicsDevice, decoded.canvas, this.previewPreferNearest(item));
                    this.runtimeById.set(id, { texture, blob: legacyBlob, previewCanvas: decoded.canvas });
                    this.rememberSource(id, item.source, legacyBlob, decoded.canvas);
                    this.updateRenderer();
                    this.requestRender();
                    this.fireStateChanged();
                    return;
                }
            }

            this.clearAllInternal();
            this.sourceCache.clear();
            this.sourceCacheOrder = [];
            this.applySnapshot({ ...DEFAULT_REFERENCE_IMAGES_STATE, items: [] });
            return;
        }

        const doc = normalizeDoc as ReferenceImagesDocState;
        const itemsRaw = Array.isArray(doc.items) ? doc.items : [];

        const loadedItems: ReferenceImageItemState[] = [];
        const loadedRuntimes: Array<{ id: string; blob: Blob; canvas: HTMLCanvasElement; item: ReferenceImageItemState; }> = [];

        for (const raw of itemsRaw) {
            const normalized = normalizeItem(raw);
            if (!normalized) {
                continue;
            }
            const safeFilename = normalizeReferenceImageFilename(normalized.source?.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
            const path = `reference-images/${normalized.id}/${safeFilename}`;
            const blob = blobs?.get(path) ?? null;
            if (!blob) {
                console.warn(`reference image missing: ${path}`);
                continue;
            }
            const decoded = await this.decodeForAdd(blob, safeFilename);
            normalized.source = decoded.source;
            loadedItems.push(normalized);
            loadedRuntimes.push({ id: normalized.id, blob, canvas: decoded.canvas, item: normalized });
        }

        normalizeOrders(loadedItems);

        const nextState: ReferenceImagesState = {
            masterVisible: normalizeBool(doc.masterVisible, true),
            activeId: typeof doc.activeId === 'string' ? doc.activeId : (loadedItems[0]?.id ?? null),
            items: loadedItems
        };
        if (nextState.activeId && !loadedItems.some(i => i.id === nextState.activeId)) {
            nextState.activeId = loadedItems[0]?.id ?? null;
        }

        this.clearAllInternal();
        this.state = nextState;
        loadedRuntimes.forEach((entry) => {
            const texture = this.loader.createTexture(this.scene.app.graphicsDevice, entry.canvas, this.previewPreferNearest(entry.item));
            this.runtimeById.set(entry.id, { texture, blob: entry.blob, previewCanvas: entry.canvas });
            this.rememberSource(entry.id, entry.item.source, entry.blob, entry.canvas);
        });
        this.updateRenderer();
        this.requestRender();
        this.fireStateChanged();
    }

    private async importPsd(blob: Blob, filename?: string, opts?: { group?: ReferenceImageItemGroup; }) {
        const group = normalizeGroup(opts?.group, this.getActiveItem()?.group ?? 'front');
        const arrayBuffer = await blob.arrayBuffer();
        const psd = readPsd(arrayBuffer, { skipCompositeImageData: true, skipThumbnail: true });
        const width = (psd as any)?.width ?? 0;
        const height = (psd as any)?.height ?? 0;
        if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) {
            throw new Error('Invalid PSD dimensions');
        }

        const layers: Layer[] = [];
        const walk = (children?: Layer[]) => {
            (children ?? []).forEach((layer) => {
                const childList = (layer as any).children as Layer[] | undefined;
                if (Array.isArray(childList) && childList.length > 0) {
                    walk(childList);
                    return;
                }
                layers.push(layer);
            });
        };
        walk((psd as any).children ?? []);

        if (layers.length === 0) {
            return [];
        }

        const docCenter = { x: width / 2, y: height / 2 };

        const pending: PendingAdd[] = [];
        let skipped = 0;

        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            const canvas = (layer as any).canvas as HTMLCanvasElement | undefined;
            const left = (layer as any).left;
            const top = (layer as any).top;
            const right = (layer as any).right;
            const bottom = (layer as any).bottom;
            if (!canvas || !isFiniteNumber(left) || !isFiniteNumber(top) || !isFiniteNumber(right) || !isFiniteNumber(bottom)) {
                skipped++;
                continue;
            }
            const w = right - left;
            const h = bottom - top;
            if (!isFiniteNumber(w) || !isFiniteNumber(h) || w <= 0 || h <= 0) {
                skipped++;
                continue;
            }
            const layerName = (typeof (layer as any).name === 'string' && (layer as any).name.trim()) ? (layer as any).name.trim() : `Layer ${i + 1}`;
            const visible = !((layer as any).hidden === true);
            const opacity = clamp(isFiniteNumber((layer as any).opacity) ? (layer as any).opacity : 1, 0, 1);
            const layerCenter = { x: (left + right) / 2, y: (top + bottom) / 2 };
            const offsetPx = { x: docCenter.x - layerCenter.x, y: docCenter.y - layerCenter.y };
            const pngBlob = await createCanvasBlob(canvas, 'image/png');
            const normalizedFilename = normalizeReferenceImageFilename(`${(filename ?? 'psd').split(/[\\/]/).pop() ?? 'psd'}-${layerName}.png`);
            const decoded = await this.decodeForAdd(pngBlob, normalizedFilename);
            pending.push({
                id: createId(),
                decoded,
                blob: pngBlob,
                group,
                name: layerName,
                visible,
                includeInRender: visible,
                opacity,
                scalePct: 100,
                offsetPx,
                anchor: { ax: 0.5, ay: 0.5 }
            });
        }

        const ids = this.applyPendingAdds(pending, true, 'referenceImages.importPsd');

        if (skipped > 0) {
            console.warn(`PSD import skipped ${skipped} layer(s) without canvas/bounds`);
        }

        return ids;
    }
}

const registerReferenceImages = (events: Events, scene: Scene) => {
    const controller = new ReferenceImagesController(events, scene);
    return controller;
};

export { ReferenceImagesController, registerReferenceImages };
