import { frameAnchorLogical, frameRectsScreen, getAnchorLogicalForHandle, getHandleLogicalPosition, hitTestFrameBorder, hitTestHandle } from '../camera-frames-frame-geometry';
import { rotateOffset } from '../camera-frames-math';
import { drawOverlay } from '../camera-frames-overlay';
import type { ViewportMapping } from '../camera-frames-types';
import type { Scene } from '../scene';
import type { CameraEditor } from './camera-editor';
import { legacyFrameState } from './camera-legacy';
import type { ShotFrame } from './camera-store';

type Point = { x: number; y: number };
type Drag = {
    pointerId: number; cameraId: string; frame: ShotFrame; mode: 'move' | 'resize' | 'anchor' | 'rotate';
    start: Point; center: Point; anchor: Point; startDistance: number; angle: number;
    width: number; height: number; scale: number;
};

export class FrameOverlay {
    readonly canvas = document.createElement('canvas');
    private drag: Drag | null = null;

    constructor(private editor: CameraEditor, private scene: Scene, private container: HTMLElement) {
        this.canvas.id = 'camera-frames-overlay';
        Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '3' });
        container.appendChild(this.canvas);
        scene.events.on('postrender', () => this.draw());
        scene.events.on('cameraFrames.overlay.release', () => this.release());
        scene.events.function('cameraFrames.viewportMapping', () => {
            const view = editor.views.shot.resolvedView;
            if (!view || !editor.views.shot.active) return null;
            const rect = { x: view.gate.x, y: view.gate.y, w: view.gate.width, h: view.gate.height };
            return { logicalW: view.outputSize.width,
                logicalH: view.outputSize.height,
                rectPxRaw: rect,
                rectNormRaw: { x: rect.x / view.size.width, y: rect.y / view.size.height, w: rect.w / view.size.width, h: rect.h / view.size.height },
                anchor: { ax: view.composition.anchorX, ay: view.composition.anchorY } };
        });
        container.addEventListener('pointerdown', event => this.down(event), true);
        container.addEventListener('pointermove', event => this.move(event), true);
        container.addEventListener('pointerup', (event) => {
            if (this.drag?.pointerId === event.pointerId) this.release(event);
        }, true);
        container.addEventListener('pointercancel', () => this.release(), true);
        window.addEventListener('blur', () => this.release());
    }

    private layout() {
        const record = this.editor.record;
        const camera = this.editor.views.shot;
        const view = camera.resolvedView;
        if (!record || !camera.active || !view) return null;
        const scale = this.container.clientWidth / this.scene.targetSize.width;
        const state = legacyFrameState(record);
        const mapping: ViewportMapping = {
            logicalW: view.outputSize.width,
            logicalH: view.outputSize.height,
            viewScale: view.gate.width / view.outputSize.width * scale,
            fitScale: 1,
            rectPxRaw: { x: (camera.paneRect.x * this.scene.targetSize.width + view.gate.x) * scale,
                y: (camera.paneRect.y * this.scene.targetSize.height + view.gate.y) * scale,
                w: view.gate.width * scale,
                h: view.gate.height * scale },
            rectPx: null,
            rectNorm: null,
            rectNormRaw: null
        };
        mapping.rectPx = mapping.rectPxRaw;
        const rect = mapping.rectPxRaw;
        const toScreen = (x: number, y: number) => ({ x: rect.x + (x + mapping.logicalW / 2) * mapping.viewScale, y: rect.y + (y + mapping.logicalH / 2) * mapping.viewScale });
        const toLogical = (x: number, y: number) => ({ x: (x - rect.x) / mapping.viewScale - mapping.logicalW / 2, y: (y - rect.y) / mapping.viewScale - mapping.logicalH / 2 });
        const rects = frameRectsScreen(state.frames, state.renderBox, mapping.logicalW, mapping.logicalH, mapping.viewScale, toScreen, Math.PI / 180);
        return { record, state, camera, mapping, toScreen, toLogical, rects };
    }

    private draw() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        const ratio = window.devicePixelRatio;
        if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
            this.canvas.width = Math.round(w * ratio);
            this.canvas.height = Math.round(h * ratio);
        }
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const layout = this.layout();
        if (!layout) return;
        const { camera, state, mapping, toScreen, rects } = layout;
        ctx.save();
        ctx.beginPath();
        ctx.rect(camera.paneRect.x * w, camera.paneRect.y * h, camera.paneRect.z * w, camera.paneRect.w * h);
        ctx.clip();
        drawOverlay({ ctx,
            viewport: { vw: w, vh: h },
            enabled: true,
            renderBox: state.renderBox,
            mapping,
            logicalToScreen: toScreen,
            frameRects: rects,
            mask: state.mask });
        ctx.restore();
    }

    private point(event: PointerEvent) {
        const rect = this.container.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    private down(event: PointerEvent) {
        if (event.button !== 0 || (event.target as HTMLElement).closest('button,input,select,.pcui-panel')) return;
        const layout = this.layout();
        if (!layout) return;
        const p = this.point(event);
        if (p.x < layout.camera.paneRect.x * this.container.clientWidth) return;
        const { state, mapping, toLogical, toScreen, rects } = layout;
        const hit = hitTestHandle(p.x, p.y, rects, state.frames.find(frame => frame.selected)?.id, state.renderBox, toScreen);
        const frame = hit?.frame ?? hitTestFrameBorder(p.x, p.y, rects, toLogical);
        if (!frame) return;
        const rect = rects.find(rect => rect.frame.id === frame.id);
        const handle = hit?.handleId;
        const mode = handle === 'rotate' ? 'rotate' : handle === 'anchor' ? 'anchor' : handle ? 'resize' : 'move';
        const center = rect.centerLogical;
        const anchor = event.altKey && mode === 'resize' ? frameAnchorLogical(frame, state.renderBox, mapping.logicalW, mapping.logicalH) :
            getAnchorLogicalForHandle(handle, frame, state.renderBox, center, rect.frameW, rect.frameH, mapping.logicalW, mapping.logicalH, rect.rotationRad);
        const handlePoint = getHandleLogicalPosition(handle, center, rect.frameW, rect.frameH, rect.rotationRad);
        const logical = toLogical(p.x, p.y);
        this.drag = { pointerId: event.pointerId,
            cameraId: layout.record.id,
            frame: structuredClone(frame),
            mode,
            start: p,
            center,
            anchor,
            startDistance: Math.hypot(handlePoint.x - anchor.x, handlePoint.y - anchor.y),
            angle: Math.atan2(logical.y - anchor.y, logical.x - anchor.x),
            width: mapping.logicalW,
            height: mapping.logicalH,
            scale: mapping.viewScale };
        this.editor.history.begin();
        this.editor.change(record => record.frames.forEach((item) => {
            item.selected = item.id === frame.id;
        }), layout.record.id);
        this.container.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    private move(event: PointerEvent) {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const p = this.point(event);
        const dx = (p.x - drag.start.x) / drag.scale;
        const dy = (p.y - drag.start.y) / drag.scale;
        const initial = drag.frame;
        const layout = this.layout();
        if (!layout || layout.record.id !== drag.cameraId) {
            this.release(); return;
        }
        const logical = layout.toLogical(p.x, p.y);
        this.editor.change((record) => {
            const frame = record.frames.find(frame => frame.id === initial.id);
            if (!frame) return;
            if (drag.mode === 'move') {
                frame.pos = { x: initial.pos.x + (event.shiftKey && Math.abs(dy) > Math.abs(dx) ? 0 : dx) / drag.width,
                    y: initial.pos.y + (event.shiftKey && Math.abs(dx) >= Math.abs(dy) ? 0 : dy) / drag.height };
            } else if (drag.mode === 'anchor') {
                frame.anchor = { x: 0.5 + logical.x / drag.width, y: 0.5 + logical.y / drag.height };
            } else if (drag.mode === 'resize' && drag.startDistance > 1e-6) {
                frame.scaleK = Math.min(4, Math.max(0.1, initial.scaleK * Math.hypot(logical.x - drag.anchor.x, logical.y - drag.anchor.y) / drag.startDistance));
                frame.scalePct = frame.scaleK * 100;
                const scale = frame.scaleK / initial.scaleK;
                frame.pos = { x: 0.5 + (drag.anchor.x + (drag.center.x - drag.anchor.x) * scale) / drag.width,
                    y: 0.5 + (drag.anchor.y + (drag.center.y - drag.anchor.y) * scale) / drag.height };
            } else if (drag.mode === 'rotate') {
                let angle = Math.atan2(logical.y - drag.anchor.y, logical.x - drag.anchor.x) - drag.angle;
                if (event.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * Math.PI / 12;
                const offset = rotateOffset({ x: drag.center.x - drag.anchor.x, y: drag.center.y - drag.anchor.y }, angle);
                frame.pos = { x: 0.5 + (drag.anchor.x + offset.x) / drag.width, y: 0.5 + (drag.anchor.y + offset.y) / drag.height };
                frame.rotationDeg = (initial.rotationDeg ?? 0) + angle * 180 / Math.PI;
            }
        }, drag.cameraId);
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    private release(_event?: PointerEvent) {
        if (!this.drag) return;
        if (this.container.hasPointerCapture(this.drag.pointerId)) this.container.releasePointerCapture(this.drag.pointerId);
        this.drag = null;
        this.editor.history.end();
        // Let the view's pointer-up listener release its pane lease as well.
    }
}
