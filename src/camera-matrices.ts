import {
    Mat4,
    PROJECTION_ORTHOGRAPHIC,
    Ray,
    Vec3,
    Vec4,
    VIEW_CENTER,
    type CameraComponent
} from 'playcanvas';

type CameraProjectionData = {
    projection: Mat4;
    viewInv: Mat4;
    view: Mat4;
    viewProjection: Mat4;
    invViewProjection: Mat4;
    projectionOverridden: boolean;
    nearClip: number;
    farClip: number;
};

type CameraMatrices = CameraProjectionData;

const createCameraProjectionData = (): CameraProjectionData => {
    return {
        projection: new Mat4(),
        viewInv: new Mat4(),
        view: new Mat4(),
        viewProjection: new Mat4(),
        invViewProjection: new Mat4(),
        projectionOverridden: false,
        nearClip: 0,
        farClip: 0
    };
};

const clipCoord = new Vec4();
const worldCoord = new Vec4();
const nearWorld = new Vec3();
const farWorld = new Vec3();
const cameraWorld = new Vec3();
const cameraAxisPoint = new Vec3();
const rayPoint = new Vec3();
const screenRay = new Ray();

const unprojectClipCoord = (invViewProjection: Mat4, x: number, y: number, z: number, out: Vec3) => {
    clipCoord.set(x, y, z, 1);
    invViewProjection.transformVec4(clipCoord, worldCoord);
    if (!isFinite(worldCoord.w) || Math.abs(worldCoord.w) <= 1e-6) {
        return false;
    }
    const iw = 1 / worldCoord.w;
    out.set(worldCoord.x * iw, worldCoord.y * iw, worldCoord.z * iw);
    return true;
};

const unprojectClipCoordWithProjectionData = (
    projectionData: CameraProjectionData,
    x: number,
    y: number,
    z: number,
    out: Vec3
) => {
    return unprojectClipCoord(projectionData.invViewProjection, x, y, z, out);
};

const buildViewportCoords = (
    screenX: number,
    screenY: number,
    camera: CameraComponent,
    clientWidth: number,
    clientHeight: number
) => {
    const rect = camera.rect;
    if (!(clientWidth > 0 && clientHeight > 0 && rect.z > 0 && rect.w > 0)) {
        return null;
    }

    return {
        x: (screenX - rect.x * clientWidth) / (rect.z * clientWidth),
        y: 1 - (screenY - (1 - rect.y - rect.w) * clientHeight) / (rect.w * clientHeight)
    };
};

const buildCameraRay = (
    camera: CameraComponent,
    projectionData: CameraProjectionData,
    screenX: number,
    screenY: number,
    clientWidth: number,
    clientHeight: number,
    out: Ray
) => {
    if (!projectionData.projectionOverridden) {
        const cameraPos = camera.entity.getPosition();
        if (camera.projection === PROJECTION_ORTHOGRAPHIC) {
            camera.screenToWorld(screenX, screenY, -1.0, nearWorld);
            camera.screenToWorld(screenX, screenY, 1.0, farWorld);
            farWorld.sub(nearWorld).normalize();
            out.set(nearWorld, farWorld);
        } else {
            camera.screenToWorld(screenX, screenY, 1.0, rayPoint);
            rayPoint.sub(cameraPos).normalize();
            out.set(cameraPos, rayPoint);
        }
        return true;
    }

    const viewport = buildViewportCoords(screenX, screenY, camera, clientWidth, clientHeight);
    if (!viewport) {
        return false;
    }

    const clipX = viewport.x * 2 - 1;
    const clipY = viewport.y * 2 - 1;
    if (!unprojectClipCoordWithProjectionData(projectionData, clipX, clipY, -1, nearWorld) ||
        !unprojectClipCoordWithProjectionData(projectionData, clipX, clipY, 1, farWorld)) {
        return false;
    }

    if (camera.projection === PROJECTION_ORTHOGRAPHIC) {
        farWorld.sub(nearWorld).normalize();
        out.set(nearWorld, farWorld);
        return true;
    }

    projectionData.viewInv.getTranslation(cameraWorld);
    farWorld.sub(cameraWorld).normalize();
    out.set(cameraWorld, farWorld);
    return true;
};

const screenToWorldWithProjectionData = (
    camera: CameraComponent,
    projectionData: CameraProjectionData,
    screenX: number,
    screenY: number,
    cameraZ: number,
    clientWidth: number,
    clientHeight: number,
    out: Vec3
) => {
    if (!projectionData.projectionOverridden || camera.projection === PROJECTION_ORTHOGRAPHIC) {
        camera.screenToWorld(screenX, screenY, cameraZ, out);
        return true;
    }

    if (!buildCameraRay(camera, projectionData, screenX, screenY, clientWidth, clientHeight, screenRay)) {
        return false;
    }
    out.copy(screenRay.origin).add(rayPoint.copy(screenRay.direction).mulScalar(cameraZ));
    return true;
};

const worldToScreenWithProjectionData = (
    projectionData: CameraProjectionData,
    world: Vec3,
    out: Vec3
) => {
    clipCoord.set(world.x, world.y, world.z, 1);
    projectionData.viewProjection.transformVec4(clipCoord, clipCoord);
    const w = clipCoord.w;
    if (!isFinite(w) || Math.abs(w) <= 1e-6) {
        return false;
    }
    out.x = clipCoord.x / w * 0.5 + 0.5;
    out.y = 1.0 - (clipCoord.y / w * 0.5 + 0.5);
    out.z = clipCoord.z / w;
    return true;
};

const getOpticalAxisScreenCoordsWithProjectionData = (
    projectionData: CameraProjectionData,
    out: Vec3
) => {
    const axisDepth = Math.max(projectionData.nearClip * 2, 1);
    cameraAxisPoint.set(0, 0, -axisDepth);
    projectionData.viewInv.transformPoint(cameraAxisPoint, cameraWorld);
    return worldToScreenWithProjectionData(projectionData, cameraWorld, out);
};

const buildCameraProjectionData = (camera: CameraComponent, out: CameraProjectionData): boolean => {
    out.projectionOverridden = !!camera.calculateProjection;
    out.nearClip = camera.nearClip;
    out.farClip = camera.farClip;

    out.projection.copy(camera.projectionMatrix);
    camera.calculateProjection?.(out.projection, VIEW_CENTER);

    if (camera.calculateTransform) {
        camera.calculateTransform(out.viewInv, VIEW_CENTER);
    } else {
        out.viewInv.setTRS(camera.entity.getPosition(), camera.entity.getRotation(), Vec3.ONE);
    }

    out.view.copy(out.viewInv);
    if (!out.view.invert()) {
        return false;
    }

    out.viewProjection.mul2(out.projection, out.view);
    out.invViewProjection.copy(out.viewProjection);
    if (!out.invViewProjection.invert()) {
        return false;
    }
    return true;
};

const buildCameraMatrices = buildCameraProjectionData;

export {
    buildCameraRay,
    buildCameraMatrices,
    buildCameraProjectionData,
    createCameraProjectionData,
    getOpticalAxisScreenCoordsWithProjectionData,
    screenToWorldWithProjectionData,
    unprojectClipCoordWithProjectionData,
    worldToScreenWithProjectionData,
    type CameraMatrices,
    type CameraProjectionData
};
