import { Quat, Vec3 } from 'playcanvas';

import type { CameraFramesState } from '../camera-frames-types';
import type { EditHistory } from '../edit-history';
import type { Events } from '../events';
import type { Scene } from '../scene';
import { CameraHistory } from './camera-history';
import { cameraAngles, expandFrame, horizontalFov, legacyFrameState, legacyPreset, migrateLegacyCameras, quaternionFromAngles, verticalFov } from './camera-legacy';
import { cloneCamera, createCamera, removeCamera, type CameraDocument, type CameraRecord } from './camera-store';
import type { CameraViews } from './camera-views';
import { registerShotNavigation } from './shot-navigation';

// The existing product panels speak cameraFrames events. This adapter resolves
// them to an explicit persistent camera ID; it never moves the viewport camera
// into a saved shot or restores an orbit snapshot after rendering.
export class CameraEditor {
    readonly history: CameraHistory;
    private mainEditMode = false;
    private queuedRefresh = false;
    private navMode: 'orbit' | 'fpv' = 'fpv';

    constructor(readonly views: CameraViews, private scene: Scene, private events: Events, editHistory: EditHistory) {
        this.history = new CameraHistory(views.store, editHistory, scene, events);
        const { store } = views;
        const on = (name: string, callback: (...args: any[]) => void) => events.on(`cameraFrames.${name}`, callback);
        const fn = (name: string, callback: (...args: any[]) => any) => events.function(`cameraFrames.${name}`, callback);
        fn('enabled', () => this.enabled);
        fn('state', () => this.snapshot());
        fn('mainTransform', () => this.transform());
        fn('fovInfo', () => this.fovInfo());
        fn('nearClip', () => this.record?.camera.near ?? null);
        fn('canSelectMain', () => !!this.record);
        fn('uiTarget', () => (this.enabled || this.mainEditMode ? 'main' : 'viewport'));
        fn('uiTargetAvailability', () => ({ viewport: true, main: !!this.record }));
        fn('orthoToggleAllowed', () => !this.enabled);
        fn('orthoBlocked', () => this.enabled);
        fn('allowViewCube', () => views.activeCamera === scene.camera);
        fn('presetsState', () => ({ selectedPresetId: store.state.outputCameraId, presets: this.snapshot().cameraPresets }));
        fn('referenceOverrides.get', referenceId => structuredClone(this.record?.referenceImageOverrides[referenceId] ?? null));
        fn('viewZoom', () => ({ zoomPct: store.views.panes.find(pane => pane.id === 'shot').zoom * 100 }));
        fn('viewportLens', () => this.viewportLens());

        on('setEnabled', enabled => this.setEnabled(!!enabled));
        on('toggleEnabled', () => this.setEnabled(!this.enabled));
        on('setUiTarget', target => this.setEnabled(target === 'main'));
        on('setMainEditMode', (enabled) => {
            this.mainEditMode = !!enabled;
            events.fire('shotCameras.select', enabled ? store.state.outputCameraId : null);
        });
        on('historyBegin', () => this.history.begin());
        on('historyCommit', () => this.history.end());
        on('setScalePct', ({ x, y }) => this.change((record) => {
            const c = record.composition;
            expandFrame(record, Math.min(16000 / c.width, Math.max(1, (x ?? c.scaleX * 100) / 100)),
                Math.min(16000 / c.height, Math.max(1, (y ?? c.scaleY * 100) / 100)));
        }));
        on('setAnchor', ({ ax, ay }) => this.change(record => Object.assign(record.composition, { anchorX: ax, anchorY: ay })));
        on('setViewZoomPct', (value) => {
            const workspace = structuredClone(store.views);
            workspace.panes.find(pane => pane.id === 'shot').zoom = Math.max(0.05, Math.min(20, value / 100));
            store.setWorkspace(workspace);
        });
        on('setMainCameraPosition', position => this.change((record) => {
            record.camera.position = [position.x, position.y, position.z];
        }));
        on('setMainCameraRotation', rotation => this.change((record) => {
            record.camera.rotation = quaternionFromAngles(rotation).toArray() as [number, number, number, number];
        }));
        on('setMainCameraPose', transform => this.change((record) => {
            record.camera.position = [transform.position.x, transform.position.y, transform.position.z];
            record.camera.rotation = quaternionFromAngles(transform.rotation).toArray() as [number, number, number, number];
        }));
        on('nudgeMainCamera', delta => this.change((record) => {
            const offset = new Quat(...record.camera.rotation).transformVector(new Vec3(delta.right ?? 0, delta.up ?? 0, -(delta.forward ?? 0))).mulScalar(delta.scale ?? 1);
            record.camera.position = new Vec3(...record.camera.position).add(offset).toArray() as [number, number, number];
        }));
        on('setMainNavMode', (mode) => {
            this.navMode = mode; this.refresh();
        });
        on('setNearClip', value => this.change((record) => {
            record.camera.near = value ?? 0.01;
        }));
        on('setEqFovMm', mm => this.change((record) => {
            const hfov = 2 * Math.atan(36 * (record.composition.width / 1536) / (2 * mm)) * 180 / Math.PI;
            record.camera.fovY = verticalFov(Math.min(120, Math.max(10, hfov)), record.composition.width / record.composition.height);
        }));
        on('setViewportLens', (mm) => {
            const hfov = 2 * Math.atan(36 / (2 * mm)) * 180 / Math.PI;
            events.fire('camera.setFov', scene.camera.camera.horizontalFov ? hfov : verticalFov(hfov, scene.camera.camera.aspectRatio));
        });
        on('addCameraPreset', () => this.history.change((document) => {
            if (document.outputCameraId) cloneCamera(document, document.outputCameraId, crypto.randomUUID());
            else {
                const record = this.fromViewport(crypto.randomUUID(), 'Camera 1');
                document.cameras.push(record);
                document.outputCameraId = record.id;
            }
        }));
        on('deleteCameraPreset', (id) => {
            const target = id ?? store.state.outputCameraId;
            if (target) this.history.change(document => removeCamera(document, target));
        });
        on('applyCameraPreset', id => this.history.change((document) => {
            document.outputCameraId = id;
        }));
        on('renameCameraPreset', (id, name) => this.change((record) => {
            if (name.trim()) record.name = name.trim();
        }, id));
        on('setPresetReferenceImage', (id, value) => this.change((record) => {
            record.referenceImagePresetId = value;
        }, id));
        on('referenceOverrides.patch', (referenceId, patch) => this.change((record) => {
            const current = record.referenceImageOverrides[referenceId] as Record<string, any> ?? {};
            const next = { ...current, ...structuredClone(patch) };
            if (patch.items) {
                next.items = { ...current.items };
                for (const [id, value] of Object.entries(patch.items)) next.items[id] = { ...next.items[id], ...value as object };
            }
            record.referenceImageOverrides[referenceId] = next;
        }));
        on('referenceOverrides.clear', (referenceId, itemIds) => this.change((record) => {
            const current = record.referenceImageOverrides[referenceId] as { items?: Record<string, unknown> };
            if (itemIds && current?.items) {
                itemIds.forEach((id: string) => {
                    delete current.items[id];
                });
            } else delete record.referenceImageOverrides[referenceId];
        }));
        on('referenceOverrides.historyBegin', () => this.history.begin());
        on('referenceOverrides.historyCommit', () => this.history.end());
        on('syncReferenceImages', () => this.syncReferences());
        on('addFrame', () => this.change((record) => {
            let index = 0;
            const idAt = (index: number) => (index < 26 ? String.fromCharCode(65 + index) : `F${index + 1}`);
            const ids = new Set(record.frames.map(frame => frame.id));
            while (ids.has(idAt(index))) index++;
            record.frames.forEach((frame) => {
                frame.selected = false;
            });
            record.frames.push({ id: idAt(index),
                pos: { x: 0.5, y: 0.5 },
                scaleK: 1,
                scalePct: 100,
                baseSize: { w: 1536, h: 864 },
                order: record.frames.length,
                selected: true });
        }));
        on('selectFrame', id => this.change(record => record.frames.forEach((frame) => {
            frame.selected = frame.id === id;
        })));
        const deleteFrame = (id?: string) => this.change((record) => {
            const selected = id ?? record.frames.find(frame => frame.selected)?.id;
            record.frames = record.frames.filter(frame => frame.id !== selected);
        });
        on('deleteFrame', deleteFrame);
        on('deleteSelected', deleteFrame);
        on('setFrameScale', ({ id, scalePct }) => this.change((record) => {
            const frame = record.frames.find(frame => frame.id === id);
            if (frame) Object.assign(frame, { scalePct, scaleK: scalePct / 100 });
        }));
        on('setMask', mask => this.change(record => Object.assign(record.settings.mask, mask)));
        for (const key of ['exportName', 'exportFormat', 'exportGridOverlay', 'exportModelLayers', 'exportSplatLayers', 'exportReferenceImages'] as const) {
            on(`set${key[0].toUpperCase()}${key.slice(1)}`, value => this.change(record => Object.assign(record.settings, { [key]: value })));
        }
        on('setExportTarget', target => this.history.change((document) => {
            document.exportTarget = target;
        }));
        on('setExportPresetIds', ids => this.history.change((document) => {
            document.exportPresetIds = structuredClone(ids);
        }));
        on('forceRefreshViewport', () => {
            views.prepare(); scene.forceRender = true;
        });
        events.function('camera.near', () => scene.camera.near);
        events.function('camera.navMode', () => (events.invoke('camera.controlMode') === 'fly' ? 'fpv' : 'orbit'));
        events.on('camera.setNavMode', mode => events.fire('camera.setControlMode', mode === 'fpv' ? 'fly' : 'orbit'));
        events.function('camera.transform', () => ({ position: scene.camera.position, rotation: cameraAngles(scene.camera.mainCamera.getRotation().toArray()) }));
        const viewportPose = (position: Vec3, rotation: Quat) => {
            const target = rotation.transformVector(new Vec3(0, 0, -1)).add(position);
            scene.camera.setPose(position, target, 0);
            scene.camera.navigationRoll = cameraAngles(rotation.toArray()).roll;
            scene.camera.onUpdate(0);
            scene.forceRender = true;
        };
        for (const name of ['camera.setPosition', 'camera.setPositionWorld']) {
            events.on(name, (value) => {
                const p = scene.camera.position;
                viewportPose(new Vec3(value.x ?? p.x, value.y ?? p.y, value.z ?? p.z), scene.camera.mainCamera.getRotation().clone());
            });
        }
        events.on('camera.setRotationEuler', value => viewportPose(scene.camera.position.clone(), quaternionFromAngles(value)));
        events.on('camera.nudgeLocal', (delta) => {
            const rotation = scene.camera.mainCamera.getRotation().clone();
            const offset = rotation.transformVector(new Vec3(delta.right ?? 0, delta.up ?? 0, -(delta.forward ?? 0))).mulScalar(delta.scale ?? 1);
            viewportPose(scene.camera.position.clone().add(offset), rotation);
        });
        events.on('camera.setNear', (value) => {
            scene.camera.nearOverride = value; scene.forceRender = true;
        });
        events.on('camera.controlMode', mode => events.fire('camera.navMode', mode === 'fly' ? 'fpv' : 'orbit'));
        events.on('camera.fov', () => events.fire('cameraFrames.viewportLensChanged', this.viewportLens()));
        events.function('docSerialize.cameraFrames', () => this.snapshot());
        events.function('docDeserialize.cameraFrames', (legacy: unknown, distanceScale = 1) => {
            if (!legacy) return;
            store.replace(migrateLegacyCameras(legacy, distanceScale));
        });
        let referenceKey = '';
        store.subscribe(() => {
            const next = `${store.state.outputCameraId}:${this.record?.referenceImagePresetId}`;
            if (referenceKey !== next) {
                referenceKey = next; this.syncReferences();
            }
            this.refresh();
        });
        events.on('app.ready', () => this.refresh());
        registerShotNavigation(scene, this);
    }

