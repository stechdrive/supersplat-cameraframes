import type { CameraFramesController } from './camera-frames';
import type { CameraFramesHistory } from './camera-frames-history';
import type { CameraFramesStateBase, CameraPreset, ProjectionJson, RotationJson, Vec3Json } from './camera-frames-types';
import { cameraFramesVersion } from './camera-frames-version';
import { Events } from './events';
import type { Scene } from './scene';
import { localize } from './ui/localization';

const CAMERA_SAVE_TYPE = 'supersplat.camera-frames.main-camera';
const CAMERA_SAVE_VERSION = 2;
const CAMERA_SAVE_VERSION_V1 = 1;

type MainCameraJson = {
    transform: {
        position: Vec3Json;
        rotation: RotationJson;
    };
    projection: ProjectionJson;
    nearClip: number | null;
};

type CameraPoseJson = {
    focalPoint: Vec3Json;
    azim: number;
    elev: number;
    distance: number;
    roll: number;
    navMode: 'orbit' | 'fpv';
    fpvPosition?: Vec3Json;
    ortho?: boolean;
    lockFraming?: boolean;
};

type CameraSaveFileV1 = {
    type: typeof CAMERA_SAVE_TYPE;
    version: typeof CAMERA_SAVE_VERSION_V1;
    meta?: {
        app?: string;
        createdAt?: string;
        cameraFramesVersion?: string;
    };
    mainCamera: MainCameraJson;
    cameraFramesState: CameraFramesStateBase;
};

type CameraSaveFileV2 = {
    type: typeof CAMERA_SAVE_TYPE;
    version: typeof CAMERA_SAVE_VERSION;
    meta?: {
        app?: string;
        createdAt?: string;
        cameraFramesVersion?: string;
    };
    cameraPresets: CameraPreset[];
};

type FilePickerAcceptTypeCompat = {
    description?: string;
    accept: Record<`${string}/${string}`, `.${string}` | `.${string}`[]>;
};

const isObject = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const clampPitch = (pitch: number) => clamp(pitch, -89.9, 89.9);

const requireString = (value: unknown, label: string) => {
    if (typeof value !== 'string') {
        throw new Error(localize('cameraSave.invalidField', { field: label }));
    }
    return value;
};

const requireFiniteNumber = (value: unknown, label: string) => {
    if (typeof value !== 'number' || !isFinite(value)) {
        throw new Error(localize('cameraSave.invalidField', { field: label }));
    }
    return value;
};

const readNullableNumber = (value: unknown, label: string): number | null => {
    if (value === null || value === undefined) {
        return null;
    }
    return requireFiniteNumber(value, label);
};

const requireObject = (value: unknown, label: string) => {
    if (!isObject(value)) {
        throw new Error(localize('cameraSave.invalidField', { field: label }));
    }
    return value;
};

const requireVec3 = (value: unknown, label: string): Vec3Json => {
    const obj = requireObject(value, label);
    const x = requireFiniteNumber(obj.x, `${label}.x`);
    const y = requireFiniteNumber(obj.y, `${label}.y`);
    const z = requireFiniteNumber(obj.z, `${label}.z`);
    return { x, y, z };
};

const requireCameraFramesStateBase = (value: unknown): CameraFramesStateBase => {
    const state = requireObject(value, 'cameraFramesState');

    if (typeof state.enabled !== 'boolean') {
        throw new Error(localize('cameraSave.invalidField', { field: 'cameraFramesState.enabled' }));
    }
    if (!isObject(state.renderBox)) {
        throw new Error(localize('cameraSave.invalidField', { field: 'cameraFramesState.renderBox' }));
    }
    if (!Array.isArray(state.frames)) {
        throw new Error(localize('cameraSave.invalidField', { field: 'cameraFramesState.frames' }));
    }
    if (!isObject(state.mask)) {
        throw new Error(localize('cameraSave.invalidField', { field: 'cameraFramesState.mask' }));
    }

    return state as unknown as CameraFramesStateBase;
};

