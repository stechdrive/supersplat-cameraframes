import {
    Mat4,
    Vec3,
    VIEW_CENTER,
    type CameraComponent
} from 'playcanvas';

type CameraProjectionData = {
    projection: Mat4;
    viewInv: Mat4;
    view: Mat4;
    viewProjection: Mat4;
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
        projectionOverridden: false,
        nearClip: 0,
        farClip: 0
    };
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
    return true;
};

const buildCameraMatrices = buildCameraProjectionData;

export {
    buildCameraMatrices,
    buildCameraProjectionData,
    createCameraProjectionData,
    type CameraMatrices,
    type CameraProjectionData
};