    get record() {
        return this.views.store.get(this.views.store.state.outputCameraId);
    }
    get navigationMode() {
        return this.navMode;
    }
    get enabled() {
        return !!this.record && (this.views.store.views.split || this.views.store.views.activePaneId === 'shot');
    }

    change(change: (record: CameraRecord, document: CameraDocument) => void, id = this.views.store.state.outputCameraId) {
        if (!id) return Promise.resolve();
        // Capture the identity at event submission. A queued camera switch may
        // not redirect an earlier text input or drag to the new camera.
        return this.history.change((document) => {
            const record = document.cameras.find(record => record.id === id);
            if (record) change(record, document);
        });
    }

    fromViewport(id: string, name: string) {
        const record = createCamera(id, name);
        const source = this.scene.camera;
        record.camera.position = source.position.toArray() as [number, number, number];
        record.camera.rotation = source.mainCamera.getRotation().toArray() as [number, number, number, number];
        record.camera.fovY = source.camera.horizontalFov ? verticalFov(source.fov, source.camera.aspectRatio) : source.fov;
        record.camera.projection = source.ortho ? 'ortho' : 'perspective';
        record.camera.orthoHalfHeight = source.camera.orthoHeight;
        return record;
    }

    setEnabled(enabled: boolean) {
        const workspace = structuredClone(this.views.store.views);
        if (!enabled) workspace.split = false;
        workspace.activePaneId = enabled && this.record ? 'shot' : 'editor';
        this.views.store.setWorkspace(workspace);
    }

