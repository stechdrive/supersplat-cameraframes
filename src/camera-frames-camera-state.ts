import { Entity, Quat, Vec3 } from 'playcanvas';

const rollAxis = new Vec3();
const quatYawPitch = new Quat();
const quatRoll = new Quat();
const quatFinal = new Quat();

const calcForwardVec = (out: Vec3, azim: number, elev: number) => {
    const ex = elev * Math.PI / 180;
    const ey = azim * Math.PI / 180;
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    out.set(-c1 * s2, s1, c1 * c2);
};

const resolveCameraPositionWorldFromState = (
    out: Vec3,
    mode: 'orbit' | 'fpv',
    fpvPosition: Vec3,
    azimElev: { azim: number; elev: number },
    distNorm: number,
    sceneRadius: number,
    framingFactor: number,
    focalPoint: Vec3
) => {
    if (mode === 'fpv') {
        out.copy(fpvPosition);
        return out;
    }

    calcForwardVec(out, azimElev.azim, azimElev.elev);
    out.mulScalar(distNorm * sceneRadius / framingFactor);
    out.add(focalPoint);
    return out;
};

const applyCameraOrientation = (
    entity: Entity,
    azimElev: { azim: number; elev: number },
    rollDeg: number
) => {
    quatYawPitch.setFromEulerAngles(azimElev.elev, azimElev.azim, 0);

    rollAxis.set(0, 0, -1);
    quatYawPitch.transformVector(rollAxis, rollAxis);

    quatRoll.setFromAxisAngle(rollAxis, rollDeg);
    quatFinal.mul2(quatRoll, quatYawPitch);
    entity.setRotation(quatFinal);
};

const resolveCameraFramesOrthoHeight = (
    lockFraming: boolean,
    navMode: 'orbit' | 'fpv',
    targetSize: { width: number; height: number } | null | undefined,
    distanceNorm: number,
    sceneRadius: number,
    framingFactor: number,
    fov: number,
    horizontalFov: boolean
) => {
    if (lockFraming || navMode === 'fpv') {
        return null;
    }

    const aspect = (targetSize && targetSize.width > 0) ? targetSize.height / targetSize.width : 1;
    return distanceNorm * sceneRadius / framingFactor * (fov / 90) * (horizontalFov ? aspect : 1);
};

export {
    applyCameraOrientation,
    resolveCameraFramesOrthoHeight,
    resolveCameraPositionWorldFromState
};