const readMeta = (root: Record<string, unknown>) => (
    isObject(root.meta) ? {
        app: typeof root.meta.app === 'string' ? root.meta.app : undefined,
        createdAt: typeof root.meta.createdAt === 'string' ? root.meta.createdAt : undefined,
        cameraFramesVersion: typeof root.meta.cameraFramesVersion === 'string' ? root.meta.cameraFramesVersion : undefined
    } : undefined
);

const requireCameraSaveFileV1 = (root: Record<string, unknown>): CameraSaveFileV1 => {
    const mainCameraObj = requireObject(root.mainCamera, 'mainCamera');
    const transformObj = requireObject(mainCameraObj.transform, 'mainCamera.transform');
    const position = requireVec3(transformObj.position, 'mainCamera.transform.position');
    const rotationObj = requireObject(transformObj.rotation, 'mainCamera.transform.rotation');
    const rotation: RotationJson = {
        yaw: requireFiniteNumber(rotationObj.yaw, 'mainCamera.transform.rotation.yaw'),
        pitch: requireFiniteNumber(rotationObj.pitch, 'mainCamera.transform.rotation.pitch'),
        roll: requireFiniteNumber(rotationObj.roll, 'mainCamera.transform.rotation.roll')
    };

    const projectionObj = requireObject(mainCameraObj.projection, 'mainCamera.projection');
    const projectionType = requireString(projectionObj.type, 'mainCamera.projection.type');
    if (projectionType !== 'perspective' && projectionType !== 'ortho') {
        throw new Error(localize('cameraSave.invalidField', { field: 'mainCamera.projection.type' }));
    }
    const projection: ProjectionJson = projectionType === 'ortho' ? {
        type: 'ortho',
        orthoHalfHeight: requireFiniteNumber(projectionObj.orthoHalfHeight, 'mainCamera.projection.orthoHalfHeight')
    } : {
        type: 'perspective',
        baseFov: requireFiniteNumber(projectionObj.baseFov, 'mainCamera.projection.baseFov')
    };

    const nearClip = readNullableNumber(mainCameraObj.nearClip, 'mainCamera.nearClip');
    const cameraFramesState = requireCameraFramesStateBase(root.cameraFramesState);

    return {
        type: CAMERA_SAVE_TYPE,
        version: CAMERA_SAVE_VERSION_V1,
        meta: readMeta(root),
        mainCamera: {
            transform: { position, rotation },
            projection,
            nearClip
        },
        cameraFramesState
    };
};

const requireCameraPreset = (value: unknown): CameraPreset => {
    const preset = requireObject(value, 'cameraPreset');
    const id = requireString(preset.id, 'cameraPreset.id');
    const name = requireString(preset.name, 'cameraPreset.name');
    const mainCameraObj = requireObject(preset.mainCamera, 'cameraPreset.mainCamera');
    const transformObj = requireObject(mainCameraObj.transform, 'cameraPreset.mainCamera.transform');
    const position = requireVec3(transformObj.position, 'cameraPreset.mainCamera.transform.position');
    const rotationObj = requireObject(transformObj.rotation, 'cameraPreset.mainCamera.transform.rotation');
    const rotation: RotationJson = {
        yaw: requireFiniteNumber(rotationObj.yaw, 'cameraPreset.mainCamera.transform.rotation.yaw'),
        pitch: requireFiniteNumber(rotationObj.pitch, 'cameraPreset.mainCamera.transform.rotation.pitch'),
        roll: requireFiniteNumber(rotationObj.roll, 'cameraPreset.mainCamera.transform.rotation.roll')
    };

    const projectionObj = requireObject(mainCameraObj.projection, 'cameraPreset.mainCamera.projection');
    const projectionType = requireString(projectionObj.type, 'cameraPreset.mainCamera.projection.type');
    if (projectionType !== 'perspective' && projectionType !== 'ortho') {
        throw new Error(localize('cameraSave.invalidField', { field: 'cameraPreset.mainCamera.projection.type' }));
    }
    const projection: ProjectionJson = projectionType === 'ortho' ? {
        type: 'ortho',
        orthoHalfHeight: requireFiniteNumber(projectionObj.orthoHalfHeight, 'cameraPreset.mainCamera.projection.orthoHalfHeight')
    } : {
        type: 'perspective',
        baseFov: requireFiniteNumber(projectionObj.baseFov, 'cameraPreset.mainCamera.projection.baseFov')
    };

    const nearClip = readNullableNumber(mainCameraObj.nearClip, 'cameraPreset.mainCamera.nearClip');
    const cameraFramesState = requireCameraFramesStateBase(preset.cameraFramesState);
    const selected = typeof preset.selected === 'boolean' ? preset.selected : undefined;

    return {
        id,
        name,
        selected,
        mainCamera: {
            transform: { position, rotation },
            projection,
            nearClip
        },
        cameraFramesState
    };
};

