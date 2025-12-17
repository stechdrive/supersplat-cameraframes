import type { CameraFramesController, CameraFramesState } from './camera-frames';
import type { CameraFramesHistory } from './camera-frames-history';
import { cameraFramesVersion } from './camera-frames-version';
import { Events } from './events';
import type { Scene } from './scene';
import { localize } from './ui/localization';

const CAMERA_SAVE_TYPE = 'supersplat.camera-frames.main-camera';
const CAMERA_SAVE_VERSION = 1;

type Vec3Json = { x: number; y: number; z: number; };

type RotationJson = { yaw: number; pitch: number; roll: number; };

type ProjectionJson =
    | { type: 'perspective'; baseFov: number; }
    | { type: 'ortho'; orthoHalfHeight: number; };

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
    version: typeof CAMERA_SAVE_VERSION;
    meta?: {
        app?: string;
        createdAt?: string;
        cameraFramesVersion?: string;
    };
    mainCamera: MainCameraJson;
    cameraFramesState: CameraFramesState;
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

const requireCameraFramesState = (value: unknown): CameraFramesState => {
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

    return state as unknown as CameraFramesState;
};

const requireCameraSaveFileV1 = (value: unknown): CameraSaveFileV1 => {
    const root = requireObject(value, 'root');
    const type = requireString(root.type, 'type');
    if (type !== CAMERA_SAVE_TYPE) {
        throw new Error(localize('cameraSave.unsupportedType', { type }));
    }
    const version = requireFiniteNumber(root.version, 'version');
    if (version !== CAMERA_SAVE_VERSION) {
        throw new Error(localize('cameraSave.unsupportedVersion', { version }));
    }
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
    const cameraFramesState = requireCameraFramesState(root.cameraFramesState);

    return {
        type: CAMERA_SAVE_TYPE,
        version: CAMERA_SAVE_VERSION,
        meta: isObject(root.meta) ? {
            app: typeof root.meta.app === 'string' ? root.meta.app : undefined,
            createdAt: typeof root.meta.createdAt === 'string' ? root.meta.createdAt : undefined,
            cameraFramesVersion: typeof root.meta.cameraFramesVersion === 'string' ? root.meta.cameraFramesVersion : undefined
        } : undefined,
        mainCamera: {
            transform: { position, rotation },
            projection,
            nearClip
        },
        cameraFramesState
    };
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

const buildSuggestedFilename = (events: Events, now: Date) => {
    const docName = (events.invoke('doc.name') as string | null) ?? null;
    const prefix = docName ? `${removeExtension(docName)}_` : '';
    return `${prefix}main-camera_${formatTimestamp(now)}.sscam`;
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
                ortho: typeof basePose.ortho === 'boolean' ? basePose.ortho : undefined,
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
        ortho: file.mainCamera.projection.type === 'ortho',
        lockFraming: true
    };

    pose.azim = rot.yaw;
    pose.elev = clampPitch(rot.pitch);
    pose.roll = rot.roll;
    pose.ortho = file.mainCamera.projection.type === 'ortho';

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

const normalizeProjectionIntoState = (state: CameraFramesState, projection: ProjectionJson) => {
    const next = JSON.parse(JSON.stringify(state)) as CameraFramesState;
    const rbProj = (next.renderBox?.projection ?? { type: 'perspective' as const }) as any;
    if (projection.type === 'ortho') {
        rbProj.type = 'ortho';
        rbProj.orthoHalfHeight = projection.orthoHalfHeight;
        delete rbProj.baseFov;
    } else {
        rbProj.type = 'perspective';
        rbProj.baseFov = projection.baseFov;
        delete rbProj.orthoHalfHeight;
    }
    next.renderBox.projection = rbProj;
    return next;
};

const registerCameraSave = (events: Events, scene: Scene, cameraFramesController: CameraFramesController, cameraFramesHistory: CameraFramesHistory) => {
    const fileTypes: FilePickerAcceptTypeCompat[] = [
        {
            description: 'Main Camera (.sscam)',
            accept: { 'application/json': ['.sscam'] }
        }
    ];

    events.function('cameraSave.exportMainCamera', async () => {
        const now = new Date();
        const suggestedName = buildSuggestedFilename(events, now);

        const state = cameraFramesController.snapshot();
        const mainTransform = (state.mainCameraPose ? (events.invoke('cameraFrames.mainTransform') as any) : null) ?? scene.camera.getTransform();
        const projection = state.renderBox?.projection?.type === 'ortho' ? {
            type: 'ortho' as const,
            orthoHalfHeight: Number(state.renderBox.projection.orthoHalfHeight ?? 1) || 1
        } : {
            type: 'perspective' as const,
            baseFov: Number(state.renderBox?.projection?.baseFov ?? 60) || 60
        };

        const file: CameraSaveFileV1 = {
            type: CAMERA_SAVE_TYPE,
            version: CAMERA_SAVE_VERSION,
            meta: {
                app: 'supersplat-cameraframes',
                createdAt: now.toISOString(),
                cameraFramesVersion
            },
            mainCamera: {
                transform: {
                    position: mainTransform.position,
                    rotation: mainTransform.rotation
                },
                projection,
                nearClip: state.nearClip ?? null
            },
            cameraFramesState: state
        };

        const text = JSON.stringify(file, null, 2);

        events.fire('startSpinner');
        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    id: 'SuperSplatMainCameraExport',
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
    });

    events.function('cameraSave.importMainCamera', async () => {
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
                    id: 'SuperSplatMainCameraImport',
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
            const cameraFile = requireCameraSaveFileV1(parsed);

            const rebuiltPose = rebuildMainCameraPose(cameraFile, scene);
            const patchedState = normalizeProjectionIntoState(cameraFile.cameraFramesState, cameraFile.mainCamera.projection);
            patchedState.mainCameraPose = rebuiltPose as any;
            patchedState.nearClip = cameraFile.mainCamera.nearClip;

            cameraFramesHistory.record('cameraFrames.importMainCamera', () => {
                cameraFramesController.applySnapshot(patchedState);
            });
            events.fire('cameraFrames.forceRefreshViewport');
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
    });
};

export { registerCameraSave };
