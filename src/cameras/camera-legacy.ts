import { Quat, Vec3 } from 'playcanvas';

import type { CameraFramesStateBase, CameraPoseSnapshot, CameraPreset, RotationJson } from '../camera-frames-types';
import { createCamera, defaultCameraSettings, normalizeDocument, type CameraDocument, type CameraRecord } from './camera-store';

export const quaternionFromAngles = ({ yaw, pitch, roll }: RotationJson) => {
    if (![yaw, pitch, roll].every(Number.isFinite)) throw new Error('撮影カメラの角度が不正です');
    return new Quat().setFromEulerAngles(pitch, yaw, 0).mul(new Quat().setFromAxisAngle(Vec3.BACK, -roll));
};

export const cameraAngles = (rotation: number[]): RotationJson => {
    const q = new Quat(...rotation);
    const forward = q.transformVector(new Vec3(0, 0, -1));
    const pitch = Math.asin(Math.max(-1, Math.min(1, forward.y))) * 180 / Math.PI;
    const yaw = Math.hypot(forward.x, forward.z) > 1e-7 ? Math.atan2(-forward.x, -forward.z) * 180 / Math.PI : 0;
    const residual = new Quat().setFromEulerAngles(pitch, yaw, 0).invert().mul(q);
    const roll = -2 * Math.atan2(residual.z, residual.w) * 180 / Math.PI;
    return { yaw, pitch, roll: ((roll + 180) % 360 + 360) % 360 - 180 };
};

export const horizontalFov = (record: CameraRecord) => 2 * Math.atan(Math.tan(record.camera.fovY * Math.PI / 360) * record.composition.width / record.composition.height) * 180 / Math.PI;
export const verticalFov = (horizontal: number, aspect: number) => 2 * Math.atan(Math.tan(horizontal * Math.PI / 360) / aspect) * 180 / Math.PI;

export const legacyFrameState = (record: CameraRecord): CameraFramesStateBase => {
    const { camera, composition: c } = record;
    const angles = cameraAngles(camera.rotation);
    const position = { x: camera.position[0], y: camera.position[1], z: camera.position[2] };
    return {
        enabled: true,
        renderBox: {
            baseSize: { w: c.width, h: c.height },
            scalePct: { x: c.scaleX * 100, y: c.scaleY * 100 },
            scale: { kx: c.scaleX, ky: c.scaleY },
            anchor: { ax: c.anchorX as 0 | 0.5 | 1, ay: c.anchorY as 0 | 0.5 | 1 },
            center: { cx: 0, cy: 0 },
            fitScale: 1,
            viewZoomPct: 100,
            lastViewport: { vw: 1, vh: 1 },
            projection: { type: camera.projection, baseFov: horizontalFov(record), orthoHalfHeight: camera.orthoHalfHeight }
        },
        frames: structuredClone(record.frames),
        ...structuredClone(record.settings ?? defaultCameraSettings()),
        nearClip: camera.near,
        // Compatibility display only. This orbit-shaped value is never a source
        // of v3 camera pose or serialization.
        mainCameraPose: { focalPoint: position,
            fpvPosition: position,
            azim: angles.yaw,
            elev: angles.pitch,
            roll: angles.roll,
            distance: 1,
            navMode: 'fpv',
            ortho: camera.projection === 'ortho' }
    };
};

export const legacyPreset = (record: CameraRecord, selected: boolean): CameraPreset => ({
    id: record.id,
    name: record.name,
    selected,
    referenceImagePresetId: record.referenceImagePresetId,
    referenceImageOverrides: structuredClone(record.referenceImageOverrides),
    mainCamera: {
        transform: { position: { x: record.camera.position[0], y: record.camera.position[1], z: record.camera.position[2] }, rotation: cameraAngles(record.camera.rotation) },
        projection: record.camera.projection === 'ortho' ? { type: 'ortho', orthoHalfHeight: record.camera.orthoHalfHeight } : { type: 'perspective', baseFov: horizontalFov(record) },
        nearClip: record.camera.near
    },
    cameraFramesState: legacyFrameState(record)
});

const vector = (value: any): [number, number, number] => {
    const result: [number, number, number] = [value?.x ?? value?.[0], value?.y ?? value?.[1], value?.z ?? value?.[2]];
    if (!result.every(Number.isFinite)) throw new Error('旧撮影カメラの位置が不正です');
    return result;
};

type LegacyDistance = number | { radius: number; fovFactor: number };

