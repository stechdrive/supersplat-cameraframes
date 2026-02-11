import { Mat4 } from 'playcanvas';

import { MIN_NEAR_CLIP } from './clip-constants';

type CameraFramesAspectLockInfo = { aspect: number } | null;

type CameraFramesSceneLike = {
    targetSize?: { width: number; height: number } | null;
    events?: {
        invoke?: (name: string) => unknown;
    };
};

type CameraFramesTargetSize = { width: number; height: number } | null | undefined;

type CameraFramesLockFovAxis = 'vertical' | 'horizontal' | undefined;

type CameraCustomFrustum = {
    left: number;
    right: number;
    bottom: number;
    top: number;
    near: number;
    far: number;
};

const sanitizeNearOverride = (value: number | null | undefined) => {
    return (typeof value === 'number' && isFinite(value)) ? Math.max(MIN_NEAR_CLIP, value) : null;
};

const resolveCameraFramesTargetSize = (
    overrideTargetSize: CameraFramesTargetSize,
    scene: CameraFramesSceneLike | null | undefined
) => {
    return overrideTargetSize ?? scene?.targetSize ?? null;
};

const applyCustomFrustumProjection = (
    camera: {
        calculateProjection: ((projMat: Mat4, view?: number) => void) | null;
    } & Record<string, any>,
    frustum: CameraCustomFrustum | null
) => {
    if (frustum) {
        camera.calculateProjection = (projMat: Mat4, _view?: number) => {
            projMat.setFrustum(frustum.left, frustum.right, frustum.bottom, frustum.top, frustum.near, frustum.far);
        };
    } else {
        camera.calculateProjection = null;
    }
    camera._projMatDirty = true;
};

const resolveLockFramingAspect = (
    scene: CameraFramesSceneLike | null | undefined,
    targetSize: CameraFramesTargetSize,
    lockFraming: boolean,
    lockFovAxis: CameraFramesLockFovAxis
) => {
    if (!lockFraming) {
        const size = targetSize ?? scene?.targetSize;
        const aspect = (size && size.width > 0 && size.height > 0) ? (size.width / size.height) : null;
        return {
            lockedAspectRatio: null as number | null,
            aspectRatio: aspect,
            horizontalFov: null as boolean | null
        };
    }

    let aspect: number | null = null;

    const aspectInfo = scene?.events?.invoke?.('cameraFrames.aspectLock') as CameraFramesAspectLockInfo;
    if (aspectInfo && typeof aspectInfo.aspect === 'number' && isFinite(aspectInfo.aspect) && aspectInfo.aspect > 0) {
        aspect = aspectInfo.aspect;
    } else {
        const size = targetSize ?? scene?.targetSize;
        if (size && size.width > 0 && size.height > 0) {
            aspect = size.width / size.height;
        }
    }

    return {
        lockedAspectRatio: aspect && isFinite(aspect) && aspect > 0 ? aspect : null,
        aspectRatio: aspect && isFinite(aspect) && aspect > 0 ? aspect : 0,
        horizontalFov: aspect && isFinite(aspect) && aspect > 0 ?
            (lockFovAxis === undefined ? true : lockFovAxis === 'horizontal') :
            null
    };
};

const resolveCameraFramesFovFactor = (
    fov: number,
    horizontalFov: boolean,
    aspectViewport: { enabled?: boolean; width?: number; height?: number } | null | undefined,
    scene: CameraFramesSceneLike | null | undefined,
    overrideTargetSize: CameraFramesTargetSize
) => {
    const cameraFramesEnabled = scene?.events?.invoke?.('cameraFrames.enabled') === true;
    if (!cameraFramesEnabled) {
        return Math.sin(fov * Math.PI / 360);
    }

    const targetSize = resolveCameraFramesTargetSize(overrideTargetSize, scene);
    const width = aspectViewport?.enabled ? aspectViewport.width : targetSize?.width;
    const height = aspectViewport?.enabled ? aspectViewport.height : targetSize?.height;
    const aspect = (width && height) ? (horizontalFov ? height / width : width / height) : 1;
    const adjustedFov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * aspect);
    return Math.sin(adjustedFov * 0.5);
};

const resolveCameraFramesFramingFactor = (lockFraming: boolean, fovFactor: number) => {
    if (lockFraming) {
        return 1;
    }
    return (typeof fovFactor === 'number' && isFinite(fovFactor) && fovFactor > 1e-6) ? fovFactor : 1;
};

const shouldDropOrthoForAngles = (azim: number, elev: number, currentAzim: number, currentElev: number) => {
    const angleDelta = (a: number, b: number) => {
        return Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
    };
    return angleDelta(azim, currentAzim) > 1e-4 || angleDelta(elev, currentElev) > 1e-4;
};

export {
    applyCustomFrustumProjection,
    resolveLockFramingAspect,
    resolveCameraFramesFovFactor,
    resolveCameraFramesFramingFactor,
    resolveCameraFramesTargetSize,
    sanitizeNearOverride,
    shouldDropOrthoForAngles
};
export type { CameraCustomFrustum };
