import { Container, Label, NumericInput } from '@playcanvas/pcui';
import { Entity, Mat4, Quat, TranslateGizmo, Vec3 } from 'playcanvas';

import { createGizmoCamera } from './gizmo-camera-adapter';
import { EntityTransformOp } from '../edit-ops';
import { Events } from '../events';
import { hitTestGizmo } from '../gizmo-hit';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { Transform } from '../transform';
import { localize } from '../ui/localization';

const mat = new Mat4();
const mat1 = new Mat4();
const mat2 = new Mat4();
const mat3 = new Mat4();
const p = new Vec3();
const p0 = new Vec3();
const p1 = new Vec3();
const r = new Quat();
const s = new Vec3();

const t = new Transform();

class MeasureTransformHandler {
    activate() {}
    deactivate() {}
}

class MeasureTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, scene: Scene, parent: HTMLElement, canvasContainer: Container) {
        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg', 'hidden');
        svg.id = 'measure-tool-svg';
        parent.appendChild(svg);

        const ns = svg.namespaceURI;

        // create defs node
        const defs = document.createElementNS(ns, 'defs');

        // create line element
        const line = document.createElementNS(ns, 'line') as SVGLineElement;
        line.id = 'measure-line';
        defs.appendChild(line);

        const lineBottom = document.createElementNS(ns, 'use') as SVGUseElement;
        lineBottom.id = 'measure-line-bottom';
        lineBottom.setAttribute('href', '#measure-line');

        const lineTop = document.createElementNS(ns, 'use') as SVGUseElement;
        lineTop.id = 'measure-line-top';
        lineTop.setAttribute('href', '#measure-line');

        // create line ends
        const lineStart = document.createElementNS(ns, 'circle') as SVGCircleElement;
        lineStart.id = 'measure-line-start';

        const lineEnd = document.createElementNS(ns, 'circle') as SVGCircleElement;
        lineEnd.id = 'measure-line-end';

        svg.appendChild(defs);
        svg.appendChild(lineBottom);
        svg.appendChild(lineTop);
        svg.appendChild(lineStart);
        svg.appendChild(lineEnd);

        // ui
        const lengthLabel = new Label({
            text: localize('measure.length')
        });

        const lengthInput = new NumericInput({
            width: 90,
            placeholder: 'm',
            precision: 2,
            min: 0.0001,
            value: 0
        });
        let suppressUI = 0;

        const selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        selectToolbar.append(lengthLabel);
        selectToolbar.append(lengthInput);
        canvasContainer.append(selectToolbar);

        const gizmo = new TranslateGizmo(createGizmoCamera(scene.camera.entity.camera), scene.gizmoLayer);
        const entity = new Entity('measureGizmoPivot');
        const transformHandler = new MeasureTransformHandler();

        let active = false;
        let splat: Splat;

        const isPointerLocked = () => {
            return document.pointerLockElement === canvasContainer.dom;
        };

        const getCameraFramesOverlay = () => {
            return document.getElementById('camera-frames-overlay') as HTMLCanvasElement | null;
        };

        // get world space point
        const getPoint = (index: number, result: Vec3) => {
            splat.worldTransform.transformPoint(splat.measurePoints[index], result);
        };

        const getPoint2d = (index: number, result: Vec3) => {
            getPoint(index, result);
            scene.camera.worldToScreen(result, result);
            const rect = scene.canvas.getBoundingClientRect();
            const w = rect.width > 0 ? rect.width : scene.canvas.clientWidth;
            const h = rect.height > 0 ? rect.height : scene.canvas.clientHeight;
            result.x *= w;
            result.y *= h;
        };

