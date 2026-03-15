import {
    Mat4,
    PROJECTION_PERSPECTIVE,
    Vec3,
    Vec4,
    VIEW_CENTER,
    type CameraComponent
} from 'playcanvas';

type CameraInteractionSource = {
    screenToWorld: (x: number, y: number, cameraz: number, out?: Vec3) => boolean;
    worldToScreenCss: (worldPos: Vec3, out?: Vec3) => Vec3;
};

const cameraCache = new WeakMap<CameraComponent, CameraComponent>();

export const createGizmoCamera = (base: CameraComponent, interaction?: CameraInteractionSource): CameraComponent => {
    const cached = cameraCache.get(base);
    if (cached) {
        return cached;
    }

    const tmpProj = new Mat4();
    const viewInv = new Mat4();
    const view = new Mat4();
    const viewProj = new Mat4();
    const invViewProj = new Mat4();

    const clip = new Vec4();
    const world4 = new Vec4();
    const dir = new Vec3();
    const farWorld = new Vec3();
    const worldToScreen4 = new Vec4();

    const updateMatrices = () => {
        tmpProj.copy(base.projectionMatrix);
        base.calculateProjection?.(tmpProj, VIEW_CENTER);

        if (base.calculateTransform) {
            base.calculateTransform(viewInv, VIEW_CENTER);
        } else {
            viewInv.setTRS(base.entity.getPosition(), base.entity.getRotation(), Vec3.ONE);
        }

        view.copy(viewInv).invert();

        viewProj.mul2(tmpProj, view);
        invViewProj.copy(viewProj).invert();
    };

    const screenToWorld = (x: number, y: number, cameraz: number, out: Vec3 = new Vec3()) => {
        updateMatrices();

        const { width: cw, height: ch } = base.system.app.graphicsDevice.clientRect;
        const rect = base.rect;

        const nx = (x - rect.x * cw) / (rect.z * cw);
        const ny = 1 - (y - (1 - rect.y - rect.w) * ch) / (rect.w * ch);
        const ndcX = nx * 2 - 1;
        const ndcY = ny * 2 - 1;

        if (base.projection === PROJECTION_PERSPECTIVE) {
            clip.set(ndcX, ndcY, 1, 1);
            invViewProj.transformVec4(clip, world4);
            const iw = world4.w ? 1 / world4.w : 1;
            farWorld.set(world4.x * iw, world4.y * iw, world4.z * iw);

            const camPos = base.entity.getPosition();
            dir.sub2(farWorld, camPos).normalize();
            return out.copy(camPos).add(dir.mulScalar(cameraz));
        }

        const range = Math.max(1e-6, base.farClip - base.nearClip);
        const ndcZ = (cameraz / range) * 2 - 1;
        clip.set(ndcX, ndcY, ndcZ, 1);
        invViewProj.transformVec4(clip, world4);
        const iw = world4.w ? 1 / world4.w : 1;
        return out.set(world4.x * iw, world4.y * iw, world4.z * iw);
    };

    const worldToScreen = (worldPos: Vec3, out: Vec3 = new Vec3()) => {
        updateMatrices();

        const { width: cw, height: ch } = base.system.app.graphicsDevice.clientRect;
        const rect = base.rect;

        worldToScreen4.set(worldPos.x, worldPos.y, worldPos.z, 1);
        viewProj.transformVec4(worldToScreen4, worldToScreen4);
        const iw = worldToScreen4.w ? 1 / worldToScreen4.w : 1;

        const sx01 = (worldToScreen4.x * iw + 1) * 0.5;
        const sy01 = (1 - worldToScreen4.y * iw) * 0.5;

        out.x = sx01 * rect.z * cw + rect.x * cw;
        out.y = sy01 * rect.w * ch + (1 - rect.y - rect.w) * ch;
        out.z = worldToScreen4.z;
        return out;
    };

    const proxy = new Proxy(base, {
        get: (target, prop) => {
            if (prop === 'screenToWorld') {
                if (interaction) {
                    return (x: number, y: number, cameraz: number, out: Vec3 = new Vec3()) => {
                        interaction.screenToWorld(x, y, cameraz, out);
                        return out;
                    };
                }
                return screenToWorld;
            }
            if (prop === 'worldToScreen') {
                if (interaction) {
                    return (worldPos: Vec3, out: Vec3 = new Vec3()) => interaction.worldToScreenCss(worldPos, out);
                }
                return worldToScreen;
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
