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
    setFov: (value: number) => void;
    getTargetSize: () => CameraFramesTargetSize;
    withTargetSize: (size: { width: number; height: number; }, fn: () => void) => void;
    getTransform: () => { position: { x: number; y: number; z: number; }; rotation: { yaw: number; pitch: number; roll: number; }; };
    getNavMode: () => 'orbit' | 'fpv';
    ensureOrbitNavMode: (source?: string) => void;
    getOrtho: () => boolean;
    setOrtho: (value: boolean) => void;
    getLastOrbitWorldDistance: () => number;
    getSceneRadius: () => number;
    getForward: () => Vec3;
    getPosition: () => Vec3;
    setOrbitPivotDistance: (pivot: Vec3, distanceNorm: number, source?: string) => void;
    setCustomFrustum: (frustum: EffectiveFrustum | null) => void;
    setNearOverride: (value: number | null) => void;
    applyNearClipOverride: (stateEnabled: boolean, nearClip: number | null) => void;
    computeViewportNearCandidate: () => Promise<number | null>;
    setLockFraming: (value: boolean) => void;
    setLockFovAxis: (value: 'vertical' | 'horizontal' | undefined) => void;
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
        setFov: (value) => {
            withHistorySuppressed(() => {
                events.fire('camera.setFov', value);
            });
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
        getTransform: () => scene.camera.getTransform(),
        getNavMode: () => scene.camera.navMode,
        ensureOrbitNavMode: (source) => {
            if (scene.camera.navMode !== 'orbit') {
                scene.camera.setNavMode('orbit', { preservePose: true, source });
            }
        },
        getOrtho: () => !!scene.camera.ortho,
        setOrtho: (value) => {
            withHistorySuppressed(() => {
                scene.camera.ortho = value;
            });
        },
        getLastOrbitWorldDistance: () => scene.camera.getLastOrbitWorldDistance(),
        getSceneRadius: () => scene.camera.sceneRadius || 1,
        getForward: () => scene.camera.entity.forward.clone(),
        getPosition: () => scene.camera.entity.getPosition().clone(),
        setOrbitPivotDistance: (pivot, distanceNorm, source) => {
            scene.camera.setFocalPoint(pivot, 0);
            scene.camera.setDistance(distanceNorm, 0);
            if (scene.camera.navMode !== 'orbit') {
                scene.camera.setNavMode('orbit', { preservePose: true, source });
            }
            scene.camera.syncOrbitCache(distanceNorm, pivot);
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
        setNearOverride: (value) => {
            events.fire('camera.setNearOverride', value);
        },
        applyNearClipOverride: (stateEnabled, nearClip) => {
            applyNearClipOverride({ stateEnabled, nearClip, events });
        },
        computeViewportNearCandidate: () => computeViewportNearCandidate({ scene }),
        setLockFraming: (value) => {
            events.fire('camera.setLockFraming', value);
        },
        setLockFovAxis: (value) => {
            events.fire('camera.setLockFovAxis', value);
        }
    };
};

export type {
    CameraFramesApplyPoseOptions,
    CameraFramesCameraBackend,
    CameraFramesTargetSize
};
export { createSupersplatCameraFramesCameraBackend };
