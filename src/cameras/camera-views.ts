import { Layer, Vec4 } from 'playcanvas';

import { Camera } from '../camera';
import { EditHistory } from '../edit-history';
import { ElementType } from '../element';
import { Events } from '../events';
import { ProjectedSplatRenderer } from '../projected-splat-renderer';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { CameraStore, cloneCamera, createCamera, createWorkspace, removeCamera, type CameraDocument } from './camera-store';
import { resolveView } from './render-view';

export class CameraViews {
    readonly store: CameraStore;
    readonly shot: Camera;
    private lastViewKey = '';
    private sceneRevision = 0;
    private dragPane: 'editor' | 'shot' | null = null;
    private previewPan: { x: number; y: number; pan: { x: number; y: number } } | null = null;

    private constructor(private scene: Scene, private events: Events, private history: EditHistory) {
        const record = createCamera(crypto.randomUUID());
        this.store = new CameraStore({ version: 1, cameras: [record], outputCameraId: record.id });
        this.shot = new Camera(false);
    }

    static async create(scene: Scene, events: Events, history: EditHistory) {
        const views = new CameraViews(scene, events, history);
        const layer = new Layer({ name: 'ShotSplats' });
        scene.app.scene.layers.push(layer);
        const projector = new ProjectedSplatRenderer(scene, layer, false);
        scene.splatRenderers.add(projector);
        for (const splat of scene.getElementsByType(ElementType.splat) as Splat[]) projector.add(splat);
        views.shot.projector = projector;
        views.shot.splatLayer = layer;
        views.shot.active = false;
        views.shot.inputEnabled = false;
        await scene.add(views.shot);
        views.connect();
        return views;
    }

    get activeCamera() {
        return this.store.views.activePaneId === 'shot' && this.shot.active ? this.shot : this.scene.camera;
    }

