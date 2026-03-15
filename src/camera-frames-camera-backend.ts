import type { CameraPoseSnapshot, EffectiveFrustum } from './camera-frames-types';

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
    allowViewportOrthoToggle: () => boolean;
    allowViewCube: () => boolean;
    getTargetSize: () => CameraFramesTargetSize;
    withTargetSize: (size: { width: number; height: number; }, fn: () => void) => void;
    setCustomFrustum: (frustum: EffectiveFrustum | null) => void;
    applyNearClipOverride: (stateEnabled: boolean, nearClip: number | null) => void;
    computeViewportNearCandidate: () => Promise<number | null>;
};

export type {
    CameraFramesApplyPoseOptions,
    CameraFramesCameraBackend,
    CameraFramesTargetSize
};
