import { Vec3, type CameraComponent } from 'playcanvas';

type CameraInteractionSource = {
    screenToWorld: (x: number, y: number, cameraz: number, out?: Vec3) => boolean;
    worldToScreenCss: (worldPos: Vec3, out?: Vec3) => Vec3;
};

const cameraCache = new WeakMap<CameraComponent, CameraComponent>();

export const createGizmoCamera = (base: CameraComponent, interaction: CameraInteractionSource): CameraComponent => {
    const cached = cameraCache.get(base);
    if (cached) {
        return cached;
    }

    const proxy = new Proxy(base, {
        get: (target, prop) => {
            if (prop === 'screenToWorld') {
                return (x: number, y: number, cameraz: number, out: Vec3 = new Vec3()) => {
                    interaction.screenToWorld(x, y, cameraz, out);
                    return out;
                };
            }
            if (prop === 'worldToScreen') {
                return (worldPos: Vec3, out: Vec3 = new Vec3()) => interaction.worldToScreenCss(worldPos, out);
            }
            return Reflect.get(target, prop, target);
        },
        set: (target, prop, value) => {
            return Reflect.set(target, prop, value, target);
        }
    });

    cameraCache.set(base, proxy);
    cameraCache.set(proxy, proxy);
    return proxy;
};