export const migrateLegacyCamera = (preset: Partial<CameraPreset>, id: string, distanceScale: LegacyDistance = 1): CameraRecord => {
    const record = createCamera(id, preset.name?.trim() || 'Camera 1');
    const state = preset.cameraFramesState;
    const rb = state?.renderBox;
    if (rb) {
        record.composition = { width: rb.baseSize.w,
            height: rb.baseSize.h,
            scaleX: rb.scale?.kx ?? rb.scalePct.x / 100,
            scaleY: rb.scale?.ky ?? rb.scalePct.y / 100,
            anchorX: rb.anchor?.ax ?? 0.5,
            anchorY: rb.anchor?.ay ?? 0.5 };
        record.frames = structuredClone(state.frames ?? record.frames);
    }
    const projection = preset.mainCamera?.projection ?? rb?.projection;
    if (projection) {
        record.camera.projection = projection.type;
        record.camera.fovY = verticalFov(('baseFov' in projection ? projection.baseFov : undefined) ?? 60, record.composition.width / record.composition.height);
        record.camera.orthoHalfHeight = ('orthoHalfHeight' in projection ? projection.orthoHalfHeight : undefined) ?? 1;
    }
    record.camera.near = preset.mainCamera?.nearClip ?? state?.nearClip ?? record.camera.near;
    const transform = preset.mainCamera?.transform;
    if (transform) {
        record.camera.position = vector(transform.position);
        record.camera.rotation = quaternionFromAngles(transform.rotation).toArray() as [number, number, number, number];
    } else if (state?.mainCameraPose) {
        const pose: CameraPoseSnapshot = state.mainCameraPose;
        record.camera.rotation = quaternionFromAngles({ yaw: pose.azim, pitch: pose.elev, roll: pose.roll ?? 0 }).toArray() as [number, number, number, number];
        if (pose.navMode === 'fpv' && pose.fpvPosition) {
            record.camera.position = vector(pose.fpvPosition);
        } else {
            const scale = typeof distanceScale === 'number' ? distanceScale :
                distanceScale.radius / (pose.lockFraming ? 1 : distanceScale.fovFactor);
            const offset = new Quat().setFromEulerAngles(pose.elev, pose.azim, 0).transformVector(new Vec3(0, 0, pose.distance * scale));
            record.camera.position = new Vec3(...vector(pose.focalPoint)).add(offset).toArray() as [number, number, number];
        }
    }
    record.referenceImagePresetId = preset.referenceImagePresetId ?? '';
    record.referenceImageOverrides = structuredClone(preset.referenceImageOverrides ?? {});
    for (const key of Object.keys(record.settings) as (keyof typeof record.settings)[]) {
        if (state?.[key] !== undefined) Object.assign(record.settings, { [key]: structuredClone(state[key]) });
    }
    return record;
};

// v1-v3 .sscam and cameraFrames from v0 .ssproj. A saved world transform
// always wins over the old orbit snapshot; zeros are meaningful values.
export const migrateLegacyCameras = (input: any, distanceScale: LegacyDistance = 1): CameraDocument => {
    if (!input || typeof input !== 'object') throw new Error('旧撮影カメラ文書の形式が不正です');
    let presets = input.cameraPresets as CameraPreset[];
    if (!Array.isArray(presets) || presets.length === 0) {
        presets = [{ id: 'legacy-camera',
            name: 'Camera 1',
            mainCamera: input.mainCamera,
            cameraFramesState: input.cameraFramesState ?? input,
            referenceImagePresetId: '' }];
    }
    const cameras = presets.map((preset, index) => migrateLegacyCamera(preset, preset.id || `legacy-camera-${index + 1}`, distanceScale));
    const active = input.selectedPresetId ?? presets.find(preset => preset.selected)?.id;
    return normalizeDocument({ version: 1,
        cameras,
        outputCameraId: cameras.some(camera => camera.id === active) ? active : cameras[0]?.id ?? null,
        exportTarget: input.exportTarget ?? 'current',
        exportPresetIds: input.exportPresetIds ?? [] });
};

export const expandFrame = (record: CameraRecord, scaleX: number, scaleY: number) => {
    const c = record.composition;
    // Keep every frame's base-image position when the output expands on a side.
    for (const frame of record.frames) {
        frame.pos = {
            x: (frame.pos.x * c.scaleX + c.anchorX * (scaleX - c.scaleX)) / scaleX,
            y: (frame.pos.y * c.scaleY + c.anchorY * (scaleY - c.scaleY)) / scaleY
        };
    }
    c.scaleX = scaleX;
    c.scaleY = scaleY;
};
