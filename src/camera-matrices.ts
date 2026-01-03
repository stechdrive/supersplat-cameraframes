import {
    Mat4,
    Vec3,
    VIEW_CENTER,
    type CameraComponent
} from 'playcanvas';

type CameraMatrices = {
    projection: Mat4;
    viewInv: Mat4;
    view: Mat4;
    viewProjection: Mat4;
};

const buildCameraMatrices = (camera: CameraComponent, out: CameraMatrices): boolean => {
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

export { buildCameraMatrices, type CameraMatrices };