    transform() {
        const record = this.record;
        return record ? { position: { x: record.camera.position[0], y: record.camera.position[1], z: record.camera.position[2] }, rotation: cameraAngles(record.camera.rotation) } : null;
    }

    fovInfo() {
        const record = this.record ?? createCamera('display');
        const crop = record.composition.width / 1536;
        const hfov = horizontalFov(record);
        const mm = (fov: number) => 36 * crop / (2 * Math.tan(fov * Math.PI / 360));
        return { crop,
            hfovDeg: hfov,
            hfovFrameDeg: 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / crop) * 180 / Math.PI,
            eqMm: mm(hfov),
            minEqMm: mm(120),
            maxEqMm: mm(10) };
    }

    viewportLens() {
        const c = this.scene.camera.camera;
        const hfov = c.horizontalFov ? c.fov : 2 * Math.atan(Math.tan(c.fov * Math.PI / 360) * c.aspectRatio) * 180 / Math.PI;
        return { enabled: true, mm: 36 / (2 * Math.tan(hfov * Math.PI / 360)), min: 10, max: 200 };
    }

    snapshot(): CameraFramesState {
        const { store } = this.views;
        const record = this.record ?? createCamera('display');
        const base = legacyFrameState(record);
        const pane = store.views.panes.find(pane => pane.id === 'shot');
        const view = this.views.shot.resolvedView;
        base.enabled = this.enabled;
        base.mainCameraPose.navMode = this.navMode;
        base.renderBox.viewZoomPct = pane.zoom * 100;
        if (view) {
            base.renderBox.fitScale = view.gate.width / view.outputSize.width / pane.zoom;
            base.renderBox.lastViewport = { vw: view.size.width, vh: view.size.height };
            base.renderBox.center = { cx: view.gate.x + view.gate.width / 2, cy: view.gate.y + view.gate.height / 2 };
        }
        return { ...base,
            cameraPresets: store.state.cameras.map(record => legacyPreset(record, record.id === store.state.outputCameraId)),
            selectedPresetId: store.state.outputCameraId,
            exportTarget: store.state.exportTarget,
            exportPresetIds: [...store.state.exportPresetIds] };
    }

    private syncReferences() {
        const id = this.record?.referenceImagePresetId;
        if (id) this.events.functions.get('referenceImages.setActivePreset')?.(id);
    }

    private refresh() {
        if (this.queuedRefresh) return;
        this.queuedRefresh = true;
        requestAnimationFrame(() => {
            this.queuedRefresh = false;
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.events.fire('cameraFrames.presetsState', this.events.invoke('cameraFrames.presetsState'));
            this.events.fire('cameraFrames.fovInfoChanged', this.fovInfo());
        });
    }
}
