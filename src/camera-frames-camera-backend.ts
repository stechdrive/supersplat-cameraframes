import { Vec3 } from 'playcanvas';

import {
    applyNearClipOverride,
    captureCameraPose,
    clonePoseSnapshot,
    computeViewportNearCandidate,
    normalizeViewportPose
} from './camera-frames-camera';
import type { CameraPoseSnapshot, EffectiveFrustum } from './camera-frames-types';
import type { Events } from './events';
import type { Scene } from './scene';

type CameraFramesApplyPoseOptions = {
    damp?: number;
    silent?: boolean;
    allowOrtho?: boolean;
};

type CameraFramesTargetSize = {
    width: number;
    height: number;
} | null;

type CameraFramesCameraBackend = {
    capturePose: () => CameraPoseSnapshot | null;
    applyPose: (pose: CameraPoseSnapshot | null | undefined, options?: CameraFramesApplyPoseOptions) => void;
    getFov: () => number;
    getTargetSize: () => CameraFramesTargetSize;
    withTargetSize: (size: { width: number; height: number; }, fn: () => void) => void;
    setCustomFrustum: (frustum: EffectiveFrustum | null) => void;
    applyNearClipOverride: (stateEnabled: boolean, nearClip: number | null) => void;
    computeViewportNearCandidate: () => Promise<number | null>;
};

type CreateSupersplatCameraFramesCameraBackendParams = {
    scene: Scene;
    events: Events;
    withHistorySuppressed: (fn: () => void) => void;
    setApplyingPose: (value: boolean) => void;
    requestRender: () => void;
};

const createSupersplatCameraFramesCameraBackend = ({
    scene,
    events,
    withHistorySuppressed,
    setApplyingPose,
    requestRender
}: CreateSupersplatCameraFramesCameraBackendParams): CameraFramesCameraBackend => {
    return {
        capturePose: () => captureCameraPose(scene),
        applyPose: (pose, options) => {
            const target = clonePoseSnapshot(pose);
            if (!target) {
                return;
            }
            const camera = scene.camera;
            const allowOrtho = options?.allowOrtho !== false;
            normalizeViewportPose(target, allowOrtho);
            const damping = options?.damp ?? 0;
            const rollDamping = damping * (scene.config?.controls?.dampingFactor ?? 1);
            const navModeChanged = target.navMode !== camera.navMode;
            const useDamping = damping > 0 && !navModeChanged;
            setApplyingPose(true);
            try {
                withHistorySuppressed(() => {
                    if (useDamping) {
                        camera.setFocalPoint(new Vec3(target.focalPoint.x, target.focalPoint.y, target.focalPoint.z), damping);
                        camera.setAzimElevWithOptions(target.azim, target.elev, damping, { dropOrtho: !target.ortho });
                        camera.setDistance(target.distance, damping);
                        if (target.navMode === 'fpv' && target.fpvPosition) {
                            camera.setPositionWorld(new Vec3(target.fpvPosition.x, target.fpvPosition.y, target.fpvPosition.z));
                        }
                        if (target.roll !== undefined) {
                            camera.rollTween.goto({ roll: target.roll }, rollDamping);
                        }
                        if (allowOrtho) {
                            camera.ortho = !!target.ortho;
                        } else {
                            camera.ortho = false;
                        }
                    } else {
                        camera.docDeserialize({
                            focalPoint: target.focalPoint,
                            azim: target.azim,
                            elev: target.elev,
                            distance: target.distance,
                            roll: target.roll,
                            navMode: target.navMode,
                            fpvPosition: target.fpvPosition,
                            ortho: target.ortho
                        }, { allowOrtho, preserveNavMode: true, source: 'cameraFrames' });
                    }
                    if (target.navMode === 'orbit') {
                        camera.syncOrbitCache(target.distance, new Vec3(target.focalPoint.x, target.focalPoint.y, target.focalPoint.z));
                    }
                });
            } finally {
                setApplyingPose(false);
            }
            if (!options?.silent) {
                requestRender();
            }
        },
        getFov: () => {
            const value = events.invoke('camera.fov');
            return (typeof value === 'number' && isFinite(value)) ? value : (scene.camera?.fov ?? 60);
        },
        getTargetSize: () => (scene.camera.targetSize ? { ...scene.camera.targetSize } : null),
        withTargetSize: (size, fn) => {
            const prevTarget = scene.camera.targetSize ? { ...scene.camera.targetSize } : null;
            scene.camera.targetSize = size;
            try {
                fn();
            } finally {
                scene.camera.targetSize = prevTarget;
            }
        },
        setCustomFrustum: (frustum) => {
            events.fire('camera.setCustomFrustum', frustum ? {
                left: frustum.left,
                right: frustum.right,
                bottom: frustum.bottom,
                top: frustum.top,
                near: frustum.near,
                far: frustum.far
            } : null);
        },
        applyNearClipOverride: (stateEnabled, nearClip) => {
            applyNearClipOverride({ stateEnabled, nearClip, events });
        },
        computeViewportNearCandidate: () => computeViewportNearCandidate({ scene })
    };
};

export type {
    CameraFramesApplyPoseOptions,
    CameraFramesCameraBackend,
    CameraFramesTargetSize
};
export { createSupersplatCameraFramesCameraBackend };