const requireCameraSaveFileV2 = (root: Record<string, unknown>): CameraSaveFileV2 => {
    if (!Array.isArray(root.cameraPresets)) {
        throw new Error(localize('cameraSave.invalidField', { field: 'cameraPresets' }));
    }
    const cameraPresets = root.cameraPresets.map(preset => requireCameraPreset(preset));
    return {
        type: CAMERA_SAVE_TYPE,
        version: CAMERA_SAVE_VERSION,
        meta: readMeta(root),
        cameraPresets
    };
};

const requireCameraSaveFile = (value: unknown): CameraSaveFileV1 | CameraSaveFileV2 => {
    const root = requireObject(value, 'root');
    const type = requireString(root.type, 'type');
    if (type !== CAMERA_SAVE_TYPE) {
        throw new Error(localize('cameraSave.unsupportedType', { type }));
    }
    const version = requireFiniteNumber(root.version, 'version');
    if (version === CAMERA_SAVE_VERSION_V1) {
        return requireCameraSaveFileV1(root);
    }
    if (version === CAMERA_SAVE_VERSION) {
        return requireCameraSaveFileV2(root);
    }
    throw new Error(localize('cameraSave.unsupportedVersion', { version }));
};

const downloadTextFile = (filename: string, text: string, mime = 'application/json') => {
    const blob = new Blob([text], { type: mime });
    const url = window.URL.createObjectURL(blob);
    try {
        const el = document.createElement('a');
        el.download = filename;
        el.href = url;
        el.click();
    } finally {
        window.URL.revokeObjectURL(url);
    }
};

const pickFileWithInput = async (accept: string): Promise<File | null> => {
    return await new Promise<File | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;

        function cleanup() {
            window.removeEventListener('focus', onFocus, true);
            input.remove();
        }

        function onChange() {
            const file = input.files?.[0] ?? null;
            cleanup();
            resolve(file);
        }

        function onFocus() {
            // Safari: cancel may not trigger change, so resolve on focus return.
            window.setTimeout(() => {
                if (!input.files || input.files.length === 0) {
                    cleanup();
                    resolve(null);
                }
            }, 0);
        }

        input.addEventListener('change', onChange, { once: true });
        window.addEventListener('focus', onFocus, true);
        input.click();
    });
};

const removeExtension = (filename: string) => filename.replace(/\.[^./\\]+$/, '');

const formatTimestamp = (date: Date) => {
    const pad2 = (v: number) => v.toString().padStart(2, '0');
    const datePart = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
    const timePart = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
    return `${datePart}_${timePart}`;
};

const buildSuggestedFilename = (now: Date) => {
    return `camera-presets_${formatTimestamp(now)}.sscam`;
};

