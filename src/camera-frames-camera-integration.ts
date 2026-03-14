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

export {
    applyCustomFrustumProjection,
    resolveLockFramingAspect,
    sanitizeNearOverride
};
export type { CameraCustomFrustum };