    private connect() {
        const { scene, events, store } = this;
        events.function('cameraViews', () => this);
        events.function('cameraViews.activeCamera', () => this.activeCamera);
        events.function('shotCameras.state', () => store.state);
        events.function('shotCameras.edit', (change: (draft: CameraDocument) => void) => this.history.add(store.edit(change)));
        events.function('shotCameras.outputView', (id = store.state.outputCameraId) => {
            const record = store.get(id);
            if (!record) throw new Error('出力する撮影カメラがありません');
            return resolveView(record.camera, record.composition);
        });
        events.function('docSerialize.shotCameras', () => structuredClone(store.state));
        events.function('docDeserialize.shotCameras', (document: CameraDocument) => {
            store.replace(document);
            store.setWorkspace(createWorkspace(document.outputCameraId));
        });
        events.function('docSerialize.cameraWorkspace', () => structuredClone(store.views));
        events.function('docDeserialize.cameraWorkspace', (workspace: ReturnType<typeof createWorkspace>) => {
            if (workspace) store.setWorkspace(workspace);
        });

        let selectedShotId = store.state.outputCameraId;
        store.subscribe(() => {
            if (selectedShotId !== store.state.outputCameraId) {
                selectedShotId = store.state.outputCameraId;
                const workspace = structuredClone(store.views);
                workspace.panes.find(pane => pane.id === 'shot').camera = selectedShotId ? { kind: 'shot', cameraId: selectedShotId } : { kind: 'viewport' };
                store.setWorkspace(workspace);
                return;
            }
            this.prepare();
            scene.forceRender = true;
            events.fire('shotCameras.changed', store.state);
            events.fire('cameraViews.changed', this.activeCamera);
        });
        events.on('views.prepare', () => this.prepare());
        for (const event of ['scene.elementAdded', 'scene.elementRemoved', 'splat.replaced', 'splat.moved']) {
            events.on(event, () => this.sceneRevision++);
        }
        events.on('edit.apply', (op: { name: string }) => {
            if (!op.name.startsWith('select')) this.sceneRevision++;
        });

        const container = document.getElementById('canvas-container');
        const paneAt = (event: MouseEvent) => {
            if (!store.state.outputCameraId) return 'editor';
            if (!store.views.split) return store.views.activePaneId === 'shot' ? 'shot' : 'editor';
            const rect = container.getBoundingClientRect();
            return event.clientX - rect.left < rect.width / 2 ? 'editor' : 'shot';
        };
        // Capture the pane before tools or Engine gizmos receive the event, and
        // retain that owner through a drag across the divider.
        container.addEventListener('pointerdown', (event) => {
            if ((event.target as HTMLElement).closest('button, input, select, .pcui-panel')) return;
            const paneId = paneAt(event);
            this.dragPane = paneId;
            if (store.views.activePaneId !== paneId) store.setWorkspace({ ...structuredClone(store.views), activePaneId: paneId });
            events.fire('cameraViews.input', this.activeCamera);
            if (paneId === 'shot' && event.button === 1) {
                this.previewPan = { x: event.clientX, y: event.clientY, pan: { ...store.views.panes.find(pane => pane.id === 'shot').pan } };
                container.setPointerCapture(event.pointerId);
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
        container.addEventListener('pointermove', (event) => {
            if (this.previewPan) {
                const workspace = structuredClone(store.views);
                const scale = scene.targetSize.width / container.clientWidth;
                workspace.panes.find(pane => pane.id === 'shot').pan = {
                    x: this.previewPan.pan.x + (event.clientX - this.previewPan.x) * scale,
                    y: this.previewPan.pan.y + (event.clientY - this.previewPan.y) * scale
                };
                store.setWorkspace(workspace);
                event.stopImmediatePropagation();
                return;
            }
            if (this.dragPane || event.buttons || (event.target as HTMLElement).closest('button, input, select, .pcui-panel')) return;
            const paneId = paneAt(event);
            if (store.views.activePaneId !== paneId) {
                store.setWorkspace({ ...structuredClone(store.views), activePaneId: paneId });
                events.fire('cameraViews.input', this.activeCamera);
            }
        }, true);
        const release = () => {
            this.dragPane = null;
            this.previewPan = null;
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        window.addEventListener('blur', release);
        scene.camera.inputFilter = event => (this.dragPane ?? paneAt(event)) === 'editor';

        container.addEventListener('wheel', (event) => {
            if (paneAt(event) !== 'shot' || (event.target as HTMLElement).closest('button, input, select, .pcui-panel')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const workspace = structuredClone(store.views);
            const pane = workspace.panes.find(pane => pane.id === 'shot');
            pane.zoom = Math.max(0.05, Math.min(20, pane.zoom * Math.exp(-event.deltaY * 0.001)));
            store.setWorkspace(workspace);
        }, { capture: true, passive: false });

        this.installToolbar(container);
        this.prepare();
    }

    private installToolbar(container: HTMLElement) {
        const { store } = this;
        const toolbar = document.createElement('div');
        toolbar.className = 'camera-views-toolbar';
        toolbar.addEventListener('pointerdown', event => event.stopPropagation());
        const modes = document.createElement('select');
        modes.setAttribute('aria-label', '表示するビュー');
        for (const [value, name] of [['editor', 'ビューポート'], ['shot', '撮影カメラ'], ['split', '画面分割']]) modes.add(new Option(name, value));
        modes.onchange = () => {
            const workspace = structuredClone(store.views);
            workspace.split = modes.value === 'split';
            workspace.activePaneId = modes.value === 'shot' ? 'shot' : 'editor';
            store.setWorkspace(workspace);
        };
        const cameras = document.createElement('select');
        cameras.setAttribute('aria-label', '撮影カメラ');
        cameras.onchange = () => this.history.add(store.edit((document) => {
            document.outputCameraId = cameras.value;
        }));
        const button = (name: string, action: () => void) => {
            const element = document.createElement('button');
            element.textContent = name;
            element.onclick = action;
            toolbar.appendChild(element);
            return element;
        };
        toolbar.append(modes, cameras);
        button('追加', () => this.history.add(store.edit((document) => {
            const record = createCamera(crypto.randomUUID(), `Camera ${document.cameras.length + 1}`);
            const source = this.scene.camera;
            record.camera.position = source.position.toArray() as [number, number, number];
            record.camera.rotation = source.mainCamera.getRotation().toArray() as [number, number, number, number];
            record.camera.fovY = source.camera.horizontalFov ? 2 * Math.atan(Math.tan(source.fov * Math.PI / 360) / source.camera.aspectRatio) * 180 / Math.PI : source.fov;
            record.camera.projection = source.ortho ? 'ortho' : 'perspective';
            record.camera.orthoHalfHeight = source.camera.orthoHeight;
            document.cameras.push(record);
            document.outputCameraId = record.id;
        })));
        const duplicate = button('複製', () => this.history.add(store.edit(document => cloneCamera(document, document.outputCameraId, crypto.randomUUID()))));
        const remove = button('削除', () => {
            if (store.state.outputCameraId) this.history.add(store.edit(document => removeCamera(document, document.outputCameraId)));
        });
        const update = () => {
            modes.value = store.views.split ? 'split' : store.views.activePaneId;
            cameras.replaceChildren(...store.state.cameras.map(camera => new Option(camera.name, camera.id)));
            cameras.value = store.state.outputCameraId ?? '';
            duplicate.disabled = remove.disabled = !store.state.outputCameraId;
            container.classList.toggle('camera-views-split', store.views.split && !!store.state.outputCameraId);
            container.dataset.activePane = store.views.activePaneId;
        };
        store.subscribe(update);
        update();
        container.appendChild(toolbar);
    }

    prepare() {
        const { scene, store, shot } = this;
        const { split, activePaneId } = store.views;
        const reference = store.views.panes.find(pane => pane.id === 'shot').camera;
        const record = reference.kind === 'shot' ? store.get(reference.cameraId) : null;
        const showShot = !!record && (split || activePaneId === 'shot');
        const showEditor = !showShot || split;
        const width = Math.max(2, scene.targetSize.width);
        const height = Math.max(1, scene.targetSize.height);
        const left = split && showShot ? Math.floor(width / 2) : width;
        scene.camera.active = showEditor;
        scene.camera.inputEnabled = showEditor && (!showShot || activePaneId === 'editor');
        scene.camera.paneRect = new Vec4(0, 0, showEditor && showShot ? left / width : 1, 1);
        scene.camera.paneSize = { width: left, height };
        shot.active = showShot;
        shot.paneRect = new Vec4(showEditor && showShot ? left / width : 0, 0, showEditor && showShot ? (width - left) / width : 1, 1);
        shot.paneSize = { width: showEditor && showShot ? width - left : width, height };
        const key = `${store.revision}:${store.workspaceRevision}:${width}:${height}`;
        if (record && key !== this.lastViewKey) {
            const pane = store.views.panes.find(pane => pane.id === 'shot');
            const output = resolveView(record.camera, record.composition);
            const size = shot.paneSize;
            const fit = Math.min(size.width / output.outputSize.width, size.height / output.outputSize.height) * pane.zoom;
            const gateWidth = output.outputSize.width * fit;
            const gateHeight = output.outputSize.height * fit;
            shot.setView(resolveView(record.camera, record.composition, { ...size,
                gate: {
                    x: (size.width - gateWidth) / 2 + pane.pan.x,
                    y: (size.height - gateHeight) / 2 + pane.pan.y,
                    width: gateWidth,
                    height: gateHeight
                } }));
        }
        this.lastViewKey = key;
    }

    captureInput() {
        const camera = this.activeCamera;
        const revision = this.store.revision;
        const workspaceRevision = this.store.workspaceRevision;
        const sceneRevision = this.sceneRevision;
        const viewRevision = camera.viewRevision;
        return {
            camera,
            paneId: this.store.views.activePaneId,
            isCurrent: () => revision === this.store.revision && workspaceRevision === this.store.workspaceRevision &&
                sceneRevision === this.sceneRevision && viewRevision === camera.viewRevision
        };
    }
}
