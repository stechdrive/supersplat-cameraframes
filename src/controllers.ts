import { Vec3 } from 'playcanvas';

import { Camera } from './camera';
import { isCtrlLike, modifiers } from './modifier-tracker';

const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();
const pivotPoint = new Vec3();
const pivotForward = new Vec3();

// calculate the distance between two 2d points
const dist = (x0: number, y0: number, x1: number, y1: number) => Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

class PointerController {
    update: (deltaTime: number) => void;
    destroy: () => void;

    constructor(camera: Camera, target: HTMLElement) {
        const navMode = () => camera.navMode ?? 'orbit';

        const orbit = (dx: number, dy: number) => {
            const azim = camera.azim - dx * camera.scene.config.controls.orbitSensitivity;
            const elev = camera.elevation - dy * camera.scene.config.controls.orbitSensitivity;
            camera.setAzimElev(azim, elev);
        };

        const pan = (x: number, y: number, dx: number, dy: number) => {
            // For panning to work at any zoom level, we use screen point to world projection
            // to work out how far we need to pan the pivotEntity in world space
            const c = camera.entity.camera;
            const framingFactor = camera.lockFraming ? 1 : (camera.fovFactor || 1);
            const distance = camera.distanceTween.value.distance * camera.sceneRadius / framingFactor;
            const targetSize = camera.targetSize ?? camera.scene.targetSize;
            const rectW = target.clientWidth || 1;
            const rectH = target.clientHeight || 1;
            const scaleX = rectW > 0 ? targetSize.width / rectW : 1;
            const scaleY = rectH > 0 ? targetSize.height / rectH : 1;
            const sx = x * scaleX;
            const sy = y * scaleY;
            const sdx = dx * scaleX;
            const sdy = dy * scaleY;

            c.screenToWorld(sx, sy, distance, fromWorldPoint);
            c.screenToWorld(sx - sdx, sy - sdy, distance, toWorldPoint);

            worldDiff.sub2(toWorldPoint, fromWorldPoint);
            worldDiff.add(camera.focalPoint);

            camera.setFocalPoint(worldDiff);
        };

        const zoom = (amount: number) => {
            camera.setDistance(camera.distance - (camera.distance * 0.999 + 0.001) * amount * camera.scene.config.controls.zoomSensitivity, 2);
        };

        const fpvLook = (dx: number, dy: number) => {
            const sens = camera.fpvLookSensitivity ?? 0.002;
            const azim = camera.azim - dx * sens * 57.2957795; // rad to deg
            const elev = camera.elevation - dy * sens * 57.2957795;
            camera.setAzimElev(azim, elev);
        };

        const fpvMove = (forward: number, right: number, up: number, scaleMul = 1) => {
            const base = camera.fpvSpeed ?? 1; // world units per step (scene-scale independent)
            const scale = base * scaleMul;
            camera.moveFpvLocal({
                forward: forward * scale,
                right: right * scale,
                up: up * scale
            });
        };

        const fpvWheelMove = (deltaY: number, slow: boolean) => {
            const wheelScale = camera.fpvWheelSpeed ?? 1;
            // wheel up (deltaY < 0) -> forward+, wheel down -> backward
            const forward = deltaY * 0.0016 * wheelScale; // 10x faster
            const mul = slow ? 0.1 : 1;
            fpvMove(forward, 0, 0, mul);
        };

        const setPivotPoint = (event: PointerEvent) => {
            const hit = camera.intersect(event.offsetX, event.offsetY);
            if (hit) {
                pivotPoint.copy(hit.position);
                return;
            }
            pivotPoint.copy(camera.entity.getPosition());
            pivotForward.copy(camera.entity.forward).mulScalar(camera.sceneRadius * 2);
            pivotPoint.add(pivotForward);
        };

        // mouse state
        let pressedButton = -1;  // no button pressed, otherwise 0, 1, or 2
        let x: number, y: number;
        // fpv-only middle-drag tracking
        let mmbX = 0, mmbY = 0, mmbActive = false;
        let isPivoting = false;

        // touch state
        let touches: { id: number, x: number, y: number}[] = [];
        let midx: number, midy: number, midlen: number;

        const releaseMouseInteraction = (event: PointerEvent) => {
            pressedButton = -1;
            isPivoting = false;
            if (target.hasPointerCapture(event.pointerId)) {
                target.releasePointerCapture(event.pointerId);
            }
            if (document.pointerLockElement === target && navMode() === 'fpv') {
                document.exitPointerLock?.();
            }
        };

        const pointerdown = (event: PointerEvent) => {
            const modState = modifiers.read(event);
            if (event.pointerType === 'mouse') {
                // If a button is already pressed, ignore this press
                if (pressedButton !== -1) {
                    return;
                }
                const pivotDrag = navMode() === 'fpv' && isCtrlLike(modState) && event.button === 0;
                target.setPointerCapture(event.pointerId);
                pressedButton = event.button;
                x = event.offsetX;
                y = event.offsetY;
                isPivoting = false;
                if (navMode() === 'fpv') {
                    mmbX = event.offsetX;
                    mmbY = event.offsetY;
                    mmbActive = false;
                }
                if (pivotDrag) {
                    setPivotPoint(event);
                    isPivoting = true;
                    return;
                }
                if (pressedButton === 0 && navMode() === 'fpv') {
                    // request pointer lock for look
                    target.requestPointerLock?.();
                }
            } else if (event.pointerType === 'touch') {
                if (touches.length === 0) {
                    target.setPointerCapture(event.pointerId);
                }
                touches.push({
                    x: event.offsetX,
                    y: event.offsetY,
                    id: event.pointerId
                });

                if (touches.length === 2) {
                    midx = (touches[0].x + touches[1].x) * 0.5;
                    midy = (touches[0].y + touches[1].y) * 0.5;
                    midlen = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
                }
            }
        };

        const pointerup = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                // Only release if this is the button that was initially pressed
                if (event.button === pressedButton || event.buttons === 0) {
                    releaseMouseInteraction(event);
                }
            } else {
                touches = touches.filter(touch => touch.id !== event.pointerId);
                if (touches.length === 0) {
                    target.releasePointerCapture(event.pointerId);
                }
            }
        };

        const pointermove = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') {
                // Only process if we're tracking a button
                if (pressedButton === -1) {
                    return;
                }
                const modState = modifiers.read(event);

                // Verify the button we're tracking is still pressed
                // 1 = left button, 4 = middle button, 2 = right button
                const buttonMask = [1, 4, 2][pressedButton];
                if ((event.buttons & buttonMask) === 0) {
                    // Button is no longer pressed, clean up
                    releaseMouseInteraction(event);
                    return;
                }

                const dx = event.offsetX - x;
                const dy = event.offsetY - y;
                x = event.offsetX;
                y = event.offsetY;

                // right button can be used to orbit with ctrl key and to zoom with alt | meta key
                const mod = pressedButton === 2 ?
                    (modState.shift || modState.ctrl ? 'orbit' :
                        (modState.alt || modState.meta ? 'zoom' : null)) :
                    null;

                if (navMode() === 'fpv') {
                    if (pressedButton === 0) { // LMB look / pivot
                        const wantPivot = isCtrlLike(modState);
                        if (wantPivot) {
                            if (!isPivoting) {
                                setPivotPoint(event);
                                isPivoting = true;
                                if (document.pointerLockElement === target) {
                                    document.exitPointerLock?.();
                                }
                                // avoid a jump on first pivot frame
                                x = event.offsetX;
                                y = event.offsetY;
                            }
                            const sens = camera.scene.config.controls.orbitSensitivity;
                            camera.orbitAround(pivotPoint, dx * sens, dy * sens);
                            return;
                        }

                        if (isPivoting && !wantPivot) {
                            isPivoting = false;
                            x = event.offsetX;
                            y = event.offsetY;
                        }

                        if (document.pointerLockElement !== target) {
                            target.requestPointerLock?.();
                        }

                        const mdx = document.pointerLockElement === target ? event.movementX : dx;
                        const mdy = document.pointerLockElement === target ? event.movementY : dy;
                        fpvLook(mdx, mdy);
                    } else if (pressedButton === 2) { // RMB strafe/up
                        const sdx = event.offsetX - mmbX;
                        const sdy = event.offsetY - mmbY;
                        const moveMag = Math.abs(sdx) + Math.abs(sdy);
                        mmbX = event.offsetX;
                        mmbY = event.offsetY;
                        if (!mmbActive) {
                            // consume first move after press to avoid jump
                            mmbActive = true;
                            return;
                        }
                        if (moveMag < 0.5) {
                            return;
                        }
                        const slow = modState.alt || modState.meta;
                        const factor = 0.02; // 10x faster
                        const maxStep = 10.0;  // cap per event
                        const right = Math.max(-maxStep, Math.min(maxStep, -sdx * factor));
                        const up = Math.max(-maxStep, Math.min(maxStep, sdy * factor));
                        fpvMove(0, right, up, slow ? 0.1 : 1);
                    }
                } else {
                    if (mod === 'orbit' || (mod === null && pressedButton === 0)) {
                        orbit(dx, dy);
                    } else if (mod === 'zoom' || (mod === null && pressedButton === 1)) {
                        zoom(dy * -0.02);
                    } else if (mod === 'pan' || (mod === null && pressedButton === 2)) {
                        pan(x, y, dx, dy);
                    }
                }
            } else {
                if (touches.length === 1) {
                    const touch = touches[0];
                    const dx = event.offsetX - touch.x;
                    const dy = event.offsetY - touch.y;
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;
                    orbit(dx, dy);
                } else if (touches.length === 2) {
                    const touch = touches[touches.map(t => t.id).indexOf(event.pointerId)];
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;

                    const mx = (touches[0].x + touches[1].x) * 0.5;
                    const my = (touches[0].y + touches[1].y) * 0.5;
                    const ml = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);

                    pan(mx, my, (mx - midx), (my - midy));
                    zoom((ml - midlen) * 0.01);

                    midx = mx;
                    midy = my;
                    midlen = ml;
                }
            }
        };

        // fuzzy detection of mouse wheel events vs trackpad events
        const isMouseEvent = (deltaX: number, deltaY: number) => {
            return (Math.abs(deltaX) > 50 && deltaY === 0) ||
                   (Math.abs(deltaY) > 50 && deltaX === 0) ||
                   (deltaX === 0 && deltaY !== 0) && !Number.isInteger(deltaY);
        };

        const wheel = (event: WheelEvent) => {
            const { deltaX, deltaY } = event;
            const modState = modifiers.read(event);

            if (navMode() === 'fpv') {
                fpvWheelMove(deltaY, modState.alt || modState.meta);
            } else {
                if (isMouseEvent(deltaX, deltaY)) {
                    zoom(deltaY * -0.002);
                } else if (isCtrlLike(modState)) {
                    zoom(deltaY * -0.02);
                } else if (modState.shift) {
                    pan(event.offsetX, event.offsetY, deltaX, deltaY);
                } else {
                    orbit(deltaX, deltaY);
                }
            }

            event.preventDefault();
        };

        // FIXME: safari sends canvas as target of dblclick event but chrome sends the target element
        const canvas = camera.scene.app.graphicsDevice.canvas;

        const dblclick = (event: globalThis.MouseEvent) => {
            if (navMode() === 'orbit' && (event.target === target || event.target === canvas)) {
                camera.pickFocalPoint(event.offsetX, event.offsetY);
            }
        };

        // key state
        const keys: any = {
            ArrowUp: 0,
            ArrowDown: 0,
            ArrowLeft: 0,
            ArrowRight: 0
        };

        const keydown = (event: KeyboardEvent) => {
            if (keys.hasOwnProperty(event.key) && event.target === document.body) {
                const modState = modifiers.read(event);
                keys[event.key] = modState.shift ? 10 : ((isCtrlLike(modState) || modState.alt) ? 0.1 : 1);
            }
        };

        const keyup = (event: KeyboardEvent) => {
            if (keys.hasOwnProperty(event.key)) {
                keys[event.key] = 0;
            }
        };

        this.update = (deltaTime: number) => {
            const x = keys.ArrowRight - keys.ArrowLeft;
            const z = keys.ArrowDown - keys.ArrowUp;

            if (x || z) {
                const factor = deltaTime * camera.flySpeed;
                const worldTransform = camera.entity.getWorldTransform();
                const xAxis = worldTransform.getX().mulScalar(x * factor);
                const zAxis = worldTransform.getZ().mulScalar(z * factor);
                const p = camera.focalPoint.add(xAxis).add(zAxis);
                camera.setFocalPoint(p);
            }
        };

        let destroy: () => void = null;

        const wrap = (target: any, name: string, fn: any, options?: any) => {
            const callback = (event: any) => {
                camera.scene.events.fire('camera.controller', name);
                fn(event);
            };
            target.addEventListener(name, callback, options);
            destroy = () => {
                destroy?.();
                target.removeEventListener(name, callback);
            };
        };

        wrap(target, 'pointerdown', pointerdown);
        wrap(target, 'pointerup', pointerup);
        wrap(target, 'pointermove', pointermove);
        wrap(target, 'wheel', wheel, { passive: false });
        wrap(target, 'dblclick', dblclick);
        wrap(document, 'keydown', keydown);
        wrap(document, 'keyup', keyup);

        this.destroy = destroy;
    }
}

export { PointerController };