        const updateVisuals = () => {
            gizmo.detach();

            if (splat && active && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                getPoint(splat.measureSelection, p);
                t.set(p, Quat.IDENTITY, Vec3.ONE);
                events.invoke('pivot').place(t);
                entity.setLocalPosition(p);
                gizmo.attach(entity);
            }

            if (splat && splat.measurePoints.length === 2) {
                getPoint(0, p0);
                getPoint(1, p1);
                const len = p0.distance(p1);

                suppressUI++;
                lengthInput.value = len;
                lengthInput.enabled = true;
                suppressUI--;
            } else {
                lengthInput.enabled = false;
            }
        };

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:start', () => {
            events.invoke('pivot').start();
        });

        gizmo.on('transform:move', () => {
            events.invoke('pivot').moveTRS(entity.getLocalPosition(), entity.getLocalRotation(), entity.getLocalScale());
        });

        gizmo.on('transform:end', () => {
            events.invoke('pivot').end();
        });

        events.on('selection.changed', (selection) => {
            const nextSplat = selection instanceof Splat ? selection : null;
            splat = nextSplat;
            if (!active) {
                return;
            }
            if (!nextSplat) {
                events.fire('tool.deactivate');
                return;
            }
            updateVisuals();
            queueMicrotask(() => {
                if (!active || splat !== nextSplat) {
                    return;
                }
                events.fire('transformHandler.push', transformHandler);
            });
        });

        events.on('pivot.started', () => {

        });

        events.on('pivot.moved', () => {
            if (active && splat && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                const p = events.invoke('pivot').transform.position;
                mat.invert(splat.worldTransform);
                mat.transformPoint(p, splat.measurePoints[splat.measureSelection]);
            }
            scene.forceRender = true;
        });

        events.on('pivot.ended', () => {
            if (active && splat && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                updateVisuals();
            }
        });

        const origTransform = new Mat4();
        const origP = new Vec3();
        const origR = new Quat();
        const origS = new Vec3();
        const mid = new Vec3();
        let startLen = 0;

        const startScale = () => {
            if (!splat || splat.measurePoints.length !== 2) {
                return;
            }

            origTransform.copy(splat.worldTransform);
            origP.copy(splat.entity.getLocalPosition());
            origR.copy(splat.entity.getLocalRotation());
            origS.copy(splat.entity.getLocalScale());

            getPoint(0, p0);
            getPoint(1, p1);
            mid.sub2(p1, p0);
            startLen = mid.length();
            mid.mulScalar(0.5).add(p0);
        };

        // position and scale the splat according to the new length
        const applyLength = (newLength: number) => {
            if (!splat || splat.measurePoints.length !== 2 || newLength <= 0) {
                return;
            }

            const scale = newLength / startLen;

            // calculate mid point
            p.copy(mid);

            // construct a transform matrix that scales from p by len * 0.5
            mat1.setTranslate(-p.x, -p.y, -p.z);
            mat2.setScale(scale, scale, scale);
            mat3.setTranslate(p.x, p.y, p.z);

            mat.mul2(mat1, origTransform);
            mat.mul2(mat2, mat);
            mat.mul2(mat3, mat);

            mat.getTranslation(p);
            r.setFromMat4(mat);
            mat.getScale(s);

            splat.entity.setLocalPosition(p);
            splat.entity.setLocalRotation(r);
            splat.entity.setLocalScale(s);

            scene.forceRender = true;
        };

        const endScale = () => {
            const top = new EntityTransformOp({
                splat: splat,
                oldt: new Transform(origP, origR, origS),
                newt: new Transform(splat.entity.getLocalPosition(), splat.entity.getLocalRotation(), splat.entity.getLocalScale())
            });

            events.fire('edit.add', top);
            updateVisuals();
        };

        let dragging = false;

        // handle length input updates
        lengthInput.on('slider:mousedown', () => {
            startScale();
            dragging = true;
        });
        lengthInput.on('change', (value) => {
            if (dragging) {
                applyLength(value);
            } else if (!suppressUI) {
                startScale();
                applyLength(value);
                endScale();
            }
        });
        lengthInput.on('slider:mouseup', () => {
            endScale();
            dragging = false;
        });

        events.on('select.delete', () => {
            if (active && splat && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                splat.measurePoints.splice(splat.measureSelection, 1);
                splat.measureSelection--;
                updateVisuals();
            }
        });

        const isPrimary = (e: PointerEvent) => {
            return e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
        };

        type PointerInfo = {
            cssX: number;
            cssY: number;
            targetX: number | null;
            targetY: number | null;
            cssToTargetScaleX: number | null;
            cssToTargetScaleY: number | null;
            clientX: number;
            clientY: number;
        };

        let clicked = false;
        let activePointerId: number | null = null;
        let pointerDownValid = false;
        let pointerDownInfo: PointerInfo | null = null;
        let lastPointer: { x: number; y: number } | null = null;
        let pointerMoveDistance = 0;
        const clickMoveThreshold = 3;

        const getCanvasRect = () => {
            const rect = scene.canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return null;
            }
            return rect;
        };

        const getPointerLockCenter = (rect: DOMRect) => {
            const frustum = scene.camera.getCustomFrustum();
            if (!frustum) {
                return { x: rect.width * 0.5, y: rect.height * 0.5 };
            }
            const dx = frustum.right - frustum.left;
            const dy = frustum.top - frustum.bottom;
            let xNdc = 0;
            let yNdc = 0;
            if (typeof dx === 'number' && isFinite(dx) && Math.abs(dx) > 1e-6) {
                xNdc = -(frustum.right + frustum.left) / dx;
            }
            if (typeof dy === 'number' && isFinite(dy) && Math.abs(dy) > 1e-6) {
                yNdc = -(frustum.top + frustum.bottom) / dy;
            }
            if (!isFinite(xNdc)) xNdc = 0;
            if (!isFinite(yNdc)) yNdc = 0;
            const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
            return {
                x: clamp((xNdc * 0.5 + 0.5) * rect.width, 0, rect.width - 1),
                y: clamp((0.5 - yNdc * 0.5) * rect.height, 0, rect.height - 1)
            };
        };

        const getPointerInfo = (event: PointerEvent): PointerInfo | null => {
            const rect = getCanvasRect();
            if (!rect) {
                return null;
            }
            const w = scene.canvas.clientWidth;
            const h = scene.canvas.clientHeight;
            if (!(w > 0 && h > 0)) {
                return null;
            }
            const targetSize = scene.camera.targetSize ?? scene.targetSize;
            const cssToTargetScaleX = targetSize && targetSize.width > 0 ? targetSize.width / rect.width : null;
            const cssToTargetScaleY = targetSize && targetSize.height > 0 ? targetSize.height / rect.height : null;
            const buildInfo = (cssX: number, cssY: number, clientX: number, clientY: number) => {
                const targetX = cssToTargetScaleX !== null ? cssX * cssToTargetScaleX : null;
                const targetY = cssToTargetScaleY !== null ? cssY * cssToTargetScaleY : null;
                return {
                    cssX,
                    cssY,
                    targetX,
                    targetY,
                    cssToTargetScaleX,
                    cssToTargetScaleY,
                    clientX,
                    clientY
                };
            };
            if (isPointerLocked()) {
                const center = getPointerLockCenter(rect);
                const cssX = center.x;
                const cssY = center.y;
                return buildInfo(cssX, cssY, rect.left + cssX, rect.top + cssY);
            }
            const cssX = event.clientX - rect.left;
            const cssY = event.clientY - rect.top;
            if (!Number.isFinite(cssX) || !Number.isFinite(cssY) || cssX < 0 || cssY < 0 || cssX > rect.width || cssY > rect.height) {
                return null;
            }
            return buildInfo(cssX, cssY, event.clientX, event.clientY);
        };

        const isCanvasPointerDown = (event: PointerEvent) => {
            const overlay = getCameraFramesOverlay();
            if (typeof event.composedPath === 'function') {
                const path = event.composedPath();
                if (overlay && path.includes(overlay)) {
                    return false;
                }
                if (path.includes(scene.canvas)) {
                    return true;
                }
                if (isPointerLocked() && path.includes(canvasContainer.dom)) {
                    return true;
                }
                return path.includes(svg) || path.includes(parent);
            }
            if (overlay && event.target === overlay) {
                return false;
            }
            if (event.target === scene.canvas) {
                return true;
            }
            if (isPointerLocked() && event.target === canvasContainer.dom) {
                return true;
            }
            return parent.contains(event.target as Node);
        };

        const pointerdown = (e: PointerEvent) => {
            if (activePointerId !== null) {
                return;
            }
            if (!isPrimary(e)) {
                return;
            }
            clicked = false;
            pointerDownValid = false;
            if (!isCanvasPointerDown(e)) {
                return;
            }
            const pointer = getPointerInfo(e);
            if (!pointer) {
                return;
            }
            if (hitTestGizmo(scene, pointer.clientX, pointer.clientY)) {
                return;
            }
            activePointerId = e.pointerId;
            clicked = true;
            pointerDownValid = true;
            pointerDownInfo = pointer;
            lastPointer = { x: pointer.cssX, y: pointer.cssY };
            pointerMoveDistance = 0;
        };

        const pointermove = (e: PointerEvent) => {
            if (e.pointerId !== activePointerId) {
                return;
            }
            let moved = 0;
            if (isPointerLocked()) {
                moved = Math.abs(e.movementX) + Math.abs(e.movementY);
            } else {
                const pointer = getPointerInfo(e);
                if (pointer && lastPointer) {
                    moved = Math.hypot(pointer.cssX - lastPointer.x, pointer.cssY - lastPointer.y);
                    lastPointer = { x: pointer.cssX, y: pointer.cssY };
                }
            }
            if (moved > 0) {
                pointerMoveDistance += moved;
            }
            if (pointerMoveDistance > clickMoveThreshold) {
                clicked = false;
            }
        };

        const pointerup = (e: PointerEvent) => {
            if (e.pointerId !== activePointerId) {
                return;
            }
            const shouldProcess = pointerDownValid && clicked && isPrimary(e);
            activePointerId = null;
            clicked = false;
            pointerDownValid = false;
            const pointerDown = pointerDownInfo;
            pointerDownInfo = null;
            lastPointer = null;
            pointerMoveDistance = 0;
            if (!shouldProcess || !splat) {
                return;
            }
            const pointerUp = getPointerInfo(e);
            const pointer = (isPointerLocked() && pointerDown) ? pointerDown : (pointerUp ?? pointerDown);
            if (!pointer) {
                return;
            }

            let closestIdx = -1;

            // check for intersection with existing point
            for (let i = 0; i < splat.measurePoints.length; i++) {
                getPoint2d(i, p);

                if (Math.abs(p.x - pointer.cssX) < 8 && Math.abs(p.y - pointer.cssY) < 8) {
                    closestIdx = i;
                    break;
                }
            }

            if (closestIdx >= 0) {
                splat.measureSelection = closestIdx;
                updateVisuals();
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (splat.measurePoints.length < 2) {
                const result = scene.camera.intersect(pointer.cssX, pointer.cssY);
                if (result) {
                    mat.invert(splat.worldTransform);
                    mat.transformPoint(result.position, p);
                    splat.measureSelection = splat.measurePoints.length;
                    splat.measurePoints.push(p.clone());
                    updateVisuals();
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        };

        const pointercancel = (e: PointerEvent) => {
            if (e.pointerId !== activePointerId) {
                return;
            }
            activePointerId = null;
            clicked = false;
            pointerDownValid = false;
            pointerDownInfo = null;
            lastPointer = null;
            pointerMoveDistance = 0;
        };

        events.on('postrender', () => {
            if (active && splat) {
                line.setAttribute('visibility', splat.measurePoints.length > 1 ? 'visible' : 'hidden');

                for (let i = 0; i < 2; i++) {
                    if (i < splat.measurePoints.length) {
                        getPoint2d(i, p);

                        const x = p.x.toString();
                        const y = p.y.toString();

                        if (i === 0) {
                            line.setAttribute('x1', x);
                            line.setAttribute('y1', y);
                            lineStart.setAttribute('cx', x);
                            lineStart.setAttribute('cy', y);

                            lineStart.setAttribute('visibility', 'visible');
                        } else if (i === 1) {
                            line.setAttribute('x2', x);
                            line.setAttribute('y2', y);
                            lineEnd.setAttribute('cx', x);
                            lineEnd.setAttribute('cy', y);
                            lineEnd.setAttribute('visibility', 'visible');
                        }
                    } else {
                        if (i === 0) {
                            lineStart.setAttribute('visibility', 'hidden');
                        } else {
                            lineEnd.setAttribute('visibility', 'hidden');
                        }
                    }
                }
            } else {
                line.setAttribute('visibility', 'hidden');
                lineStart.setAttribute('visibility', 'hidden');
                lineEnd.setAttribute('visibility', 'hidden');
            }
        });

        const updateGizmoSize = () => {
            const { camera, canvas } = scene;
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            if (!(w > 0 && h > 0)) {
                return;
            }
            if (camera.ortho) {
                gizmo.size = 1125 / h;
            } else {
                gizmo.size = 1200 / Math.max(w, h);
            }
        };
        updateGizmoSize();
        events.on('camera.resize', updateGizmoSize);
        events.on('camera.ortho', updateGizmoSize);

        this.activate = () => {
            active = true;
            updateVisuals();
            canvasContainer.dom.addEventListener('pointerdown', pointerdown, true);
            canvasContainer.dom.addEventListener('pointermove', pointermove, true);
            canvasContainer.dom.addEventListener('pointerup', pointerup, true);
            canvasContainer.dom.addEventListener('pointercancel', pointercancel, true);
            selectToolbar.hidden = false;
            parent.style.display = 'block';
            parent.classList.add('noevents');
            svg.classList.remove('hidden');

            events.fire('transformHandler.push', transformHandler);
        };

        this.deactivate = () => {
            active = false;
            updateVisuals();
            activePointerId = null;
            clicked = false;
            pointerDownValid = false;
            pointerDownInfo = null;
            lastPointer = null;
            pointerMoveDistance = 0;
            canvasContainer.dom.removeEventListener('pointerdown', pointerdown, true);
            canvasContainer.dom.removeEventListener('pointermove', pointermove, true);
            canvasContainer.dom.removeEventListener('pointerup', pointerup, true);
            canvasContainer.dom.removeEventListener('pointercancel', pointercancel, true);
            selectToolbar.hidden = true;
            parent.style.display = 'none';
            parent.classList.remove('noevents');
            svg.classList.add('hidden');

            events.fire('transformHandler.pop');
        };
    }
}

export { MeasureTool };
