import { Vec3 } from 'playcanvas';

import { Camera } from './camera';
import { isCtrlLike, modifiers } from './modifier-tracker';

const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();
const pivotPoint = new Vec3();
const pivotForward = new Vec3();
const moveVec = new Vec3();

// calculate the distance between two 2d points
const dist = (x0: number, y0: number, x1: number, y1: number) => Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);

class PointerController {
    update: (deltaTime: number) => void;
    destroy: () => void;

    constructor(camera: Camera, target: HTMLElement) {
        const navMode = () => camera.navMode ?? 'orbit';
        const isFpvNav = () => navMode() === 'fpv';

        // Orbit mode: rotate camera around the focal point
        const orbit = (dx: number, dy: number) => {
            const azim = camera.azim - dx * camera.scene.config.controls.orbitSensitivity;
            const elev = camera.elevation - dy * camera.scene.config.controls.orbitSensitivity;
            camera.setAzimElev(azim, elev);
        };

        const look = (dx: number, dy: number) => {
            camera.look(dx, dy);
        };

        const pan = (x: number, y: number, dx: number, dy: number) => {
            // For panning to work at any zoom level, we use screen point to world projection
            // to work out how far we need to pan the pivotEntity in world space
            const c = camera.camera;
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
            // fallback pivot if async pick is not yet available
            pivotPoint.copy(camera.entity.getPosition());
            pivotForward.copy(camera.entity.forward).mulScalar(camera.sceneRadius * 2);
            pivotPoint.add(pivotForward);

            const rectW = target.clientWidth || 1;
            const rectH = target.clientHeight || 1;
            const nx = rectW > 0 ? event.offsetX / rectW : 0;
            const ny = rectH > 0 ? event.offsetY / rectH : 0;

            (async () => {
                const hit = await camera.intersect(nx, ny);
                if (hit) {
                    pivotPoint.copy(hit.position);
                }
            })().catch(() => {});
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
            if (document.pointerLockElement === target && isFpvNav()) {
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
                const pivotDrag = isFpvNav() && isCtrlLike(modState) && event.button === 0;
                target.setPointerCapture(event.pointerId);
                pressedButton = event.button;
                x = event.offsetX;
                y = event.offsetY;
                isPivoting = false;
                if (isFpvNav()) {
                    mmbX = event.offsetX;
                    mmbY = event.offsetY;
                    mmbActive = false;
                }
                if (pivotDrag) {
                    setPivotPoint(event);
                    isPivoting = true;
                    return;
                }
                if (pressedButton === 0 && isFpvNav()) {
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

                if (isFpvNav()) {
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
                    return;
                }

                if (camera.controlMode === 'fly') {
                    // Fly mode: left-drag to look around, middle to zoom, right works same as orbit
                    if (pressedButton === 0) {
                        look(dx, dy);
                    } else if (pressedButton === 1) {
                        zoom(dy * -0.02);
                    } else if (pressedButton === 2) {
                        // Right button: same behavior as orbit mode
                        const mod = modState.shift || modState.ctrl ? 'look' :
                            (modState.alt || modState.meta ? 'zoom' : 'pan');

                        if (mod === 'look') {
                            look(dx, dy);
                        } else if (mod === 'zoom') {
                            zoom(dy * -0.02);
                        } else {
                            pan(x, y, dx, dy);
                        }
                    }
                    return;
                }

                // Orbit mode: existing behavior
                // right button can be used to orbit with ctrl key and to zoom with alt | meta key
                const mod = pressedButton === 2 ?
                    (modState.shift || modState.ctrl ? 'orbit' :
                        (modState.alt || modState.meta ? 'zoom' : null)) :
                    null;

                if (mod === 'orbit' || (mod === null && pressedButton === 0)) {
                    orbit(dx, dy);
                } else if (mod === 'zoom' || (mod === null && pressedButton === 1)) {
                    zoom(dy * -0.02);
                } else if (mod === 'pan' || (mod === null && pressedButton === 2)) {
                    pan(x, y, dx, dy);
                }
            } else {
                if (touches.length === 1) {
                    const touch = touches[0];
                    const dx = event.offsetX - touch.x;
                    const dy = event.offsetY - touch.y;
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;

                    if (camera.controlMode === 'fly' && !isFpvNav()) {
                        look(dx, dy);
                    } else {
                        orbit(dx, dy);
                    }
                } else if (touches.length === 2) {
                    const touch = touches[touches.map(t => t.id).indexOf(event.pointerId)];
                    touch.x = event.offsetX;
                    touch.y = event.offsetY;

                    const mx = (touches[0].x + touches[1].x) * 0.5;
                    const my = (touches[0].y + touches[1].y) * 0.5;
                    const ml = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);

                    if (camera.controlMode === 'fly' && !isFpvNav()) {
                        // In fly mode, pinch moves forward/backward by moving focal point
                        const zoomDelta = (ml - midlen) * 0.01;
                        const worldTransform = camera.mainCamera.getWorldTransform();
                        const zAxis = worldTransform.getZ();
                        moveVec.copy(zAxis).mulScalar(-zoomDelta * camera.flySpeed);
                        const p = camera.focalPoint.add(moveVec);
                        camera.setFocalPoint(p);
                    } else {
                        pan(mx, my, (mx - midx), (my - midy));
                        zoom((ml - midlen) * 0.01);
                    }

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

            if (isFpvNav()) {
                fpvWheelMove(deltaY, modState.alt || modState.meta);
            } else if (camera.controlMode === 'fly') {
                // Fly mode: wheel moves forward/backward by moving focal point
                const factor = camera.flySpeed * 0.01;
                const worldTransform = camera.mainCamera.getWorldTransform();
                const zAxis = worldTransform.getZ();
                moveVec.copy(zAxis).mulScalar(deltaY * factor);
                const p = camera.focalPoint.add(moveVec);
                camera.setFocalPoint(p);
            } else {
                // Orbit mode: existing behavior
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
            if (event.target === target || event.target === canvas) {
                // Switch to orbit mode when double-clicking to focus
                if (camera.controlMode === 'fly') {
                    camera.scene.events.fire('camera.setControlMode', 'orbit');
                }
                if (!isFpvNav()) {
                    const nx = event.offsetX / target.clientWidth;
                    const ny = event.offsetY / target.clientHeight;
                    camera.pickFocalPoint(nx, ny);
                }
            }
        };

        // fly movement state (updated via shortcut events)
        let flyForward = false;
        let flyBackward = false;
        let flyLeft = false;
        let flyRight = false;
        let flyDown = false;
        let flyUp = false;

        // track modifier keys for speed control (updated via shortcut events)
        let shiftDown = false;
        let ctrlDown = false;

        // key state (arrow keys)
        const keys: any = {
            ArrowUp: 0,
            ArrowDown: 0,
            ArrowLeft: 0,
            ArrowRight: 0
        };

        // Clear all keys when window loses focus to prevent stuck keys
        const clearAllKeys = () => {
            flyForward = false;
            flyBackward = false;
            flyLeft = false;
            flyRight = false;
            flyDown = false;
            flyUp = false;
            shiftDown = false;
            ctrlDown = false;
            keys.ArrowUp = 0;
            keys.ArrowDown = 0;
            keys.ArrowLeft = 0;
            keys.ArrowRight = 0;
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

        // Helper to switch to fly mode when a fly key is pressed
        const handleFlyKey = (down: boolean) => {
            if (down && camera.controlMode !== 'fly' && !isFpvNav()) {
                camera.scene.events.fire('camera.setControlMode', 'fly');
            }
        };

        // Listen for fly movement shortcut events
        const events = camera.scene.events;

        const onFlyForward = (down: boolean) => {
            flyForward = down;
            handleFlyKey(down);
        };
        const onFlyBackward = (down: boolean) => {
            flyBackward = down;
            handleFlyKey(down);
        };
        const onFlyLeft = (down: boolean) => {
            flyLeft = down;
            handleFlyKey(down);
        };
        const onFlyRight = (down: boolean) => {
            flyRight = down;
            handleFlyKey(down);
        };
        const onFlyDown = (down: boolean) => {
            flyDown = down;
            handleFlyKey(down);
        };
        const onFlyUp = (down: boolean) => {
            flyUp = down;
            handleFlyKey(down);
        };
        const onModifierShift = (down: boolean) => {
            shiftDown = down;
        };
        const onModifierCtrl = (down: boolean) => {
            ctrlDown = down;
        };

        events.on('camera.fly.forward', onFlyForward);
        events.on('camera.fly.backward', onFlyBackward);
        events.on('camera.fly.left', onFlyLeft);
        events.on('camera.fly.right', onFlyRight);
        events.on('camera.fly.down', onFlyDown);
        events.on('camera.fly.up', onFlyUp);
        events.on('camera.modifier.shift', onModifierShift);
        events.on('camera.modifier.ctrl', onModifierCtrl);

        this.update = (deltaTime: number) => {
            if (camera.controlMode === 'fly' && !isFpvNav()) {
                // Fly mode: WASD for movement, Q/E for up/down - moves focal point
                const forward = (flyForward ? 1 : 0) - (flyBackward ? 1 : 0);
                const strafe = (flyRight ? 1 : 0) - (flyLeft ? 1 : 0);
                const vertical = (flyUp ? 1 : 0) - (flyDown ? 1 : 0);

                if (forward || strafe || vertical) {
                    // Calculate speed modifier based on current modifier key state
                    const speedMod = shiftDown ? 10 : (ctrlDown ? 0.1 : 1);
                    const factor = deltaTime * camera.flySpeed * speedMod;
                    const worldTransform = camera.worldTransform;

                    moveVec.set(0, 0, 0);

                    // Forward/backward along horizontal forward direction (fixed Y)
                    if (forward) {
                        const zAxis = worldTransform.getZ();
                        zAxis.y = 0;
                        zAxis.normalize();
                        moveVec.add(zAxis.mulScalar(-forward * factor));
                    }

                    // Strafe left/right (horizontal)
                    if (strafe) {
                        const xAxis = worldTransform.getX();
                        xAxis.y = 0;
                        xAxis.normalize();
                        moveVec.add(xAxis.mulScalar(strafe * factor));
                    }

                    // Up/down in world space
                    if (vertical) {
                        moveVec.y += vertical * factor;
                    }

                    // Move the focal point (camera follows due to orbit calculation)
                    const p = camera.focalPoint.add(moveVec);
                    camera.setFocalPoint(p);
                }
            }

            const x = keys.ArrowRight - keys.ArrowLeft;
            const z = keys.ArrowDown - keys.ArrowUp;

            if (x || z) {
                const factor = deltaTime * camera.flySpeed;
                const worldTransform = camera.worldTransform;
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
        wrap(window, 'blur', clearAllKeys);

        this.destroy = () => {
            destroy?.();
            events.off('camera.fly.forward', onFlyForward);
            events.off('camera.fly.backward', onFlyBackward);
            events.off('camera.fly.left', onFlyLeft);
            events.off('camera.fly.right', onFlyRight);
            events.off('camera.fly.down', onFlyDown);
            events.off('camera.fly.up', onFlyUp);
            events.off('camera.modifier.shift', onModifierShift);
            events.off('camera.modifier.ctrl', onModifierCtrl);
        };
    }
}

export { PointerController };
