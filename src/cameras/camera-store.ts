import { resolveView, type FrameComposition, type ShotCamera } from './render-view';

export type ShotFrame = {
    id: string;
    pos: { x: number; y: number };
    scalePct: number;
    scaleK: number;
    baseSize: { w: number; h: number };
    order: number;
    selected?: boolean;
    rotationDeg?: number;
    anchor?: { x: number; y: number };
};

export type CameraRecord = {
    id: string;
    name: string;
    camera: ShotCamera;
    composition: FrameComposition;
    frames: ShotFrame[];
    referenceImagePresetId: string;
    referenceImageOverrides: Record<string, unknown>;
};

export type CameraDocument = {
    version: 1;
    cameras: CameraRecord[];
    outputCameraId: string | null;
};

export type CameraReference = { kind: 'viewport' } | { kind: 'shot'; cameraId: string };
export type PaneState = {
    id: string;
    camera: CameraReference;
    zoom: number;
    pan: { x: number; y: number };
};
export type CameraWorkspace = { split: boolean; activePaneId: string; panes: PaneState[] };

const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};

const requireId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (...values: number[]) => values.every(Number.isFinite);

export const createCamera = (id: string, name = 'Camera 1'): CameraRecord => ({
    id,
    name,
    camera: {
        id,
        position: [0, 0, 5],
        rotation: [0, 0, 0, 1],
        projection: 'perspective',
        fovY: 50,
        orthoHalfHeight: 2,
        near: 0.01,
        far: 10000
    },
    composition: { width: 1920, height: 1080, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5 },
    frames: [{ id: 'A', pos: { x: 0.5, y: 0.5 }, scalePct: 100, scaleK: 1, baseSize: { w: 1920, h: 1080 }, order: 0 }],
    referenceImagePresetId: '',
    referenceImageOverrides: {}
});

// Validate the entire candidate before replacing live state. Import and undo use
// the same path; malformed data cannot leave half a camera document installed.
export const normalizeDocument = (input: CameraDocument): CameraDocument => {
    if (input?.version !== 1 || !Array.isArray(input.cameras)) throw new Error('撮影カメラ文書の形式が不正です');
    const document = structuredClone(input);
    const ids = new Set<string>();
    for (const record of document.cameras) {
        if (!requireId(record.id) || ids.has(record.id) || record.camera?.id !== record.id) {
            throw new Error('撮影カメラIDが重複または不正です');
        }
        ids.add(record.id);
        if (typeof record.name !== 'string' || !record.name.trim()) throw new Error('撮影カメラ名が不正です');
        const view = resolveView(record.camera, record.composition);
        record.camera = structuredClone(view.shot);
        if (!Array.isArray(record.frames)) throw new Error('フレームが不正です');
        const frameIds = new Set<string>();
        for (const frame of record.frames) {
            if (!requireId(frame.id) || frameIds.has(frame.id) ||
                !finite(frame.pos?.x, frame.pos?.y, frame.scaleK, frame.scalePct, frame.baseSize?.w, frame.baseSize?.h, frame.order, frame.rotationDeg ?? 0) ||
                frame.scaleK <= 0 || frame.scalePct <= 0 || frame.baseSize.w <= 0 || frame.baseSize.h <= 0 ||
                (frame.anchor && !finite(frame.anchor.x, frame.anchor.y))) throw new Error('フレームの値またはIDが不正です');
            frameIds.add(frame.id);
        }
        record.referenceImagePresetId ??= '';
        record.referenceImageOverrides ??= {};
    }
    if (document.outputCameraId !== null && !ids.has(document.outputCameraId)) throw new Error('出力カメラが見つかりません');
    return freeze(document);
};

export const createWorkspace = (cameraId: string | null): CameraWorkspace => ({
    split: false,
    activePaneId: 'editor',
    panes: [
        { id: 'editor', camera: { kind: 'viewport' }, zoom: 1, pan: { x: 0, y: 0 } },
        { id: 'shot', camera: cameraId ? { kind: 'shot', cameraId } : { kind: 'viewport' }, zoom: 1, pan: { x: 0, y: 0 } }
    ]
});