const createPresetId = () => {
    try {
        const uuid = (globalThis.crypto as any)?.randomUUID?.();
        if (typeof uuid === 'string' && uuid) {
            return uuid;
        }
    } catch {
        // ignore
    }
    return `preset_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
};

const distanceBetween = (a: Vec3Json, b: Vec3Json) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const worldDistanceToNormalized = (distance: number, pose: CameraPoseJson, scene: Scene) => {
    const framingFactor = pose.lockFraming ? 1 : (scene.camera.fovFactor || 1);
    const sceneRadius = scene.camera.sceneRadius || 1;
    const denom = sceneRadius || 1e-6;
    return Math.max(1e-6, distance * (framingFactor || 1e-6) / denom);
};

const rebuildMainCameraPose = (file: CameraSaveFileV1, scene: Scene): CameraPoseJson => {
    const pos = file.mainCamera.transform.position;
    const rot = file.mainCamera.transform.rotation;

    const basePose = (file.cameraFramesState as any)?.mainCameraPose;
    const tryReadPose = (): CameraPoseJson | null => {
        if (!isObject(basePose) || !isObject(basePose.focalPoint)) {
            return null;
        }
        try {
            return {
                focalPoint: requireVec3(basePose.focalPoint, 'cameraFramesState.mainCameraPose.focalPoint'),
                azim: requireFiniteNumber(basePose.azim, 'cameraFramesState.mainCameraPose.azim'),
                elev: requireFiniteNumber(basePose.elev, 'cameraFramesState.mainCameraPose.elev'),
                distance: requireFiniteNumber(basePose.distance, 'cameraFramesState.mainCameraPose.distance'),
                roll: requireFiniteNumber(basePose.roll, 'cameraFramesState.mainCameraPose.roll'),
                navMode: basePose.navMode === 'orbit' ? 'orbit' : 'fpv',
                fpvPosition: isObject(basePose.fpvPosition) ? requireVec3(basePose.fpvPosition, 'cameraFramesState.mainCameraPose.fpvPosition') : undefined,
                ortho: false,
                lockFraming: typeof basePose.lockFraming === 'boolean' ? basePose.lockFraming : undefined
            };
        } catch {
            return null;
        }
    };

    const pose: CameraPoseJson = tryReadPose() ?? {
        focalPoint: { x: pos.x, y: pos.y, z: pos.z },
        azim: rot.yaw,
        elev: rot.pitch,
        distance: 1,
        roll: rot.roll,
        navMode: 'fpv',
        fpvPosition: { x: pos.x, y: pos.y, z: pos.z },
        ortho: false,
        lockFraming: true
    };

    pose.azim = rot.yaw;
    pose.elev = clampPitch(rot.pitch);
    pose.roll = rot.roll;
    pose.ortho = false;

    let worldDistance = 1;
    if (pose.focalPoint && typeof pose.focalPoint.x === 'number') {
        worldDistance = distanceBetween(pos, pose.focalPoint);
    }
    if (!isFinite(worldDistance) || worldDistance <= 1e-6) {
        worldDistance = 1;
    }

    pose.distance = worldDistanceToNormalized(worldDistance, pose, scene);

    if (pose.navMode === 'fpv') {
        pose.fpvPosition = { x: pos.x, y: pos.y, z: pos.z };
    }

    return pose;
};

const normalizeProjectionIntoState = (state: CameraFramesStateBase, projection: ProjectionJson, fallbackBaseFov: number) => {
    const next = JSON.parse(JSON.stringify(state)) as CameraFramesStateBase;
    const rawBaseFov = projection.type === 'perspective' ? projection.baseFov : fallbackBaseFov;
    const baseFov = (typeof rawBaseFov === 'number' && isFinite(rawBaseFov)) ? rawBaseFov : fallbackBaseFov;
    next.renderBox.projection = {
        type: 'perspective',
        baseFov
    };
    return next;
};

const registerCameraSave = (events: Events, scene: Scene, cameraFramesController: CameraFramesController, cameraFramesHistory: CameraFramesHistory) => {
    const fileTypes: FilePickerAcceptTypeCompat[] = [
        {
            description: 'Camera Presets (.sscam)',
            accept: { 'application/json': ['.sscam'] }
        }
    ];

    const exportCameraPresets = async () => {
        const now = new Date();
        const suggestedName = buildSuggestedFilename(now);

        const state = cameraFramesController.snapshot();
        if (!state.cameraPresets.length) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error'),
                message: localize('cameraSave.emptyPresets')
            });
            return;
        }

        const file: CameraSaveFileV2 = {
            type: CAMERA_SAVE_TYPE,
            version: CAMERA_SAVE_VERSION,
            meta: {
                app: 'supersplat-cameraframes',
                createdAt: now.toISOString(),
                cameraFramesVersion
            },
            cameraPresets: state.cameraPresets
        };

        const text = JSON.stringify(file, null, 2);

        events.fire('startSpinner');
        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    id: 'SuperSplatCameraPresetsExport',
                    types: fileTypes,
                    suggestedName
                });
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
            } else {
                downloadTextFile(suggestedName, text);
            }
        } catch (error) {
            if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
                return;
            }
            console.error(error);
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error'),
                message: `${localize('cameraSave.exportFailed')}\n'${(error as Error)?.message ?? error}'`
            });
        } finally {
            events.fire('stopSpinner');
        }
    };

    const importCameraPresets = async () => {
        if (scene.camera.targetSize) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error-loading'),
                message: localize('cameraSave.importNotAllowedDuringRender')
            });
            return;
        }

        events.fire('startSpinner');
        try {
            let file: File | null = null;
            if (window.showOpenFilePicker) {
                const handles = await window.showOpenFilePicker({
                    id: 'SuperSplatCameraPresetsImport',
                    multiple: false,
                    types: fileTypes
                });
                if (!handles?.length) {
                    return;
                }
                file = await handles[0].getFile();
            } else {
                file = await pickFileWithInput('.sscam,application/json');
            }
            if (!file) {
                return;
            }

            const text = await file.text();
            const parsed = JSON.parse(text) as unknown;
            const cameraFile = requireCameraSaveFile(parsed);

            if ('cameraPresets' in cameraFile) {
                const selectedPresetId = cameraFile.cameraPresets.find(preset => preset.selected)?.id ?? null;
                cameraFramesHistory.record('cameraFrames.importCameraPresets', () => {
                    cameraFramesController.replaceCameraPresets(cameraFile.cameraPresets, selectedPresetId);
                });
            } else {
                const rebuiltPose = rebuildMainCameraPose(cameraFile, scene);
                const fallbackFov = (typeof scene.camera?.fov === 'number' && isFinite(scene.camera.fov)) ? scene.camera.fov : 60;
                const patchedState = normalizeProjectionIntoState(cameraFile.cameraFramesState, cameraFile.mainCamera.projection, fallbackFov);
                patchedState.mainCameraPose = rebuiltPose as any;
                patchedState.nearClip = cameraFile.mainCamera.nearClip;
                const nameSource = file?.name ? removeExtension(file.name).trim() : '';
                const presetName = nameSource || localize('panel.camera-frames.camera-presets.default-name', { index: 1 });
                const preset: CameraPreset = {
                    id: createPresetId(),
                    name: presetName,
                    selected: true,
                    mainCamera: cameraFile.mainCamera,
                    cameraFramesState: patchedState
                };
                cameraFramesHistory.record('cameraFrames.importCameraPresets', () => {
                    cameraFramesController.replaceCameraPresets([preset], preset.id);
                });
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            console.error(error);
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error-loading'),
                message: `'${(error as Error)?.message ?? error}'`
            });
        } finally {
            events.fire('stopSpinner');
        }
    };

    events.function('cameraSave.exportCameraPresets', exportCameraPresets);
    events.function('cameraSave.exportMainCamera', exportCameraPresets);
    events.function('cameraSave.importCameraPresets', importCameraPresets);
    events.function('cameraSave.importMainCamera', importCameraPresets);
};

export { registerCameraSave };
