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

type CameraRayBasis = {
    nearOrigin: Vec3;
    nearX: Vec3;
    nearY: Vec3;
    farOrigin: Vec3;
    farX: Vec3;
    farY: Vec3;
};

type CameraRayBasisResolveOptions = {
    allowLegacyFallback: boolean;
    preferLegacyOrtho: boolean;
};

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

const createCameraRayBasis = (): CameraRayBasis => {
    return {
        nearOrigin: new Vec3(),
        nearX: new Vec3(),
        nearY: new Vec3(),
        farOrigin: new Vec3(),
        farX: new Vec3(),
        farY: new Vec3()
    };
};

const clipCoord = new Vec4();
const worldCoord = new Vec4();
const nearWorld = new Vec3();
const farWorld = new Vec3();
const cameraWorld = new Vec3();
const cameraAxisPoint = new Vec3();
const farWorldBR = new Vec3();
const farWorldTL = new Vec3();
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

const buildLegacyCameraRayBasis = (
    camera: CameraComponent,
    out: CameraRayBasis
) => {
    const points = camera.camera.getFrustumCorners(-100);
    const worldTransform = camera.entity.getWorldTransform();
    for (let i = 0; i < points.length; i++) {
        worldTransform.transformPoint(points[i], points[i]);
    }

    if (camera.projection === PROJECTION_ORTHOGRAPHIC) {
        out.nearOrigin.copy(points[3]);
        out.nearX.sub2(points[0], points[3]);
        out.nearY.sub2(points[2], points[3]);
    } else {
        worldTransform.getTranslation(out.nearOrigin);
        out.nearX.set(0, 0, 0);
        out.nearY.set(0, 0, 0);
    }

    out.farOrigin.copy(points[7]);
    out.farX.sub2(points[4], points[7]);
    out.farY.sub2(points[6], points[7]);
    return true;
};

const buildProjectionCameraRayBasis = (
    projectionData: CameraProjectionData,
    out: CameraRayBasis
) => {
    if (!unprojectClipCoordWithProjectionData(projectionData, -1, -1, 1, out.farOrigin) ||
        !unprojectClipCoordWithProjectionData(projectionData, 1, -1, 1, farWorldBR) ||
        !unprojectClipCoordWithProjectionData(projectionData, -1, 1, 1, farWorldTL)) {
        return false;
    }

    projectionData.viewInv.getTranslation(out.nearOrigin);
    out.nearX.set(0, 0, 0);
    out.nearY.set(0, 0, 0);
    out.farX.sub2(farWorldBR, out.farOrigin);
    out.farY.sub2(farWorldTL, out.farOrigin);
    return true;
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

const buildCameraRayWithProjectionData = (
    camera: CameraComponent,
    projectionData: CameraProjectionData,
    screenX: number,
    screenY: number,
    clientWidth: number,
    clientHeight: number,
    out: Ray
) => {
    if (!buildCameraProjectionData(camera, projectionData)) {
        return false;
    }

    return buildCameraRay(camera, projectionData, screenX, screenY, clientWidth, clientHeight, out);
};

const screenToWorldWithCameraProjectionData = (
    camera: CameraComponent,
    projectionData: CameraProjectionData,
    screenX: number,
    screenY: number,
    cameraZ: number,
    clientWidth: number,
    clientHeight: number,
    out: Vec3
) => {
    if (!buildCameraProjectionData(camera, projectionData)) {
        if (!projectionData.projectionOverridden) {
            camera.screenToWorld(screenX, screenY, cameraZ, out);
            return true;
        }
        return false;
    }

    return screenToWorldWithProjectionData(camera, projectionData, screenX, screenY, cameraZ, clientWidth, clientHeight, out);
};

const resolveCameraRayBasis = (
    camera: CameraComponent,
    projectionData: CameraProjectionData,
    out: CameraRayBasis,
    options: CameraRayBasisResolveOptions
) => {
    if (options.preferLegacyOrtho && camera.projection === PROJECTION_ORTHOGRAPHIC) {
        return buildLegacyCameraRayBasis(camera, out);
    }

    const projectionOk = buildCameraProjectionData(camera, projectionData);
    if (!projectionOk) {
        if (options.allowLegacyFallback && !projectionData.projectionOverridden) {
            return buildLegacyCameraRayBasis(camera, out);
        }
        return false;
    }

    if (buildProjectionCameraRayBasis(projectionData, out)) {
        return true;
    }

    return options.allowLegacyFallback ? buildLegacyCameraRayBasis(camera, out) : false;
};

const buildCameraMatrices = buildCameraProjectionData;

export {
    buildCameraRay,
    buildCameraRayWithProjectionData,
    buildCameraMatrices,
    buildCameraProjectionData,
    buildLegacyCameraRayBasis,
    buildProjectionCameraRayBasis,
    resolveCameraRayBasis,
    createCameraProjectionData,
    createCameraRayBasis,
    getOpticalAxisScreenCoordsWithProjectionData,
    screenToWorldWithCameraProjectionData,
    screenToWorldWithProjectionData,
    unprojectClipCoordWithProjectionData,
    worldToScreenWithProjectionData,
    type CameraRayBasis,
    type CameraRayBasisResolveOptions,
    type CameraMatrices,
    type CameraProjectionData
};
