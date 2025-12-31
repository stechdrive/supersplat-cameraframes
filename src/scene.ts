import {
    EVENT_POSTRENDER_LAYER,
    EVENT_PRERENDER_LAYER,
    LAYERID_DEPTH,
    SORTMODE_NONE,
    BoundingBox,
    CameraComponent,
    Color,
    Entity,
    Mat4,
    Layer,
    GraphicsDevice,
    Vec3
} from 'playcanvas';

import { AssetLoader } from './asset-loader';
import { Camera } from './camera';
import { DataProcessor } from './data-processor';
import { AmbientLightOp } from './edit-ops';
import { Element, ElementType, ElementTypeList } from './element';
import { Events } from './events';
import { EyeLevel } from './eye-level';
import { InfiniteGrid as Grid } from './infinite-grid';
import { LightRig } from './light-rig';
import { Model } from './model';
import { Outline } from './outline';
import { PCApp } from './pc-app';
import { SceneConfig } from './scene-config';
import { SceneState } from './scene-state';
import { Splat } from './splat';
import { SplatOverlay } from './splat-overlay';
import { SplatRenderSystem } from './splat-render-system';
import { Underlay } from './underlay';

class Scene {
    events: Events;
    config: SceneConfig;
    canvas: HTMLCanvasElement;
    app: PCApp;
    backgroundLayer: Layer;
    shadowLayer: Layer;
    debugLayer: Layer;
    exportOverlayLayer: Layer;
    overlayLayer: Layer;
    gizmoLayer: Layer;
    modelLightingLayer: Layer;
    referenceBackLayer: Layer | null = null;
    referenceFrontLayer: Layer | null = null;
    ambientFillLights: Entity[] = [];
    defaultAmbient = 0.5;
    sceneState = [new SceneState(), new SceneState()];
    elements: Element[] = [];
    boundStorage = new BoundingBox();
    boundDirty = true;
    private boundPreviewActive = false;
    private boundPreviewTarget: Element | null = null;
    private boundPreviewBase = new BoundingBox();
    private boundPreviewTargetBase = new BoundingBox();
    private boundPreviewTargetCurrent = new BoundingBox();
    private boundPreviewCurrent = new BoundingBox();
    private boundPreviewWorld = new Mat4();
    private boundPreviewWorldInv = new Mat4();
    private boundPreviewDelta = new Mat4();
    private boundPreviewCorners = [
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3(),
        new Vec3()
    ];
    private boundPreviewMin = new Vec3();
    private boundPreviewMax = new Vec3();
    private boundPreviewTmp = new Vec3();
    forceRender = false;
    pendingViewportRefresh = 0;
    viewportRefreshInFlight = false;

    lockedRenderMode = false;
    lockedRender = false;

    renderFlags: {
        forceGridOverlay: boolean;
        forceEyeLevelOverlay: boolean;
        eyeLevelLayerOverride: Layer | null;
        gridLayerOverride: Layer | null;
        hideBounds: boolean;
        offscreenIncludeReferenceImage: boolean;
    } = {
            forceGridOverlay: false,
            forceEyeLevelOverlay: false,
            eyeLevelLayerOverride: null,
            gridLayerOverride: null,
            hideBounds: false,
            offscreenIncludeReferenceImage: false
        };

    canvasResize: { width: number; height: number } | null = null;
    targetSize = {
        width: 0,
        height: 0
    };
    aspectViewport = {
        enabled: false,
        offsetX: 0,
        offsetY: 0,
        width: 0,
        height: 0
    };

    dataProcessor: DataProcessor;
    assetLoader: AssetLoader;
    camera: Camera;
    splatOverlay: SplatOverlay;
    grid: Grid;
    outline: Outline;
    underlay: Underlay;
    eyeLevel: EyeLevel;
    renderSystem: SplatRenderSystem;

    contentRoot: Entity;
    cameraRoot: Entity;
    private pendingAmbientOp: AmbientLightOp | null = null;
    private pendingAmbientFresh = false;
    private pendingAmbientTimer: number | null = null;
    private lightingHistoryCoalesceMs = 400;
    private boundRecalcTimer: number | null = null;
    private boundRecalcDebounceMs = 200;

