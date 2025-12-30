import { Quat, Vec3 } from 'playcanvas';

import { DEG2RAD } from './camera-frames-constants';
import type { CameraBasis, CameraPoseSnapshot } from './camera-frames-types';
import type { Scene } from './scene';

export const clonePoseSnapshot = (pose: CameraPoseSnapshot | null | undefined): CameraPoseSnapshot | null => {
    if (!pose) {
        return null;
    }
    const vec = (v: any, fallback: { x: number; y: number; z: number }) => ({
        x: Number(v?.x ?? v?.[0] ?? fallback.x) || fallback.x,
        y: Number(v?.y ?? v?.[1] ?? fallback.y) || fallback.y,
        z: Number(v?.z ?? v?.[2] ?? fallback.z) || fallback.z
    });
    const focalPoint = vec(pose.focalPoint, { x: 0, y: 0, z: 0 });
    const fpv = pose.fpvPosition ? vec(pose.fpvPosition, focalPoint) : undefined;
    return {
        focalPoint,
        azim: Number(pose.azim ?? 0) || 0,
        elev: Number(pose.elev ?? 0) || 0,
        distance: Number(pose.distance ?? 1) || 1,
        roll: Number(pose.roll ?? 0) || 0,
        navMode: pose.navMode === 'fpv' ? 'fpv' : 'orbit',
        fpvPosition: fpv,
        ortho: pose.ortho ?? false,
        lockFraming: !!pose.lockFraming
    };
};

export const captureCameraPose = (scene: Scene): CameraPoseSnapshot | null => {
    const serialized = scene?.camera?.docSerialize?.();
    if (!serialized) {
        return null;
    }
    const vec = (v: any, fallback: { x: number; y: number; z: number }) => ({
        x: Number(v?.x ?? v?.[0] ?? fallback.x) || fallback.x,
        y: Number(v?.y ?? v?.[1] ?? fallback.y) || fallback.y,
        z: Number(v?.z ?? v?.[2] ?? fallback.z) || fallback.z
    });
    const focalPoint = vec(serialized.focalPoint, { x: 0, y: 0, z: 0 });
    const pose: CameraPoseSnapshot = {
        focalPoint,
        azim: Number(serialized.azim ?? 0) || 0,
        elev: Number(serialized.elev ?? 0) || 0,
        distance: Number(serialized.distance ?? 1) || 1,
        roll: Number(serialized.roll ?? 0) || 0,
        navMode: serialized.navMode === 'fpv' ? 'fpv' : 'orbit',
        ortho: !!serialized.ortho,
        lockFraming: !!scene.camera.lockFraming
    };
    if (serialized.fpvPosition) {
        pose.fpvPosition = vec(serialized.fpvPosition, focalPoint);
    }
    return clonePoseSnapshot(pose);
};

export const normalizeViewportPose = (pose: CameraPoseSnapshot, allowOrtho: boolean) => {
    pose.navMode = pose.navMode === 'fpv' ? 'fpv' : 'orbit';
    pose.ortho = !!pose.ortho;
    if (pose.navMode === 'fpv') {
        pose.ortho = false;
    }
    if (pose.ortho) {
        pose.navMode = 'orbit';
    }
    if (!allowOrtho) {
        pose.ortho = false;
    }
};

export const calcForwardVec = (result: Vec3, azim: number, elev: number) => {
    const ex = elev * DEG2RAD;
    const ey = azim * DEG2RAD;
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    result.set(-c1 * s2, s1, c1 * c2);
};

export const buildCameraBasis = (scene: Scene, pose: CameraPoseSnapshot | null): CameraBasis | null => {
    const snap = clonePoseSnapshot(pose);
    if (!snap) {
        return null;
    }
    const forward = new Vec3();
    calcForwardVec(forward, snap.azim, snap.elev);
    if (forward.lengthSq() > 0) {
        forward.normalize();
    }
    const yawPitch = new Quat();
    yawPitch.setFromEulerAngles(snap.elev, snap.azim, 0);
    const rollAxis = new Vec3(0, 0, -1);
    yawPitch.transformVector(rollAxis, rollAxis);
    const rollQuat = new Quat();
    rollQuat.setFromAxisAngle(rollAxis, snap.roll ?? 0);
    const rotation = new Quat();
    rotation.mul2(rollQuat, yawPitch);

    const right = new Vec3(1, 0, 0);
    rotation.transformVector(right, right);
    const up = new Vec3(0, 1, 0);
    rotation.transformVector(up, up);
    const forwardWorld = new Vec3(0, 0, -1);
    rotation.transformVector(forwardWorld, forwardWorld);

    const focalPoint = new Vec3(snap.focalPoint.x, snap.focalPoint.y, snap.focalPoint.z);
    const framingFactor = snap.lockFraming ? 1 : (scene.camera.fovFactor || 1);
    const worldDist = (snap.distance || 1) * (scene.camera.sceneRadius || 1) / (framingFactor || 1e-6);
    const position = new Vec3();
    if (snap.navMode === 'fpv') {
        const fpv = snap.fpvPosition ? new Vec3(snap.fpvPosition.x, snap.fpvPosition.y, snap.fpvPosition.z) : focalPoint.clone();
        position.copy(fpv);
    } else {
        position.copy(forward.mulScalar(worldDist).add(focalPoint));
    }

    return {
        position,
        focalPoint,
        rotation,
        forward: forwardWorld,
        right,
        up
    };
};

export const getPoseWorldDistance = (scene: Scene, pose: CameraPoseSnapshot | null) => {
    const snap = clonePoseSnapshot(pose);
    if (!snap) {
        return 0;
    }
    const framingFactor = snap.lockFraming ? 1 : (scene.camera.fovFactor || 1);
    const sceneRadius = scene.camera.sceneRadius || 1;
    return Math.max(1e-6, (snap.distance || 1) * sceneRadius / (framingFactor || 1e-6));
};

export const worldDistanceToNormalized = (scene: Scene, distance: number, pose: CameraPoseSnapshot | null) => {
    const snap = clonePoseSnapshot(pose);
    const framingFactor = snap?.lockFraming ? 1 : (scene.camera.fovFactor || 1);
    const sceneRadius = scene.camera.sceneRadius || 1;
    return Math.max(1e-6, distance * (framingFactor || 1e-6) / (sceneRadius || 1e-6));
};

export const poseToTransform = (scene: Scene, pose: CameraPoseSnapshot | null) => {
    const basis = buildCameraBasis(scene, pose);
    const snap = clonePoseSnapshot(pose);
    if (!basis || !snap) {
        return null;
    }
    return {
        position: { x: basis.position.x, y: basis.position.y, z: basis.position.z },
        rotation: { yaw: snap.azim ?? 0, pitch: snap.elev ?? 0, roll: snap.roll ?? 0 }
    };
};