export const reconcileWorkspace = (input: CameraWorkspace, document: CameraDocument): CameraWorkspace => {
    const workspace = structuredClone(input);
    const ids = new Set(document.cameras.map(camera => camera.id));
    const paneIds = new Set<string>();
    for (const pane of workspace.panes) {
        if (!requireId(pane.id) || paneIds.has(pane.id) || !finite(pane.zoom, pane.pan?.x, pane.pan?.y) || pane.zoom <= 0) {
            throw new Error('ビューポートの値またはIDが不正です');
        }
        paneIds.add(pane.id);
        if (!['shot', 'viewport'].includes(pane.camera.kind)) throw new Error('ビューポートのカメラ参照が不正です');
        if (pane.camera.kind === 'shot' && !ids.has(pane.camera.cameraId)) {
            pane.camera = document.outputCameraId ? { kind: 'shot', cameraId: document.outputCameraId } : { kind: 'viewport' };
        }
    }
    if (workspace.panes.length === 0 || !paneIds.has(workspace.activePaneId)) throw new Error('操作先のビューポートが見つかりません');
    return freeze(workspace);
};

export class CameraStore {
    private document: CameraDocument;
    private workspace: CameraWorkspace;
    private listeners = new Set<() => void>();
    revision = 0;
    workspaceRevision = 0;

    constructor(document: CameraDocument, workspace = createWorkspace(document.outputCameraId)) {
        this.document = normalizeDocument(document);
        this.workspace = reconcileWorkspace(workspace, this.document);
    }

    get state() {
        return this.document;
    }
    get views() {
        return this.workspace;
    }
    get(id: string) {
        return this.document.cameras.find(camera => camera.id === id);
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        this.listeners.forEach(listener => listener());
    }

    replace(candidate: CameraDocument) {
        const document = normalizeDocument(candidate);
        const workspace = reconcileWorkspace(this.workspace, document);
        this.document = document;
        this.workspace = workspace;
        this.revision++;
        this.workspaceRevision++;
        this.notify();
    }

    setWorkspace(candidate: CameraWorkspace) {
        this.workspace = reconcileWorkspace(candidate, this.document);
        this.workspaceRevision++;
        this.notify();
    }

    // Capture at first execution, inside the application's edit queue, so two
    // rapidly submitted commands cannot both start from the same stale state.
    edit(change: (draft: CameraDocument) => void) {
        let before: CameraDocument;
        let after: CameraDocument;
        return {
            name: 'camera',
            do: () => {
                if (!after) {
                    const draft = structuredClone(this.document);
                    change(draft);
                    after = normalizeDocument(draft);
                    before = this.document;
                }
                this.replace(after);
            },
            undo: () => {
                if (!before) throw new Error('未実行のカメラ編集は取り消せません');
                this.replace(before);
            }
        };
    }
}

export const cloneCamera = (document: CameraDocument, sourceId: string, id: string) => {
    const source = document.cameras.find(camera => camera.id === sourceId);
    if (!source || !requireId(id) || document.cameras.some(camera => camera.id === id)) throw new Error('複製する撮影カメラIDが不正です');
    const copy = structuredClone(source);
    copy.id = copy.camera.id = id;
    copy.name = `${source.name} copy`;
    document.cameras.push(copy);
    document.outputCameraId = id;
};

export const removeCamera = (document: CameraDocument, id: string) => {
    if (!document.cameras.some(camera => camera.id === id)) throw new Error('撮影カメラが見つかりません');
    document.cameras = document.cameras.filter(camera => camera.id !== id);
    if (document.outputCameraId === id) document.outputCameraId = document.cameras[0]?.id ?? null;
};

// Async readback is only usable while all three owners still match. A camera
// switch, view pan, undo or scene replacement invalidates an outstanding pick.
export const captureViewLease = (store: CameraStore, paneId: string, sceneRevision: number) => {
    const pane = store.views.panes.find(pane => pane.id === paneId);
    if (!pane) throw new Error('ビューポートが見つかりません');
    const revision = store.revision;
    const workspaceRevision = store.workspaceRevision;
    return Object.freeze({
        paneId,
        sceneRevision,
        revision,
        workspaceRevision,
        camera: freeze(structuredClone(pane.camera)),
        isCurrent: (currentSceneRevision: number) => currentSceneRevision === sceneRevision &&
            store.revision === revision && store.workspaceRevision === workspaceRevision
    });
};