    constructor(
        events: Events,
        config: SceneConfig,
        canvas: HTMLCanvasElement,
        graphicsDevice: GraphicsDevice
    ) {
        this.events = events;
        this.config = config;
        this.canvas = canvas;

        // configure the playcanvas application. we render to an offscreen buffer so require
        // only the simplest of backbuffers.
        this.app = new PCApp(canvas, { graphicsDevice });

        // only render the scene when instructed
        this.app.autoRender = false;
        // @ts-ignore
        this.app._allowResize = false;
        this.app.scene.clusteredLightingEnabled = false;

        // hack: disable lightmapper first bake until we expose option for this
        // @ts-ignore
        this.app.off('prerender', this.app._firstBake, this.app);

        // @ts-ignore
        this.app.loader.getHandler('texture').imgParser.crossOrigin = 'anonymous';

        // this is required to get full res AR mode backbuffer
        this.app.graphicsDevice.maxPixelRatio = window.devicePixelRatio;

        // configure application canvas
        const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
            if (entries.length > 0) {
                const entry = entries[0];
                if (entry) {
                    if (entry.devicePixelContentBoxSize) {
                        // on non-safari browsers, we are given the pixel-perfect canvas size
                        this.canvasResize = {
                            width: entry.devicePixelContentBoxSize[0].inlineSize,
                            height: entry.devicePixelContentBoxSize[0].blockSize
                        };
                    } else if (entry.contentBoxSize.length > 0) {
                        // on safari browsers we must calculate pixel size from CSS size ourselves
                        // and hope the browser performs the same calculation.
                        const pixelRatio = window.devicePixelRatio;
                        this.canvasResize = {
                            width: Math.ceil(entry.contentBoxSize[0].inlineSize * pixelRatio),
                            height: Math.ceil(entry.contentBoxSize[0].blockSize * pixelRatio)
                        };
                    }
                }
                this.forceRender = true;
            }
        });

        observer.observe(window.document.getElementById('canvas-container'));

        // configure depth layers to handle dynamic refraction
        const depthLayer = this.app.scene.layers.getLayerById(LAYERID_DEPTH);
        this.app.scene.layers.remove(depthLayer);
        this.app.scene.layers.insertOpaque(depthLayer, 2);

        // register application callbacks
        this.app.on('update', (deltaTime: number) => this.onUpdate(deltaTime));
        this.app.on('prerender', () => this.onPreRender());
        this.app.on('postrender', () => this.onPostRender());

        // force render on device restored
        this.app.graphicsDevice.on('devicerestored', () => {
            this.forceRender = true;
        });

        // fire pre and post render events on the camera
        this.app.scene.on(EVENT_PRERENDER_LAYER, (camera: CameraComponent, layer: Layer, transparent: boolean) => {
            camera.fire('preRenderLayer', layer, transparent);
        });

        this.app.scene.on(EVENT_POSTRENDER_LAYER, (camera: CameraComponent, layer: Layer, transparent: boolean) => {
            camera.fire('postRenderLayer', layer, transparent);
        });

        // background layer
        this.backgroundLayer = new Layer({
            enabled: true,
            name: 'Background Layer',
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // shadow layer
        // this layer contains shadow caster scene mesh instances, shadow-casting
        // virtual light, shadow catching plane geometry and the main camera.
        this.shadowLayer = new Layer({
            name: 'Shadow Layer'
        });

        // model lighting layer (models専用ディレクショナルライト用)
        this.modelLightingLayer = new Layer({
            name: 'Model Lighting',
            enabled: true
        });

        this.exportOverlayLayer = new Layer({
            enabled: false,
            name: 'Export Overlay',
            clearDepthBuffer: false,
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // debug layer
        this.debugLayer = new Layer({
            enabled: true,
            name: 'Debug Layer',
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // overlay layer
        this.overlayLayer = new Layer({
            name: 'Overlay',
            clearDepthBuffer: false,
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // gizmo layer
        this.gizmoLayer = new Layer({
            name: 'Gizmo',
            clearDepthBuffer: true,
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        const worldLayer = this.app.scene.layers.getLayerByName('World');
        this.insertLayerBefore(this.backgroundLayer, worldLayer);
        this.insertLayerBefore(this.shadowLayer, worldLayer);
        this.insertLayerBefore(this.modelLightingLayer, worldLayer);
        this.insertLayerBefore(this.debugLayer, worldLayer);
        this.insertLayerBefore(this.exportOverlayLayer, worldLayer);
        // NOTE: Overlay/Gizmo は World(Transparent=gsplat) の後ろに来る必要がある。
        // Gizmo(clearDepthBuffer) が World の透明パス直前に入ると、GLB の深度が消えて見えなくなる。
        this.insertLayerAfter(this.overlayLayer, worldLayer);
        this.insertLayerAfter(this.gizmoLayer, this.overlayLayer);

        // Ambient fallback (環境マップ未設定時の視認性確保)
        this.app.scene.ambientLight.set(0.5, 0.5, 0.5);
        this.defaultAmbient = this.app.scene.ambientLight.r ?? this.defaultAmbient;
        events.on('lighting.setAmbient', (value: number) => {
            this.setAmbient(value, true);
        });
        events.function('lighting.ambient', () => this.app.scene.ambientLight.r ?? 0.3);
        events.on('edit.apply', this.onEditApplied, this);

        this.dataProcessor = new DataProcessor(this.app.graphicsDevice);
        this.assetLoader = new AssetLoader(this.app, events, this.app.graphicsDevice.maxAnisotropy);

        // create root entities
        this.contentRoot = new Entity('contentRoot');
        this.app.root.addChild(this.contentRoot);

        this.cameraRoot = new Entity('cameraRoot');
        this.app.root.addChild(this.cameraRoot);

        // 環境光補助ライト（contentRoot 作成後に生成）
        this.createAmbientFillLights();

        this.renderSystem = new SplatRenderSystem(this);

        // create elements
        this.camera = new Camera();
        this.add(this.camera);
        const camLayers = this.camera.entity.camera.layers;
        if (this.modelLightingLayer && !camLayers.includes(this.modelLightingLayer.id)) {
            this.camera.entity.camera.layers = camLayers.concat([this.modelLightingLayer.id]);
        }

        this.splatOverlay = new SplatOverlay();
        this.add(this.splatOverlay);

        this.grid = new Grid();
        this.add(this.grid);

        this.eyeLevel = new EyeLevel();
        this.add(this.eyeLevel);

        const lightRig = new LightRig([this.modelLightingLayer.id]);
        this.add(lightRig);

        this.outline = new Outline();
        this.add(this.outline);
        this.underlay = new Underlay();
        this.add(this.underlay);
    }

    insertLayerBefore(layer: Layer, target: Layer | string | null | undefined) {
        if (!layer) return;
        const layers = this.app.scene.layers;
        const targetLayer = typeof target === 'string' ? layers.getLayerByName(target) : target;
        const idx = targetLayer ? layers.getOpaqueIndex(targetLayer) : -1;
        const insertIndex = idx >= 0 ? idx : layers.layerList.length;
        layers.insert(layer, insertIndex);
    }

    insertLayerAfter(layer: Layer, target: Layer | string | null | undefined) {
        if (!layer) return;
        const layers = this.app.scene.layers;
        const targetLayer = typeof target === 'string' ? layers.getLayerByName(target) : target;
        // Insert after the *whole* target layer (opaque + transparent). Using the opaque index can
        // split the target layer and/or place the new layer before the target's transparent pass.
        // That can break depth ordering (e.g. clearing depth before World transparent splats).
        const transparentIdx = targetLayer ? layers.getTransparentIndex(targetLayer) : -1;
        const opaqueIdx = targetLayer ? layers.getOpaqueIndex(targetLayer) : -1;
        const baseIdx = transparentIdx >= 0 ? transparentIdx : opaqueIdx;
        const insertIndex = baseIdx >= 0 ? baseIdx + 1 : layers.layerList.length;
        layers.insert(layer, insertIndex);
    }

    private createAmbientFillLights() {
        // contentRoot が未初期化の場合は何もしない
        if (!this.contentRoot) {
            return;
        }

        // 既存をクリーンアップ
        this.ambientFillLights.forEach((light) => {
            light.destroy();
        });
        this.ambientFillLights.length = 0;

        const targetLayers = this.modelLightingLayer ? [this.modelLightingLayer.id] : undefined;
        const makeLight = (name: string, angles: { x: number; y: number; z: number; }, intensity: number) => {
            const ent = new Entity(name);
            ent.addComponent('light', {
                type: 'directional',
                castShadows: false,
                color: new Color(1, 1, 1),
                intensity
            });
            if (targetLayers) {
                ent.light.layers = targetLayers.slice();
            }
            ent.setEulerAngles(angles.x, angles.y, angles.z);
            this.contentRoot.addChild(ent);
            return ent;
        };

        const base = this.app.scene.ambientLight.r ?? 0.5;
        // 上下から弱く当てる「なんちゃってヘミスフィア」
        this.ambientFillLights = [
            makeLight('ambientFillUp', { x: -60, y: 30, z: 0 }, base * 0.5),
            makeLight('ambientFillDown', { x: 60, y: -30, z: 0 }, base * 0.5)
        ];
    }

    applyAmbient(value: number) {
        const v = Math.max(0, value ?? 0);
        this.app.scene.ambientLight.set(v, v, v);
        const fill = Math.max(0, v * 0.5);
        this.ambientFillLights.forEach((light) => {
            light.light.intensity = fill;
        });
        this.forceRender = true;
        this.events.fire('lighting.ambientChanged', v);
    }

    setAmbient(value: number, recordHistory = false) {
        const v = Math.max(0, value ?? 0);
        const prev = this.app.scene.ambientLight.r ?? 0;
        if (recordHistory) {
            this.recordAmbientChange(prev, v);
        } else {
            this.applyAmbient(v);
        }
    }

    private recordAmbientChange(prev: number, next: number) {
        if (Math.abs(prev - next) < 1e-6) {
            this.applyAmbient(next);
            return;
        }
        if (!this.pendingAmbientOp) {
            const op = new AmbientLightOp({
                scene: this,
                prev,
                next
            });
            this.pendingAmbientOp = op;
            this.pendingAmbientFresh = true;
            this.events.fire('edit.add', op);
        } else {
            this.pendingAmbientOp.next = next;
            this.applyAmbient(next);
        }
        this.scheduleAmbientReset();
    }

    private scheduleAmbientReset() {
        if (this.pendingAmbientTimer !== null) {
            window.clearTimeout(this.pendingAmbientTimer);
        }
        this.pendingAmbientTimer = window.setTimeout(() => {
            this.clearPendingAmbientOp();
        }, this.lightingHistoryCoalesceMs);
    }

    private clearPendingAmbientOp() {
        if (this.pendingAmbientTimer !== null) {
            window.clearTimeout(this.pendingAmbientTimer);
            this.pendingAmbientTimer = null;
        }
        this.pendingAmbientOp = null;
        this.pendingAmbientFresh = false;
    }

    private onEditApplied(op: any) {
        if (!this.pendingAmbientOp) {
            return;
        }
        if (op === this.pendingAmbientOp) {
            if (this.pendingAmbientFresh) {
                this.pendingAmbientFresh = false;
                return;
            }
        }
        this.clearPendingAmbientOp();
    }

    start() {
        // start the app
        this.app.start();
    }

    // 初期レイアウトが確定する前に描画されることがあるため、モデル読み込み後に「リサイズ＋再描画」を複数フレーム分遅延実行する
    scheduleViewportRefresh() {
        // postrender 後にダブル rAF で実行する。複数フレーム続けて実施し、初期計算の取りこぼしを防ぐ。
        this.pendingViewportRefresh = Math.max(this.pendingViewportRefresh, 3);
        this.forceRender = true; // 少なくとも1フレームは描画させて postrender を踏む
    }

    scheduleBoundRecalc() {
        if (this.boundRecalcTimer !== null) {
            window.clearTimeout(this.boundRecalcTimer);
        }
        this.boundDirty = false;
        this.boundRecalcTimer = window.setTimeout(() => {
            this.boundRecalcTimer = null;
            this.boundDirty = true;
            this.forceRender = true;
        }, this.boundRecalcDebounceMs);
    }

    beginBoundPreview(target: Element) {
        const entity = this.getBoundPreviewEntity(target);
        if (!entity) {
            return;
        }

        const targetBound = target.worldBound;
        if (!targetBound) {
            return;
        }
        const baseBound = this.bound;

        this.boundPreviewActive = true;
        this.boundPreviewTarget = target;
        this.boundPreviewBase.copy(baseBound);
        this.boundPreviewTargetBase.copy(targetBound);
        this.boundPreviewWorld.copy(entity.getWorldTransform());
        this.boundPreviewWorldInv.copy(this.boundPreviewWorld).invert();
        this.setBoundPreviewCorners(this.boundPreviewTargetBase);
        this.updateBoundPreview(target);
    }

    updateBoundPreview(target: Element) {
        if (!this.boundPreviewActive || this.boundPreviewTarget !== target) {
            return;
        }

        const entity = this.getBoundPreviewEntity(target);
        if (!entity) {
            return;
        }

        this.boundPreviewDelta.mul2(entity.getWorldTransform(), this.boundPreviewWorldInv);
        this.updateBoundPreviewFromDelta(this.boundPreviewDelta);
    }

    endBoundPreview(target: Element) {
        if (!this.boundPreviewActive || this.boundPreviewTarget !== target) {
            return;
        }

        this.boundPreviewActive = false;
        this.boundPreviewTarget = null;
        this.boundStorage.copy(this.boundPreviewCurrent);
        this.scheduleBoundRecalc();
    }

    private getBoundPreviewEntity(target: Element) {
        if (target instanceof Splat || target instanceof Model || target instanceof LightRig) {
            return target.entity;
        }
        return null;
    }

    private setBoundPreviewCorners(bound: BoundingBox) {
        const center = bound.center;
        const half = bound.halfExtents;
        const minX = center.x - half.x;
        const minY = center.y - half.y;
        const minZ = center.z - half.z;
        const maxX = center.x + half.x;
        const maxY = center.y + half.y;
        const maxZ = center.z + half.z;
        const corners = this.boundPreviewCorners;
        corners[0].set(minX, minY, minZ);
        corners[1].set(maxX, minY, minZ);
        corners[2].set(minX, maxY, minZ);
        corners[3].set(maxX, maxY, minZ);
        corners[4].set(minX, minY, maxZ);
        corners[5].set(maxX, minY, maxZ);
        corners[6].set(minX, maxY, maxZ);
        corners[7].set(maxX, maxY, maxZ);
    }

    private updateBoundPreviewFromDelta(delta: Mat4) {
        const min = this.boundPreviewMin;
        const max = this.boundPreviewMax;
        const tmp = this.boundPreviewTmp;
        min.set(Infinity, Infinity, Infinity);
        max.set(-Infinity, -Infinity, -Infinity);

        this.boundPreviewCorners.forEach((corner) => {
            delta.transformPoint(corner, tmp);
            min.x = Math.min(min.x, tmp.x);
            min.y = Math.min(min.y, tmp.y);
            min.z = Math.min(min.z, tmp.z);
            max.x = Math.max(max.x, tmp.x);
            max.y = Math.max(max.y, tmp.y);
            max.z = Math.max(max.z, tmp.z);
        });

        this.boundPreviewTargetCurrent.setMinMax(min, max);
        this.boundPreviewCurrent.copy(this.boundPreviewBase);
        this.boundPreviewCurrent.add(this.boundPreviewTargetCurrent);

        const pad = Math.max(1e-3, this.boundPreviewCurrent.halfExtents.length() * 0.02);
        this.boundPreviewCurrent.halfExtents.x += pad;
        this.boundPreviewCurrent.halfExtents.y += pad;
        this.boundPreviewCurrent.halfExtents.z += pad;
        this.forceRender = true;
    }

    clear() {
        const splats = this.getElementsByType(ElementType.splat);
        splats.forEach((splat) => {
            this.remove(splat);
            (splat as Splat).destroy();
        });
        const models = this.getElementsByType(ElementType.model) as Model[];
        models.forEach((model) => {
            this.remove(model);
            model.destroy();
        });
    }

    docSerializeLighting() {
        const lights = this.getElementsByType(ElementType.other)
        .filter((element): element is LightRig => element instanceof LightRig)
        .map(light => light.docSerialize());

        return {
            ambient: this.app.scene.ambientLight.r ?? this.defaultAmbient,
            lights
        };
    }

    docDeserializeLighting(doc: any) {
        const ambient = (typeof doc?.ambient === 'number' && isFinite(doc.ambient)) ? doc.ambient : this.defaultAmbient;
        this.applyAmbient(ambient);

        const lights = Array.isArray(doc?.lights) ? doc.lights : [];
        const rigs = this.getElementsByType(ElementType.other)
        .filter((element): element is LightRig => element instanceof LightRig);

        if (lights.length === 0) {
            // データが無い場合は既定状態を適用するだけ
            rigs.forEach((rig) => {
                rig.resetDirection();
                rig.applyStateDirect(rig.visible, rig.intensity);
            });
            return;
        }

        rigs.forEach((rig, i) => {
            const payload = lights[Math.min(i, lights.length - 1)];
            if (payload) {
                rig.docDeserialize(payload);
            }
        });
    }

    // add a scene element
    add(element: Element) {
        if (!element.scene) {
            // add the new element
            element.scene = this;
            element.add();
            this.elements.push(element);

            // notify all elements of scene addition
            this.forEachElement(e => e !== element && e.onAdded(element));

            // notify listeners
            this.events.fire('scene.elementAdded', element);

            // 新規追加時は境界とクリップ計算をやり直す
            this.boundDirty = true;
            this.forceRender = true;
        }
    }

    // remove an element from the scene
    remove(element: Element) {
        if (element.scene === this) {
            // remove from list
            this.elements.splice(this.elements.indexOf(element), 1);

            // notify listeners
            this.events.fire('scene.elementRemoved', element);

            // notify all elements of scene removal
            this.forEachElement(e => e.onRemoved(element));

            element.remove();
            element.scene = null;
        }
    }

    // get the scene bound
    get bound() {
        if (this.boundPreviewActive) {
            return this.boundPreviewCurrent;
        }
        if (this.boundDirty) {
            let valid = false;
            this.forEachElement((e) => {
                const bound = e.worldBound;
                if (bound) {
                    if (!valid) {
                        valid = true;
                        this.boundStorage.copy(bound);
                    } else {
                        this.boundStorage.add(bound);
                    }
                }
            });

            this.boundDirty = false;
            this.events.fire('scene.boundChanged', this.boundStorage);
        }

        return this.boundStorage;
    }

    getElementsByType(elementType: ElementType) {
        return this.elements.filter(e => e.type === elementType);
    }

    get graphicsDevice() {
        return this.app.graphicsDevice;
    }

    private forEachElement(action: (e: Element) => void) {
        this.elements.forEach(action);
    }

    private onUpdate(deltaTime: number) {
        // allow elements to update
        this.forEachElement(e => e.onUpdate(deltaTime));

        // fire global update
        this.events.fire('update', deltaTime);

        // fire a 'serialize' event which listers will use to store their state. we'll use
        // this to decide if the view has changed and so requires rendering.
        const i = this.app.frame % 2;
        const state = this.sceneState[i];
        state.reset();
        this.forEachElement(e => state.pack(e));

        // diff with previous state
        const result = state.compare(this.sceneState[1 - i]);

        // generate the set of all element types that changed
        const all = new Set([...result.added, ...result.removed, ...result.moved, ...result.changed]);

        // compare with previously serialized
        if (this.lockedRenderMode) {
            this.app.renderNextFrame = this.lockedRender;
            this.lockedRender = false;
        } else if (!this.app.renderNextFrame) {
            this.app.renderNextFrame = this.forceRender || all.size > 0;
        }
        this.forceRender = false;

        // raise per-type update events
        ElementTypeList.forEach((type) => {
            if (all.has(type)) {
                this.events.fire(`updated:${type}`);
            }
        });

        // allow elements to postupdate
        this.forEachElement(e => e.onPostUpdate());
    }

    private onPreRender() {
        if (this.canvasResize) {
            this.canvas.width = this.canvasResize.width;
            this.canvas.height = this.canvasResize.height;
            this.canvasResize = null;
        }

        // update render target size
        this.targetSize.width = Math.ceil(this.app.graphicsDevice.width / this.config.camera.pixelScale);
        this.targetSize.height = Math.ceil(this.app.graphicsDevice.height / this.config.camera.pixelScale);

        // aspect lock (camera frames) - letterbox/pillarbox to keep composition
        // ※ v3: フラスタム拡張方式により Rect 適用は不要だが、情報は取得可能
        const aspectInfo = this.events.invoke('cameraFrames.aspectLock') as {
            aspect: number;
            logicalW?: number;
            logicalH?: number;
            rectNorm?: { x: number; y: number; w: number; h: number; };
            rectPx?: { x: number; y: number; w: number; h: number; };
        } | null;

        const targetSize = this.camera.targetSize;
        const devW = targetSize?.width ?? this.app.graphicsDevice.width;
        const devH = targetSize?.height ?? this.app.graphicsDevice.height;

        // v3: フラスタム拡張を行うため、Rect と Scissor は常に全画面にリセットする
        const rect = this.camera.entity.camera.rect;
        rect.x = 0;
        rect.y = 0;
        rect.z = 1;
        rect.w = 1;

        const scissor = this.camera.entity.camera.scissorRect;
        if (scissor) {
            scissor.x = 0;
            scissor.y = 0;
            scissor.z = 1;
            scissor.w = 1;
        }

        // FOV制御
        const cam = this.camera.entity.camera;
        const hasAspectLock = !!(aspectInfo && aspectInfo.aspect > 0 && isFinite(aspectInfo.aspect));
        const lockedAspect = this.camera.getLockedAspectRatio ? this.camera.getLockedAspectRatio() : null;
        const aspectForFov = lockedAspect ?? (hasAspectLock ? aspectInfo.aspect : (devH > 0 ? devW / devH : null));

        if (this.camera.lockFraming) {
            // CAMERA FRAMES 有効時は Horizontal デフォルトを強制 (アスペクト比による自動反転を防止)
            if (this.camera.lockFovAxis === 'vertical') {
                cam.horizontalFov = false;
            } else if (this.camera.lockFovAxis === 'horizontal') {
                cam.horizontalFov = true;
            } else {
                cam.horizontalFov = true;
            }
        } else {
            // 通常時: 画面アスペクトに合わせて自動切り替え
            cam.horizontalFov = devW > devH;
        }

        this.aspectViewport = {
            enabled: false,
            offsetX: 0,
            offsetY: 0,
            width: devW,
            height: devH
        };

        this.renderSystem.onPreRender();

        this.forEachElement(e => e.onPreRender());

        this.events.fire('prerender', this.camera.entity.getWorldTransform());

        // debug - display scene bound
        if (this.config.debug.showBound) {
            // draw element bounds
            this.forEachElement((e: Element) => {
                if (e.type === ElementType.splat) {
                    const splat = e as Splat;

                    const local = splat.localBound;
                    this.app.drawWireAlignedBox(
                        local.getMin(),
                        local.getMax(),
                        Color.RED,
                        true,
                        undefined,
                        splat.entity.getWorldTransform());

                    const world = splat.worldBound;
                    this.app.drawWireAlignedBox(
                        world.getMin(),
                        world.getMax(),
                        Color.GREEN);
                }
            });

            // draw scene bound
            this.app.drawWireAlignedBox(this.bound.getMin(), this.bound.getMax(), Color.BLUE);
        }
    }

    private onPostRender() {
        this.forEachElement(e => e.onPostRender());

        this.events.fire('postrender');

        // モデル読込直後の初期レイアウトずれを補正するため、postrender 後に限定してリサイズ/再計算を行う
        if (this.pendingViewportRefresh > 0 && !this.viewportRefreshInFlight) {
            const runs = this.pendingViewportRefresh;
            this.pendingViewportRefresh = 0;
            this.viewportRefreshInFlight = true;
            const runOnce = (remaining: number) => {
                // ダブル rAF: レイアウト/デバイスサイズが確定した後に実行
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const container = window.document.getElementById('canvas-container');
                        const pixelRatio = window.devicePixelRatio || 1;
                        let width = this.canvas?.width ?? this.app.graphicsDevice.width;
                        let height = this.canvas?.height ?? this.app.graphicsDevice.height;

                        if (container) {
                            const rect = container.getBoundingClientRect();
                            const measuredW = Math.ceil(rect.width * pixelRatio);
                            const measuredH = Math.ceil(rect.height * pixelRatio);
                            if (measuredW > 0 && measuredH > 0) {
                                width = measuredW;
                                height = measuredH;
                                this.canvasResize = { width, height };
                            }
                        }

                        this.events.fire('camera.resize', { width, height });
                        this.events.fire('cameraFrames.forceRefreshViewport');
                        this.forceRender = true;

                        if (remaining > 1) {
                            runOnce(remaining - 1);
                        } else {
                            this.viewportRefreshInFlight = false;
                        }
                    });
                });
            };
            runOnce(runs);
        }
    }
}

export { SceneConfig, Scene };
