import {
    math,
    ADDRESS_CLAMP_TO_EDGE,
    ASPECT_MANUAL,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_DEPTH,
    PROJECTION_ORTHOGRAPHIC,
    PROJECTION_PERSPECTIVE,
    TONEMAP_ACES,
    TONEMAP_ACES2,
    TONEMAP_FILMIC,
    TONEMAP_HEJL,
    TONEMAP_LINEAR,
    TONEMAP_NEUTRAL,
    BoundingBox,
    Color,
    Entity,
    Layer,
    Mat4,
    MeshInstance,
    Picker as ModelPicker,
    Plane,
    Quat,
    Ray,
    RenderPass,
    RenderPassForward,
    RenderTarget,
    Texture,
    Vec3,
    Vec4,
    WebglGraphicsDevice,
    BLEND_NONE
} from 'playcanvas';

import {
    applyCustomFrustumProjection,
    resolveCameraFramesFovFactor,
    resolveCameraFramesFramingFactor,
    resolveCameraFramesTargetSize,
    resolveLockFramingAspect,
    sanitizeNearOverride,
    shouldDropOrthoForAngles,
    type CameraCustomFrustum
} from './camera-frames-camera-integration';
import {
    applyCameraOrientation,
    resolveCameraFramesOrthoHeight,
    resolveCameraPositionWorldFromState
} from './camera-frames-camera-state';
import {
    buildCameraRayWithProjectionData,
    createCameraProjectionData,
    createCameraRayBasis,
    getOpticalAxisScreenCoordsWithProjectionData,
    resolveCameraProjectionData,
    resolveCameraRayBasis,
    screenToWorldFromDepthWithProjectionData,
    screenToWorldWithCameraProjectionData,
    worldToScreenWithProjectionData,
    type CameraRayBasis,
    type CameraProjectionData
} from './camera-matrices';
import { MIN_NEAR_CLIP } from './clip-constants';
import { PointerController } from './controllers';
import { Element, ElementType } from './element';
import { Model } from './model';
import { Picker } from './picker';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/blit-shader';
import { Splat } from './splat';
import { TweenValue } from './tween-value';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

// work globals
const cameraPosition = new Vec3();
const plane = new Plane();
const ray = new Ray();
const vec = new Vec3();
const vecb = new Vec3();
const va = new Vec3();
const cameraMatricesScratch: CameraProjectionData = createCameraProjectionData();
const cameraRayBasisScratch: CameraRayBasis = createCameraRayBasis();
const cameraPos = new Vec3();
const orbitOffset = new Vec3();
const orbitForward = new Vec3();
const v4 = new Vec4();
const quatOrbitYaw = new Quat();
const quatOrbitPitch = new Quat();

// modulo dealing with negative numbers
const mod = (n: number, m: number) => ((n % m) + m) % m;
const MAX_ORTHO_DEPTH_RATIO = 8192;
const GRID_FADE_END_DISTANCE = 1000;
const GRID_FAR_CLIP_MARGIN = 50;
type CameraDoc = {
    focalPoint: number[];
    azim: number;
    elev: number;
    distance: number;
    fov: number;
    tonemapping: string;
    roll: number;
    navMode: 'orbit' | 'fpv';
    ortho: boolean;
    customFrustum: CameraCustomFrustum | null;
    renderOverlays: boolean;
    fpvPosition?: number[];
    nearOverride?: number | null;
};

class Camera extends Element {
    /**
     * Calculate the forward vector given azimuth and elevation angles.
     *
     * @param {Vec3} result - The Vec3 to store the result in.
     * @param {number} azim - Azimuth angle in degrees.
     * @param {number} elev - Elevation angle in degrees.
     */
    static calcForwardVec(result: Vec3, azim: number, elev: number) {
        const ex = elev * math.DEG_TO_RAD;
        const ey = azim * math.DEG_TO_RAD;
        const s1 = Math.sin(-ex);
        const c1 = Math.cos(-ex);
        const s2 = Math.sin(-ey);
        const c2 = Math.cos(-ey);
        result.set(-c1 * s2, s1, c1 * c2);
    }

    controller: PointerController;
    focalPointTween = new TweenValue({ x: 0, y: 0.5, z: 0 });
    azimElevTween = new TweenValue({ azim: 30, elev: -15 });
    distanceTween = new TweenValue({ distance: 1 });
    rollTween = new TweenValue({ roll: 0 });

    minElev = -90;
    maxElev = 90;

    sceneRadius = 1;

    flySpeed = 1;

    controlMode: 'orbit' | 'fly' = 'orbit';

    // during fly-mode look, stores the camera position that must stay fixed
    // while the azim/elev tween smoothly converges
    lookCameraPos: Vec3 | null = null;

    picker: Picker;
    modelPicker: ModelPicker;
    selectionDepthPicker: ModelPicker;

    mainCamera: Entity;

    mainTarget: RenderTarget;
    splatTarget: RenderTarget;
    colorTarget: RenderTarget;
    workTarget: RenderTarget;

    // Render passes
    clearPass: RenderPass;
    mainPass: RenderPassForward;
    splatPass: RenderPassForward;
    selectionPass: RenderPassForward;
    gizmoPass: RenderPassForward;
    finalPass: SimpleRenderPass;

    // overridden target size
    private targetSizeOverride: { width: number, height: number } = null;
    suppressFinalBlit = false;

    renderOverlays = true;

    currentPickTarget: Splat | null = null;

    private customFrustum: CameraCustomFrustum | null = null;

    // framing lock (CAMERA FRAMES 用): true のときオートフィットを抑止
    lockFraming = false;
    lockFovAxis: 'vertical' | 'horizontal' | undefined = undefined;

    private syncCameraLayers() {
        const { scene } = this;
        if (!scene) {
            return;
        }

        const layerIds: number[] = [];
        const pushLayer = (layer?: Layer | null) => {
            if (layer && !layerIds.includes(layer.id)) {
                layerIds.push(layer.id);
            }
        };

        pushLayer(scene.backgroundLayer);
        pushLayer(scene.shadowLayer);
        pushLayer(scene.modelLightingLayer);
        pushLayer(scene.debugLayer);
        pushLayer(scene.exportOverlayLayer);
        pushLayer(scene.referenceBackLayer);
        pushLayer(scene.worldLayer);
        pushLayer(scene.splatLayer);
        pushLayer(scene.selectionVolumeLayer);
        pushLayer(scene.referenceFrontLayer);
        pushLayer(scene.overlayLayer);
        pushLayer(scene.gizmoLayer);

        this.entity.camera.layers = layerIds;
    }
    navMode: 'orbit' | 'fpv' = 'orbit';
    private fpvPosition = new Vec3(0, 0, 0);
    fpvSpeed = 1;
    fpvWheelSpeed = 1;
    fpvLookSensitivity = 0.002;
    private lastOrbitDistance = 1;
    private lastOrbitPivot = new Vec3(0, 0, 0);
    private lastOrbitWorldDistance = 0;
    private navModeChangeId = 0;
    // CAMERA FRAMES フィルムモード用にロックしたアスペクト比を保持
    private lockedAspectRatio: number | null = null;
    private lastTransformSent: { position: { x: number, y: number, z: number }, rotation: { yaw: number, pitch: number, roll: number } } | null = null;
    private lastTransformSentTime = 0;
    private transformSendIntervalMs = 33; // ~30Hz

    private nearOverride: number | null = null;
    private nearOverrideTransient = false;
    private selectionDepthFrame = -1;
    private selectionDepthTexture: Texture | null = null;
    private selectionDepthWidth = 0;
    private selectionDepthHeight = 0;
    private lastClipLog: {
        near: number;
        far: number;
        nearOverride: number | null;
        customFrustum: boolean;
        framesEnabled?: boolean;
        uiTarget?: 'viewport' | 'main';
    } | null = null;
    private lastClipLogAt = 0;
    private clipLogEnabled = false;

    private lockFramingHandler: (lock: boolean) => void;
    private lockFovAxisHandler: (axis: 'vertical' | 'horizontal' | undefined) => void;

    updateCameraUniforms: () => void;

    constructor() {
        super(ElementType.camera);

        // create the camera entity
        this.mainCamera = new Entity('Camera');
        this.mainCamera.addComponent('camera');
    }

    // ortho
    set ortho(value: boolean) {
        if (value !== this.ortho) {
            this.camera.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
            this.scene.events.fire('camera.ortho', value);
            this.scene.forceRender = true;
            this.emitTransform(true);
        }
    }

    get ortho() {
        return this.camera.projection === PROJECTION_ORTHOGRAPHIC;
    }

    // fov
    set fov(value: number) {
        this.camera.fov = value;
    }

    get fov() {
        return this.camera.fov;
    }

    // tonemapping
    set tonemapping(value: string) {
        const mapping: Record<string, number> = {
            linear: TONEMAP_LINEAR,
            neutral: TONEMAP_NEUTRAL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL
        };

        const tvalue = mapping[value];

        if (tvalue !== undefined && tvalue !== this.camera.toneMapping) {
            this.camera.toneMapping = tvalue;
            this.scene.events.fire('camera.tonemapping', value);
        }
    }

    get tonemapping() {
        switch (this.camera.toneMapping) {
            case TONEMAP_LINEAR: return 'linear';
            case TONEMAP_NEUTRAL: return 'neutral';
            case TONEMAP_ACES: return 'aces';
            case TONEMAP_ACES2: return 'aces2';
            case TONEMAP_FILMIC: return 'filmic';
            case TONEMAP_HEJL: return 'hejl';
        }
        return 'linear';
    }

    // near clip
    set near(value: number) {
        this.camera.nearClip = value;
    }

    get near() {
        return this.camera.nearClip;
    }

    // far clip
    set far(value: number) {
        this.camera.farClip = value;
    }

    get far() {
        return this.camera.farClip;
    }

    setCustomFrustum(frustum: CameraCustomFrustum | null) {
        this.customFrustum = frustum ? { ...frustum } : null;
        applyCustomFrustumProjection(this.entity.camera as any, frustum);
        this.scene.forceRender = true;
    }

    getCustomFrustum() {
        return this.customFrustum ? { ...this.customFrustum } : null;
    }

    // focal point
    get focalPoint() {
        const t = this.focalPointTween.target;
        return new Vec3(t.x, t.y, t.z);
    }

    // azimuth, elevation
    get azimElev() {
        return this.azimElevTween.target;
    }

    get azim() {
        return this.azimElev.azim;
    }

    get elevation() {
        return this.azimElev.elev;
    }

    get distance() {
        return this.distanceTween.target.distance;
    }

    setNearOverride(value: number | null | undefined, options?: { transient?: boolean }) {
        const sanitized = sanitizeNearOverride(value);
        this.nearOverride = sanitized;
        this.nearOverrideTransient = options?.transient === true;

        // すぐに反映して UI と同期させる
        this.fitClippingPlanes(this.entity.getLocalPosition(), this.entity.forward);
        this.scene.forceRender = true;
    }

    getNearOverride() {
        return this.nearOverride;
    }

    private updateLockFramingAspect() {
        const cam = this.entity.camera;
        const next = resolveLockFramingAspect(this.scene as any, this.targetSize, this.lockFraming, this.lockFovAxis);
        this.lockedAspectRatio = next.lockedAspectRatio;
        if (next.aspectRatio !== null) {
            cam.aspectRatio = next.aspectRatio;
        } else if (!(typeof cam.aspectRatio === 'number' && isFinite(cam.aspectRatio) && cam.aspectRatio > 0)) {
            cam.aspectRatio = 1;
        }
        if (next.horizontalFov !== null) {
            cam.horizontalFov = next.horizontalFov;
        }
    }

    getLockedAspectRatio() {
        return this.lockedAspectRatio;
    }

    setFocalPoint(point: Vec3, dampingFactorFactor: number = 1) {
        this.lookCameraPos = null;
        this.focalPointTween.goto(point, dampingFactorFactor * this.scene.config.controls.dampingFactor);
    }

    // Fly mode: rotate camera around itself, keeping the camera position fixed
    look(dx: number, dy: number) {
        const sensitivity = this.scene.config.controls.orbitSensitivity;
        const d = this.distance * this.sceneRadius / this.fovFactor;

        Camera.calcForwardVec(orbitForward, this.azim, this.elevation);
        const currentCameraPos = this.focalPoint.clone().add(orbitForward.clone().mulScalar(d));

        const azim = this.azim - dx * sensitivity;
        const elev = this.elevation - dy * sensitivity;

        Camera.calcForwardVec(orbitForward, azim, elev);
        const focalPoint = currentCameraPos.clone().sub(orbitForward.clone().mulScalar(d));

        this.setAzimElev(azim, elev);
        this.focalPointTween.goto(focalPoint, this.scene.config.controls.dampingFactor);
        this.lookCameraPos = currentCameraPos;
    }

    private applyAzimElev(azim: number, elev: number, dampingFactorFactor: number, options?: { dropOrtho?: boolean }) {
        // clamp
        azim = mod(azim, 360);
        elev = Math.max(this.minElev, Math.min(this.maxElev, elev));

        const t = this.azimElevTween;
        t.goto({ azim, elev }, dampingFactorFactor * this.scene.config.controls.dampingFactor);

        // handle wraparound
        if (t.source.azim - azim < -180) {
            t.source.azim += 360;
        } else if (t.source.azim - azim > 180) {
            t.source.azim -= 360;
        }

        // return to perspective mode on rotation
        if (options?.dropOrtho !== false) {
            this.ortho = false;
        }
    }

    setAzimElev(azim: number, elev: number, dampingFactorFactor: number = 1) {
        this.applyAzimElev(azim, elev, dampingFactorFactor, { dropOrtho: true });
    }

    setAzimElevWithOptions(azim: number, elev: number, dampingFactorFactor: number = 1, options?: { dropOrtho?: boolean }) {
        this.applyAzimElev(azim, elev, dampingFactorFactor, options);
    }

    setDistance(distance: number, dampingFactorFactor: number = 1) {
        this.lookCameraPos = null;

        const controls = this.scene.config.controls;

        // clamp
        distance = Math.max(controls.minZoom, Math.min(controls.maxZoom, distance));

        const t = this.distanceTween;
        t.goto({ distance }, dampingFactorFactor * controls.dampingFactor);
    }

    setPose(position: Vec3, target: Vec3, dampingFactorFactor: number = 1) {
        vec.sub2(target, position);
        const l = vec.length();
        const azim = Math.atan2(-vec.x / l, -vec.z / l) * math.RAD_TO_DEG;
        const elev = Math.asin(vec.y / l) * math.RAD_TO_DEG;
        const dropOrtho = shouldDropOrthoForAngles(azim, elev, this.azim, this.elevation);
        this.setFocalPoint(target, dampingFactorFactor);
        this.setAzimElevWithOptions(azim, elev, dampingFactorFactor, { dropOrtho });
        this.setDistance(l / this.sceneRadius * this.getFramingFactor(), dampingFactorFactor);
    }

    // transform the world space coordinate to normalized screen coordinate
    worldToScreen(world: Vec3, screen: Vec3) {
        const camera = this.camera;
        resolveCameraProjectionData(camera, cameraMatricesScratch, { fallbackToCurrentMatrices: true });
        if (!worldToScreenWithProjectionData(cameraMatricesScratch, world, screen)) {
            screen.set(0, 0, 0);
        }
    }

    // transform the world space coordinate to CSS screen coordinates
    worldToScreenCss(world: Vec3, screen: Vec3) {
        this.worldToScreen(world, screen);
        const canvas = this.scene?.canvas;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        screen.x *= w;
        screen.y *= h;
        return screen;
    }

    cssToNormalized(screenX: number, screenY: number) {
        const canvas = this.scene?.canvas;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        if (!(w > 0 && h > 0)) {
            return null;
        }
        return {
            x: Math.max(0, Math.min(1, screenX / w)),
            y: Math.max(0, Math.min(1, screenY / h))
        };
    }

    add() {
        const scene = this.scene;
        const { camera } = this;

        scene.cameraRoot.addChild(this.entity);

        // Reference layers are created lazily by the reference image renderer.
        // Keep the camera's layer list in sync so render-pass addLayer asserts do not fire.
        this.syncCameraLayers();

        const debugRender = (scene.config as any)?.camera?.debugRender;
        if (debugRender) {
            this.entity.camera.setShaderPass(`debug_${debugRender}`);
        }

        // use manual aspect ratio mode so we can set it based on targetSize
        camera.aspectRatioMode = ASPECT_MANUAL;

        // create render passes
        const device = scene.graphicsDevice;
        const { app } = scene;
        const renderer = app.renderer;
        const composition = app.scene.layers;

        this.clearPass = new RenderPass(device);
        this.mainPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.splatPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.selectionPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.gizmoPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.finalPass = new SimpleRenderPass(device,
            new ShaderQuad(device, vertexShader, fragmentShader, 'final-blit'), {
                vars: () => {
                    return {
                        srcTexture: this.mainTarget?.colorBuffer
                    };
                }
            });

        const target = document.getElementById('canvas-container') ?? scene.canvas;
        this.controller = new PointerController(this, target);

        // lock framing control (CAMERA FRAMES)
        this.lockFramingHandler = (lock: boolean) => {
            this.lockFraming = !!lock;
            this.updateLockFramingAspect();
        };
        this.lockFovAxisHandler = (axis: 'vertical' | 'horizontal' | undefined) => {
            this.lockFovAxis = axis ?? undefined;
        };
        this.scene.events.on('camera.setLockFraming', this.lockFramingHandler);
        this.scene.events.on('camera.setLockFovAxis', this.lockFovAxisHandler);
        this.scene.events.on('camera.setNavMode', (mode: 'orbit' | 'fpv', options?: { preservePose?: boolean; source?: string; }) => {
            this.setNavMode(mode ?? 'orbit', options);
        });

        // apply scene config
        const config = scene.config;
        const controls = config.controls;

        // configure background
        camera.clearColor.set(0, 0, 0, 0);

        this.minElev = (controls.minPolarAngle * 180) / Math.PI - 90;
        this.maxElev = (controls.maxPolarAngle * 180) / Math.PI - 90;

        // tonemapping
        camera.toneMapping = {
            linear: TONEMAP_LINEAR,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            neutral: TONEMAP_NEUTRAL
        }[config.camera.toneMapping];

        // exposure
        scene.app.scene.exposure = config.camera.exposure;

        this.fov = config.camera.fov;
        this.navMode = controls.navMode as ('orbit' | 'fpv') ?? 'orbit';
        this.fpvSpeed = controls.fpvSpeed ?? 1;
        this.fpvWheelSpeed = controls.fpvWheelSpeed ?? 1;
        this.fpvLookSensitivity = controls.fpvLookSensitivity ?? 0.002;
        this.fpvPosition.copy(this.focalPoint); // start at orbit pivot

        // initial camera position and orientation
        this.setAzimElev(controls.initialAzim, controls.initialElev, 0);
        this.setDistance(controls.initialZoom, 0);

        // picker
        const { width, height } = scene.targetSize;
        this.picker = new Picker(scene);
        this.modelPicker = new ModelPicker(scene.app, Math.max(1, width), Math.max(1, height));
        this.selectionDepthPicker = new ModelPicker(scene.app, Math.max(1, width), Math.max(1, height), true);

        scene.events.on('scene.boundChanged', this.onBoundChanged, this);

        // prepare camera-specific uniforms
        this.updateCameraUniforms = () => {
            const device = scene.graphicsDevice;
            const entity = this.entity;
            const camera = entity.camera;
            const { scope } = device;

            const set = (name: string, vec: Vec3) => {
                scope.resolve(name).setValue([vec.x, vec.y, vec.z]);
            };
            const setRayValid = (value: number) => {
                scope.resolve('ray_valid').setValue(value);
            };
            const applyRayBasis = (basis: CameraRayBasis) => {
                set('near_origin', basis.nearOrigin);
                set('near_x', basis.nearX);
                set('near_y', basis.nearY);
                set('far_origin', basis.farOrigin);
                set('far_x', basis.farX);
                set('far_y', basis.farY);
            };

            setRayValid(0);

            const customFrustumActive = this.customFrustum !== null;
            if (!resolveCameraRayBasis(camera, cameraMatricesScratch, cameraRayBasisScratch, {
                allowLegacyFallback: !customFrustumActive,
                preferLegacyOrtho: !customFrustumActive
            })) {
                return;
            }

            applyRayBasis(cameraRayBasisScratch);
            setRayValid(1);
        };

        // temp control of camera start
        const url = new URL(location.href);
        const focal = url.searchParams.get('focal');
        if (focal) {
            const parts = focal.toString().split(',');
            if (parts.length === 3) {
                this.setFocalPoint(new Vec3(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])), 0);
            }
        }
        const angles = url.searchParams.get('angles');
        if (angles) {
            const parts = angles.toString().split(',');
            if (parts.length === 2) {
                this.setAzimElev(parseFloat(parts[0]), parseFloat(parts[1]), 0);
            }
        }
        const distance = url.searchParams.get('distance');
        if (distance) {
            this.setDistance(parseFloat(distance), 0);
        }
    }

    remove() {
        const { scene } = this;

        // unregister lock controls
        if (this.lockFramingHandler) {
            scene.events.off('camera.setLockFraming', this.lockFramingHandler);
        }
        if (this.lockFovAxisHandler) {
            scene.events.off('camera.setLockFovAxis', this.lockFovAxisHandler);
        }

        this.controller.destroy();
        this.controller = null;

        // cleanup render passes
        this.clearPass?.destroy();
        this.mainPass?.destroy();
        this.splatPass?.destroy();
        this.selectionPass?.destroy();
        this.gizmoPass?.destroy();
        this.finalPass?.destroy();
        this.camera.renderPasses = null;

        scene.cameraRoot.removeChild(this.entity);

        this.picker?.destroy();
        this.picker = null;
        this.modelPicker?.destroy?.();
        this.modelPicker = null;
        this.selectionDepthPicker?.destroy?.();
        this.selectionDepthPicker = null;

        scene.events.off('scene.boundChanged', this.onBoundChanged, this);
    }

    // handle the scene's bound changing. the camera must be configured to render
    // the entire extents as well as possible.
    // also update the existing camera distance to maintain the current view
    onBoundChanged(bound: BoundingBox) {
        const prevDistance = this.distanceTween.value.distance * this.sceneRadius;
        this.sceneRadius = Math.max(1e-03, bound.halfExtents.length());
        this.setDistance(prevDistance / this.sceneRadius, 0);
        // 境界更新直後にクリッピングプレーンを再計算し、以後のリスナーが正しい far を参照できるようにする
        this.fitClippingPlanes(this.entity.getLocalPosition(), this.entity.forward);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.worldTransform.data);
        serializer.pack(
            this.fov,
            this.tonemapping,
            this.mainTarget?.width ?? this.scene.targetSize.width,
            this.mainTarget?.height ?? this.scene.targetSize.height,
            this.rollTween.target.roll ?? 0
        );
    }

    // handle the viewer canvas resizing
    rebuildRenderTargets() {
        const { scene } = this;
        this.syncCameraLayers();
        const size = this.targetSize ?? scene.targetSize;
        const width = size?.width ?? 0;
        const height = size?.height ?? 0;
        if (!(width > 0 && height > 0)) {
            return;
        }
        const { mainTarget } = this;

        // early out if size is unchanged
        if (mainTarget && mainTarget.width === width && mainTarget.height === height) {
            return;
        }

        if (!mainTarget) {
            // first time - construct render targets
            const { graphicsDevice } = scene;

            const createTexture = (name: string, width: number, height: number, format: number) => {
                return new Texture(graphicsDevice, {
                    name,
                    width,
                    height,
                    format,
                    mipmaps: false,
                    minFilter: FILTER_NEAREST,
                    magFilter: FILTER_NEAREST,
                    addressU: ADDRESS_CLAMP_TO_EDGE,
                    addressV: ADDRESS_CLAMP_TO_EDGE
                });
            };

            const colorBuffer = createTexture('cameraColor', width, height, PIXELFORMAT_RGBA16F);
            const workBuffer = createTexture('workColor', width, height, PIXELFORMAT_RGBA8);
            const depthBuffer = createTexture('cameraDepth', width, height, PIXELFORMAT_DEPTH);

            // create main render target
            this.mainTarget = new RenderTarget({
                colorBuffer,
                depthBuffer,
                flipY: false,
                autoResolve: false
            });
            this.entity.camera.renderTarget = this.mainTarget;

            // create MRT render target for splat pass
            this.splatTarget = new RenderTarget({
                colorBuffers: [
                    colorBuffer,        // RT0: main color (shared)
                    workBuffer          // RT1: overlay output (shared with workTarget)
                ],
                depthBuffer,
                flipY: false,
                autoResolve: false
            });

            this.colorTarget = new RenderTarget({
                colorBuffer,
                depth: false,
                autoResolve: false
            });

            // create work buffer (used for picking, overlay output, and other operations)
            this.workTarget = new RenderTarget({
                colorBuffer: workBuffer,
                depth: false,
                autoResolve: false
            });

            // set picker render targets
            this.picker.setRenderTargets(this.colorTarget, this.workTarget);

            // clear all targets
            this.clearPass.init(this.splatTarget);
            this.clearPass.setClearColor(new Color(0, 0, 0, 0));
            this.clearPass.setClearDepth(1);
            this.clearPass.setClearStencil(0);

            // configure main pass - world layer with clears
            this.mainPass.init(this.mainTarget);
            const addLayer = (pass: RenderPassForward, layer?: Layer | null) => {
                if (!layer) {
                    return;
                }
                pass.addLayer(this.camera, layer, false, false);
                pass.addLayer(this.camera, layer, true, false);
            };
            [
                scene.backgroundLayer,
                scene.shadowLayer,
                scene.modelLightingLayer,
                scene.debugLayer,
                scene.exportOverlayLayer,
                scene.referenceBackLayer,
                scene.worldLayer
            ].forEach(layer => addLayer(this.mainPass, layer));

            // configure splat pass - MRT target, no clears
            this.splatPass.init(this.splatTarget);
            addLayer(this.splatPass, scene.splatLayer);

            // configure selection pass - after splats, preserve world depth
            this.selectionPass.init(this.mainTarget);
            addLayer(this.selectionPass, scene.selectionVolumeLayer);

            // configure gizmo pass - clears depth/stencil only
            this.gizmoPass.init(this.colorTarget);
            [
                scene.referenceFrontLayer,
                scene.overlayLayer,
                scene.gizmoLayer
            ].forEach(layer => addLayer(this.gizmoPass, layer));
            this.gizmoPass.setClearDepth(1);
            this.gizmoPass.setClearStencil(0);
            if (this.gizmoPass.renderActions[0]) {
                this.gizmoPass.renderActions[0].clearDepth = true;
                this.gizmoPass.renderActions[0].clearStencil = true;
            }

            this.finalPass.init(null);

            // assign render passes to camera
            this.camera.renderPasses = [this.clearPass, this.mainPass, this.splatPass, this.selectionPass, this.gizmoPass, this.finalPass];
        } else {
            // resize existing render targets
            const { splatTarget, colorTarget, workTarget } = this;

            mainTarget.resize(width, height);
            workTarget.resize(width, height);
            colorTarget.resize(width, height);
            splatTarget.resize(width, height);
        }

        if (this.modelPicker) {
            this.modelPicker.resize(width, height);
        }
        if (this.selectionDepthPicker) {
            this.selectionDepthPicker.resize(width, height);
        }

        if (!this.lockFraming) {
            this.camera.horizontalFov = width > height;
            this.camera.aspectRatio = width / height;
        } else if (this.lockFovAxis !== undefined) {
            this.camera.horizontalFov = this.lockFovAxis === 'horizontal';
        } else {
            // CAMERA FRAMES有効時はデフォルトHorizontal
            this.camera.horizontalFov = true;
        }
        scene.events.fire('camera.resize', { width, height });
    }

    private getCameraPositionWorldFromState(out: Vec3, mode: 'orbit' | 'fpv' = this.navMode): Vec3 {
        if (mode !== 'fpv' && this.lookCameraPos) {
            out.copy(this.lookCameraPos);
            if (this.azimElevTween.timer >= this.azimElevTween.transitionTime) {
                this.lookCameraPos = null;
            }
            return out;
        }

        return resolveCameraPositionWorldFromState(
            out,
            mode,
            this.fpvPosition,
            this.azimElevTween.value,
            this.distanceTween.value.distance,
            this.sceneRadius,
            this.getFramingFactor(),
            this.focalPointTween.value
        );
    }

    private getOpticalAxisScreenPoint(): { x: number, y: number } | null {
        const canvas = this.scene?.canvas;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        if (!(w > 0 && h > 0)) {
            return null;
        }

        const { camera } = this.entity;
        if (!resolveCameraProjectionData(camera, cameraMatricesScratch)) {
            return {
                x: w * 0.5,
                y: h * 0.5
            };
        }

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        if (!getOpticalAxisScreenCoordsWithProjectionData(cameraMatricesScratch, vec)) {
            return {
                x: w * 0.5,
                y: h * 0.5
            };
        }

        const x = clamp(vec.x * w, 0, w - 1);
        const y = clamp(vec.y * h, 0, h - 1);

        return { x, y };
    }

    private async pickForwardHit(): Promise<{ pivot: Vec3, worldDist: number } | null> {
        if (!this.picker) {
            return null;
        }

        const pt = this.getOpticalAxisScreenPoint();
        if (!pt) {
            return null;
        }

        const canvas = this.scene?.canvas;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        if (!(w > 0 && h > 0)) {
            return null;
        }
        const hit = await this.intersectCss(pt.x, pt.y);
        if (!hit) {
            return null;
        }

        const worldDist = hit.distance;
        if (typeof worldDist !== 'number' || !isFinite(worldDist) || worldDist <= 1e-6) {
            return null;
        }

        return { pivot: hit.position, worldDist };
    }

    private syncEntityTransformFromState() {
        const azimElev = this.azimElevTween.value;
        const roll = this.rollTween.value.roll;

        this.getCameraPositionWorldFromState(cameraPosition);
        this.entity.setLocalPosition(cameraPosition);
        applyCameraOrientation(this.entity, azimElev, roll);

        this.fitClippingPlanes(this.entity.getLocalPosition(), this.entity.forward);

        const { camera } = this.entity;
        const orthoHeight = resolveCameraFramesOrthoHeight(
            this.lockFraming,
            this.navMode,
            this.targetSizeOverride ?? this.scene.targetSize,
            this.distanceTween.value.distance,
            this.sceneRadius,
            this.getFramingFactor(),
            this.fov,
            camera.horizontalFov
        );
        if (orthoHeight !== null) {
            camera.orthoHeight = orthoHeight;
        }
        camera.camera._updateViewProjMat();
    }

    onUpdate(deltaTime: number) {
        // controller update
        this.controller.update(deltaTime);

        // update underlying values
        this.focalPointTween.update(deltaTime);
        this.azimElevTween.update(deltaTime);
        this.distanceTween.update(deltaTime);
        this.rollTween.update(deltaTime);
        this.syncEntityTransformFromState();

        // push live transform for UI sync (only when変化あり＆間引き)
        this.emitTransform();
    }

    private isClipValueChanged(current: number, previous: number): boolean {
        const absDelta = Math.abs(current - previous);
        if (absDelta >= 1e-3) {
            return true;
        }
        const denom = Math.max(Math.abs(previous), 1e-6);
        return absDelta / denom >= 0.01;
    }

    private logClipPlanes(reason: string, near: number, far: number) {
        const enabled = !!this.scene?.config?.debug?.logClipPlanes;
        if (!enabled) {
            if (this.clipLogEnabled) {
                this.clipLogEnabled = false;
                this.lastClipLog = null;
                this.lastClipLogAt = 0;
            }
            return;
        }

        if (!this.clipLogEnabled) {
            this.clipLogEnabled = true;
            this.lastClipLog = null;
            this.lastClipLogAt = 0;
        }

        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const minIntervalMs = 100;
        const events = this.scene?.events;
        const framesEnabled = events?.functions?.has('cameraFrames.enabled') ?
            (events.invoke('cameraFrames.enabled') as boolean) :
            undefined;
        const uiTarget = events?.functions?.has('cameraFrames.uiTarget') ?
            (events.invoke('cameraFrames.uiTarget') as ('viewport' | 'main')) :
            undefined;

        const last = this.lastClipLog;
        const changed = !last ||
            this.isClipValueChanged(near, last.near) ||
            this.isClipValueChanged(far, last.far) ||
            last.nearOverride !== this.nearOverride ||
            last.customFrustum !== !!this.customFrustum ||
            ((framesEnabled !== undefined || last.framesEnabled !== undefined) && framesEnabled !== last.framesEnabled) ||
            ((uiTarget !== undefined || last.uiTarget !== undefined) && uiTarget !== last.uiTarget);

        if (!changed) {
            return;
        }

        if (now - this.lastClipLogAt < minIntervalMs) {
            return;
        }

        this.lastClipLogAt = now;
        this.lastClipLog = {
            near,
            far,
            nearOverride: this.nearOverride,
            customFrustum: !!this.customFrustum,
            framesEnabled,
            uiTarget
        };

        const payload: Record<string, unknown> = {
            near,
            far,
            nearOverride: this.nearOverride,
            customFrustum: !!this.customFrustum
        };
        if (framesEnabled !== undefined) {
            payload.framesEnabled = framesEnabled;
        }
        if (uiTarget !== undefined) {
            payload.uiTarget = uiTarget;
        }

        console.log(`[clip] ${reason}`, payload);
    }

    fitClippingPlanes(cameraPosition: Vec3, forwardVec: Vec3) {
        const bound = this.scene.bound;
        const boundRadius = bound.halfExtents.length();

        vec.sub2(bound.center, cameraPosition);
        const dist = vec.dot(forwardVec);

        let near = 1e-6;
        let far = boundRadius * 2;

        if (this.ortho) {
            const half = bound.halfExtents;
            const extent = Math.abs(forwardVec.x) * half.x +
                Math.abs(forwardVec.y) * half.y +
                Math.abs(forwardVec.z) * half.z;
            const minDist = dist - extent;
            const maxDist = dist + extent;
            if (isFinite(minDist) && isFinite(maxDist) && maxDist > 0) {
                near = Math.max(MIN_NEAR_CLIP, minDist);
                far = Math.max(maxDist, near * 2);
                if (near <= MIN_NEAR_CLIP) {
                    const ratio = far / Math.max(near, MIN_NEAR_CLIP);
                    if (ratio > MAX_ORTHO_DEPTH_RATIO) {
                        near = Math.max(near, far / MAX_ORTHO_DEPTH_RATIO);
                    }
                }
            } else {
                near = Math.max(MIN_NEAR_CLIP, far / (1024 * 16));
            }
        } else if (dist > 0) {
            far = dist + boundRadius;
            // if camera is placed inside the sphere bound calculate near based far
            near = Math.max(1e-6, dist < boundRadius ? far / (1024 * 16) : dist - boundRadius);
        } else {
            // if the scene is behind the camera
            near = far / (1024 * 16);
        }

        const dynamicPerspective = !this.ortho && this.targetSize === null;
        let hasSplats = false;
        if (dynamicPerspective) {
            hasSplats = this.scene.getElementsByType(ElementType.splat).length > 0;
            if (this.nearOverride === null && this.customFrustum === null && !hasSplats) {
                const nearCap = this.computeNoSplatNearCap(cameraPosition, forwardVec);
                if (typeof nearCap === 'number' && isFinite(nearCap) && nearCap > 1e-6) {
                    near = Math.min(near, nearCap);
                }
            }
        }

        if (this.nearOverride !== null) {
            // ユーザー指定の near を優先し、必要なら far を延長して成立させる
            const desiredNear = Math.max(MIN_NEAR_CLIP, this.nearOverride);
            if (desiredNear >= far) {
                far = desiredNear * 2;
            }
            near = desiredNear;
        }

        if (dynamicPerspective) {
            const farMin = this.computeFarMin(cameraPosition, forwardVec, dist, boundRadius, hasSplats);
            if (typeof farMin === 'number' && isFinite(farMin) && farMin > 0) {
                far = Math.max(far, farMin);
            }

            if (far <= near) {
                far = Math.max(near * 2, 1e-3);
            }
        }

        near = Math.max(1e-6, near);
        if (far <= near) {
            far = Math.max(near * 2, 1e-3);
        }

        this.far = far;
        this.near = near;
        this.logClipPlanes('fit', near, far);
    }

    private getInfiniteGridPlaneIndex(): 0 | 1 | 2 {
        if (!this.ortho) {
            return 1;
        }

        const cmp = (a: Vec3, b: Vec3) => 1.0 - Math.abs(a.dot(b)) < 1e-03;
        const z = this.entity.getWorldTransform().getZ();
        return cmp(z, Vec3.RIGHT) ? 0 : (cmp(z, Vec3.BACK) ? 2 : 1);
    }

    private tryGetMainCameraPosition(result: Vec3): boolean {
        const events = this.scene?.events;
        if (!events || !events.functions?.has('cameraFrames.mainTransform')) {
            return false;
        }

        const transform = events.invoke('cameraFrames.mainTransform') as any;
        const pos = transform?.position;
        const x = pos?.x;
        const y = pos?.y;
        const z = pos?.z;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
            return false;
        }
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
            return false;
        }
        result.set(x, y, z);
        return true;
    }

    private computeMainCameraDepth(cameraPosition: Vec3, forwardVec: Vec3): number | null {
        if (!this.tryGetMainCameraPosition(va)) {
            return null;
        }

        vecb.sub2(va, cameraPosition);
        const dMain = vecb.dot(forwardVec);
        if (!isFinite(dMain) || dMain <= 0) {
            return null;
        }
        return dMain;
    }

    private computeNoSplatNearCap(cameraPosition: Vec3, forwardVec: Vec3): number | null {
        let cap: number | null = null;

        const size = this.getRenderTargetSize();
        if (size) {
            const screenX = size.width * 0.5;
            const screenY = Math.max(0, size.height - 1);

            if (!this.getRay(screenX, screenY, ray, { space: 'target' })) {
                return null;
            }

            const planeIndex = this.getInfiniteGridPlaneIndex();
            const planeNormal = planeIndex === 0 ? Vec3.RIGHT : (planeIndex === 2 ? Vec3.BACK : Vec3.UP);
            plane.setFromPointNormal(Vec3.ZERO, planeNormal);

            if (plane.intersectsRay(ray, vec)) {
                vecb.sub2(vec, cameraPosition);
                const tBottom = vecb.dot(forwardVec);
                if (isFinite(tBottom) && tBottom > 0) {
                    cap = Math.max(1e-6, tBottom * 0.99);
                }
            }
        }

        const dMain = this.computeMainCameraDepth(cameraPosition, forwardVec);
        if (typeof dMain === 'number') {
            const mainCap = Math.max(1e-6, dMain * 0.99);
            cap = (cap === null) ? mainCap : Math.min(cap, mainCap);
        }

        if (cap === null) {
            return 0.1;
        }

        return cap;
    }

    private computeGridFarMin(): number | null {
        const overlaysEnabled = this.renderOverlays || this.scene.renderFlags.forceGridOverlay;
        if (!overlaysEnabled) {
            return null;
        }
        return GRID_FADE_END_DISTANCE + GRID_FAR_CLIP_MARGIN;
    }

    private computeFarMin(cameraPosition: Vec3, forwardVec: Vec3, dist: number, boundRadius: number, hasSplats: boolean): number | null {
        const candidates: number[] = [];

        const gridFarMin = this.computeGridFarMin();
        if (typeof gridFarMin === 'number' && isFinite(gridFarMin) && gridFarMin > 0) {
            candidates.push(gridFarMin);
        }

        if (!hasSplats) {
            const dMain = this.computeMainCameraDepth(cameraPosition, forwardVec);
            if (typeof dMain === 'number') {
                const frustumMargin = 5;
                candidates.push(dMain + frustumMargin);
            }

            if (dist <= 0) {
                vec.sub2(this.scene.bound.center, cameraPosition);
                const farMinBound = vec.length() + boundRadius;
                if (isFinite(farMinBound) && farMinBound > 0) {
                    candidates.push(farMinBound);
                }
            }
        }

        if (candidates.length === 0) {
            return null;
        }
        return Math.max(...candidates);
    }

    // ピボット点を中心にカメラを回転させる（FPVオービット用）
    orbitAround(pivot: Vec3, azimDelta: number, elevDelta: number) {
        orbitOffset.sub2(this.entity.getPosition(), pivot);
        const radius = orbitOffset.length();
        if (radius < 1e-6) {
            return;
        }

        const currentAngles = this.azimElevTween.value;
        const nextAzim = mod(currentAngles.azim - azimDelta, 360);
        const unclampedElev = currentAngles.elev - elevDelta;
        const nextElev = Math.max(this.minElev, Math.min(this.maxElev, unclampedElev));
        const appliedPitch = nextElev - currentAngles.elev;

        // yaw: world up軸でオフセットを回転
        quatOrbitYaw.setFromAxisAngle(Vec3.UP, -azimDelta);
        quatOrbitYaw.transformVector(orbitOffset, orbitOffset);

        // pitch: yaw後の右軸で回転
        Camera.calcForwardVec(orbitForward, nextAzim, currentAngles.elev);
        vecb.cross(Vec3.UP, orbitForward);
        if (vecb.lengthSq() < 1e-6) {
            // forward がほぼ真上/真下のときは現在の右軸を使う
            this.entity.getWorldTransform().getX(vecb);
            vecb.normalize();
        } else {
            vecb.normalize();
        }
        if (Math.abs(appliedPitch) > 1e-6) {
            quatOrbitPitch.setFromAxisAngle(vecb, appliedPitch);
            quatOrbitPitch.transformVector(orbitOffset, orbitOffset);
        }

        // 新しいカメラ位置
        va.copy(pivot).add(orbitOffset);
        this.entity.setPosition(va);

        // sync camera distance and focal point to the current pivot interaction
        // this prevents the camera from jumping when switching back to normal orbit or
        // when the pivot scale is much smaller than the scene bound
        const framingFactor = this.getFramingFactor();
        const newDistNorm = radius / this.sceneRadius * framingFactor;

        this.setAzimElev(nextAzim, nextElev, 0);
        this.setDistance(newDistNorm, 0);
        this.setFocalPoint(pivot, 0);

        if (this.navMode === 'fpv') {
            this.fpvPosition.copy(va);
        }

        this.emitTransform(true);
        this.scene.forceRender = true;
    }

    moveFpvLocal(delta: { forward?: number, right?: number, up?: number }) {
        const f = delta.forward ?? 0;
        const r = delta.right ?? 0;
        const u = delta.up ?? 0;
        if (f === 0 && r === 0 && u === 0) return;

        const worldTransform = this.entity.getWorldTransform();
        const xAxis = worldTransform.getX().mulScalar(r);
        const yAxis = worldTransform.getY().mulScalar(u);
        const zAxis = worldTransform.getZ().mulScalar(f);
        this.fpvPosition.add(xAxis).add(yAxis).add(zAxis);
    }

    setPositionWorld(pos: Vec3) {
        if (this.navMode === 'fpv') {
            this.fpvPosition.copy(pos);
            this.entity.setLocalPosition(pos);
        } else {
            // keep distance/pivot consistent: set position, recompute pivot from forward and distance
            const forward = this.entity.forward.clone();
            const distNorm = this.distanceTween.target.distance || 1;
            const worldDist = distNorm * this.sceneRadius / this.getFramingFactor();
            const pivot = pos.clone().add(forward.clone().mulScalar(worldDist));
            this.setFocalPoint(pivot, 0);
            this.setDistance(distNorm, 0);
            this.entity.setLocalPosition(pos);
        }
        this.emitTransform(true);
        this.scene.forceRender = true;
    }

    setRotationEuler(yawDeg: number, pitchDeg: number, rollDeg: number, lockRoll: boolean) {
        // clamp pitch to avoid gimbal singularity
        const pitch = Math.max(-89.9, Math.min(89.9, pitchDeg));
        const yaw = yawDeg;
        const currentRoll = this.rollTween.target.roll ?? this.rollTween.value.roll ?? 0;
        const roll = lockRoll ? currentRoll : rollDeg;
        const angleDelta = (a: number, b: number) => Math.abs(mod(a - b + 180, 360) - 180);
        const dropOrtho = angleDelta(yaw, this.azim) > 1e-4 || angleDelta(pitch, this.elevation) > 1e-4;

        // update tweens so UI stays in sync
        this.azimElevTween.goto({ azim: yaw, elev: pitch }, 0);
        if (!lockRoll) {
            this.rollTween.goto({ roll }, 0);
        }

        applyCameraOrientation(this.entity, { azim: yaw, elev: pitch }, lockRoll ? currentRoll : roll);

        if (dropOrtho) {
            this.ortho = false;
        }

        // also keep tween values in sync in case onUpdate hasn't run yet
        this.azimElevTween.value.azim = yaw;
        this.azimElevTween.value.elev = pitch;
        if (!lockRoll) {
            this.rollTween.value.roll = roll;
        }

        // orbit needs pivot/distance to remain consistent with new forward
        if (this.navMode === 'orbit') {
            const distNorm = this.distanceTween.target.distance || 1;
            const worldDist = distNorm * this.sceneRadius / this.getFramingFactor();
            const forward = this.entity.forward.clone();
            const pos = this.entity.getPosition();
            const pivot = pos.clone().add(forward.mulScalar(worldDist));
            this.setFocalPoint(pivot, 0);
        }

        this.emitTransform(true);
        this.scene.forceRender = true;
    }

    nudgeLocal(dx: number, dy: number, dz: number, scaleMul = 1) {
        if (dx === 0 && dy === 0 && dz === 0) return;
        const worldTransform = this.entity.getWorldTransform();
        const xAxis = worldTransform.getX().mulScalar(dx * scaleMul);
        const yAxis = worldTransform.getY().mulScalar(dy * scaleMul);
        const zAxis = worldTransform.getZ().mulScalar(dz * scaleMul);
        const delta = xAxis.add(yAxis).add(zAxis);
        const newPos = this.entity.getPosition().clone().add(delta);
        this.setPositionWorld(newPos);
    }

    getTransform() {
        const pos = this.entity.getPosition();
        const rotation = this.getRotationAngles();
        return {
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation
        };
    }

    getRotationAngles() {
        const azimElev = this.azimElevTween.value;
        const roll = this.rollTween.value.roll ?? 0;
        return { yaw: azimElev.azim, pitch: azimElev.elev, roll };
    }

    private emitTransform(force = false) {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const current = this.getTransform();

        const shouldSend = () => {
            if (force || !this.lastTransformSent) {
                return true;
            }
            const dt = now - this.lastTransformSentTime;
            if (dt < this.transformSendIntervalMs) {
                return false;
            }
            const pos = this.lastTransformSent.position;
            const rot = this.lastTransformSent.rotation;
            const posDelta = Math.max(
                Math.abs(current.position.x - pos.x),
                Math.abs(current.position.y - pos.y),
                Math.abs(current.position.z - pos.z)
            );
            const angleDelta = (a: number, b: number) => {
                const d = mod(a - b + 180, 360) - 180;
                return Math.abs(d);
            };
            const rotDelta = Math.max(
                angleDelta(current.rotation.yaw, rot.yaw),
                angleDelta(current.rotation.pitch, rot.pitch),
                angleDelta(current.rotation.roll, rot.roll)
            );
            const POS_EPS = 1e-4;
            const ROT_EPS = 1e-3;
            return posDelta > POS_EPS || rotDelta > ROT_EPS;
        };

        if (shouldSend()) {
            this.lastTransformSent = current;
            this.lastTransformSentTime = now;
            this.scene.events.fire('camera.transform', current);
        }
    }

    onPreRender() {
        this.rebuildRenderTargets();
        this.updateCameraUniforms();
    }

    onPostRender() {
        // no-op (final pass handles blit)
    }

    focus(options?: { focalPoint: Vec3, radius: number, speed: number }) {
        const getSplatFocalPoint = () => {
            for (const element of this.scene.elements) {
                if (element.type === ElementType.splat) {
                    const focalPoint = (element as Splat).focalPoint?.();
                    if (focalPoint) {
                        return focalPoint;
                    }
                }
            }
        };

        const focalPoint = options ? options.focalPoint : (getSplatFocalPoint() ?? this.scene.bound.center);
        const focalRadius = options ? options.radius : this.scene.bound.halfExtents.length();

        const fdist = focalRadius / this.sceneRadius;

        this.setDistance(isFinite(fdist) ? fdist : 1, options?.speed ?? 0);
        this.setFocalPoint(focalPoint, options?.speed ?? 0);
    }

    get fovFactor() {
        // In normal mode use the larger-axis FOV so distance stays stable across viewport resize.
        // CAMERA_FRAMES keeps its custom framing behavior inside resolveCameraFramesFovFactor.
        return resolveCameraFramesFovFactor(
            this.fov,
            this.camera.horizontalFov,
            this.scene.aspectViewport,
            this.scene as any,
            this.targetSizeOverride
        );
    }

    private getFramingFactor() {
        return resolveCameraFramesFramingFactor(this.lockFraming, this.fovFactor);
    }

    getLastOrbitWorldDistance() {
        return this.lastOrbitWorldDistance;
    }

    syncOrbitCache(distanceNorm?: number, pivot?: Vec3) {
        const controls = this.scene.config.controls;
        const minDistNorm = Math.max(controls.minZoom ?? 1e-6, 1e-6);
        const maxDistNorm = Math.max(controls.maxZoom ?? minDistNorm, minDistNorm);
        const rawDist = (typeof distanceNorm === 'number' && isFinite(distanceNorm) && distanceNorm > 0) ?
            distanceNorm :
            this.distanceTween.value.distance;
        const distNorm = (typeof rawDist === 'number' && isFinite(rawDist) && rawDist > 0) ?
            Math.max(minDistNorm, Math.min(maxDistNorm, rawDist)) :
            minDistNorm;
        const framingFactor = this.getFramingFactor();
        this.lastOrbitDistance = distNorm;
        this.lastOrbitWorldDistance = distNorm * this.sceneRadius / (framingFactor || 1e-6);
        if (pivot) {
            this.lastOrbitPivot.copy(pivot);
        } else {
            this.lastOrbitPivot.copy(this.focalPointTween.value);
        }
        return distNorm;
    }

    setNavMode(mode: 'orbit' | 'fpv', options?: { preservePose?: boolean; source?: string; }) {
        const next = mode ?? 'orbit';
        if (next === this.navMode) {
            return;
        }
        const navModeChangeId = ++this.navModeChangeId;
        this.getCameraPositionWorldFromState(cameraPosition, this.navMode);

        const preservePose = !!options?.preservePose;
        this.navMode = next;
        if (this.navMode === 'fpv') {
            // ensure perspective
            this.ortho = false;
            // sync fpv position to current camera location
            this.fpvPosition.copy(cameraPosition);
            if (preservePose) {
                this.syncOrbitCache();
            } else {
                const currentDist = this.distanceTween.value.distance;
                this.lastOrbitDistance = (typeof currentDist === 'number' && isFinite(currentDist) && currentDist > 0) ? currentDist : 1;
                this.lastOrbitPivot.copy(this.focalPointTween.value);
                const framingFactor = this.getFramingFactor();
                this.lastOrbitWorldDistance = this.lastOrbitDistance * this.sceneRadius / framingFactor;
            }
        } else {
            // when returning to orbit, keep the camera position fixed and reuse the previous orbit distance
            const controls = this.scene.config.controls;
            const currentAngles = { azim: this.azimElevTween.value.azim, elev: this.azimElevTween.value.elev };
            // freeze tweens to current values
            this.azimElevTween.goto(currentAngles, 0);

            const minDistNorm = Math.max(controls.minZoom ?? 1e-6, 1e-6);
            const maxDistNorm = Math.max(controls.maxZoom ?? minDistNorm, minDistNorm);
            const framingFactor = this.getFramingFactor();

            const rawBaseDistNorm = (typeof this.lastOrbitDistance === 'number' && isFinite(this.lastOrbitDistance)) ? this.lastOrbitDistance : NaN;
            const baseInvalid = !(typeof rawBaseDistNorm === 'number' && isFinite(rawBaseDistNorm) && rawBaseDistNorm > 0);
            const baseDistNorm = baseInvalid ? minDistNorm : Math.max(minDistNorm, Math.min(maxDistNorm, rawBaseDistNorm));
            let distNorm = baseDistNorm;
            let worldDist = distNorm * this.sceneRadius / framingFactor;

            if (preservePose) {
                const distRaw = this.distanceTween.value.distance;
                const validDist = typeof distRaw === 'number' && isFinite(distRaw) && distRaw > 0;
                distNorm = validDist ? Math.max(minDistNorm, Math.min(maxDistNorm, distRaw)) : minDistNorm;
                if (!validDist) {
                    this.setDistance(distNorm, 0);
                }
                worldDist = distNorm * this.sceneRadius / framingFactor;
                this.lastOrbitWorldDistance = worldDist;
                this.lastOrbitDistance = distNorm;
                this.lastOrbitPivot.copy(this.focalPointTween.value);
            } else {
                const RATIO_TRIGGER = 4;
                const ABS_TRIGGER = 50;
                const absThreshold = this.sceneRadius * ABS_TRIGGER;
                const allowPick = !this.targetSize && !this.ortho;

                const navCameraPos = cameraPosition.clone();
                const baseInvalidAtSwitch = baseInvalid;

                if (allowPick) {
                    (async () => {
                        const candidate = await this.pickForwardHit();
                        if (!candidate) {
                            return;
                        }
                        if (navModeChangeId !== this.navModeChangeId || this.navMode !== 'orbit') {
                            return;
                        }

                        const candidateThreshold = candidate.worldDist * RATIO_TRIGGER;
                        const currentDistRaw = this.distanceTween.value.distance;
                        const currentDist = (typeof currentDistRaw === 'number' && isFinite(currentDistRaw) && currentDistRaw > 0) ? currentDistRaw : minDistNorm;
                        const currentWorldDist = currentDist * this.sceneRadius / framingFactor;
                        if (baseInvalidAtSwitch || currentWorldDist > candidateThreshold || currentWorldDist > absThreshold) {
                            const desiredDistNorm = candidate.worldDist / this.sceneRadius * framingFactor;
                            const nextDistNorm = Math.max(minDistNorm, Math.min(maxDistNorm, desiredDistNorm));
                            const nextWorldDist = nextDistNorm * this.sceneRadius / framingFactor;

                            const forward = new Vec3();
                            Camera.calcForwardVec(forward, this.azimElevTween.value.azim, this.azimElevTween.value.elev);
                            const pivot = navCameraPos.clone().sub(forward.mulScalar(nextWorldDist));

                            this.setFocalPoint(pivot, 0);
                            this.setDistance(nextDistNorm, 0);

                            this.lastOrbitWorldDistance = nextWorldDist;
                            this.lastOrbitDistance = nextDistNorm;
                            this.lastOrbitPivot.copy(pivot);
                        }
                    })().catch(() => {});
                }

                if (baseInvalid || worldDist > absThreshold) {
                    const fallbackWorldDist = this.sceneRadius * 2;
                    const desiredDistNorm = fallbackWorldDist / this.sceneRadius * framingFactor;
                    distNorm = Math.max(minDistNorm, Math.min(maxDistNorm, desiredDistNorm));
                    worldDist = distNorm * this.sceneRadius / framingFactor;
                }

                // forward (pivot -> camera) using current view
                Camera.calcForwardVec(vec, currentAngles.azim, currentAngles.elev);
                va.copy(cameraPosition).sub(vec.mulScalar(worldDist));
                const pivot = va;

                this.setFocalPoint(pivot, 0);
                this.setDistance(distNorm, 0);

                // remember latest orbit params for future round-trips
                this.lastOrbitWorldDistance = worldDist;
                this.lastOrbitDistance = distNorm;
                this.lastOrbitPivot.copy(pivot);
            }
        }

        this.scene.events.fire('camera.navMode', this.navMode, options?.source ? { source: options.source } : undefined);
    }

    private getRenderTargetSize() {
        const size = resolveCameraFramesTargetSize(this.targetSizeOverride, this.scene as any);
        const width = size?.width ?? 0;
        const height = size?.height ?? 0;
        if (!(width > 0 && height > 0)) {
            return null;
        }
        return { width, height };
    }

    private mapCssToTargetCoords(screenX: number, screenY: number) {
        const size = this.getRenderTargetSize();
        const canvas = this.scene?.canvas;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        if (!size || !(w > 0 && h > 0)) {
            return null;
        }
        if (!isFinite(screenX) || !isFinite(screenY)) {
            return null;
        }
        return {
            x: screenX / w * size.width,
            y: screenY / h * size.height,
            width: size.width,
            height: size.height
        };
    }

    private mapTargetToCssCoords(screenX: number, screenY: number) {
        const size = this.getRenderTargetSize();
        const canvas = this.scene?.canvas;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        if (!size || !(size.width > 0 && size.height > 0) || !(w > 0 && h > 0)) {
            return null;
        }
        if (!isFinite(screenX) || !isFinite(screenY)) {
            return null;
        }
        return {
            x: screenX / size.width * w,
            y: screenY / size.height * h
        };
    }

    screenToWorld(screenX: number, screenY: number, cameraz: number, world: Vec3, options?: { space?: 'css' | 'target' }) {
        let sx = screenX;
        let sy = screenY;
        if (options?.space === 'target') {
            const mapped = this.mapTargetToCssCoords(screenX, screenY);
            if (!mapped) {
                return false;
            }
            sx = mapped.x;
            sy = mapped.y;
        }

        const { camera } = this.entity;
        const device = this.scene?.graphicsDevice;
        const clientWidth = device?.clientRect?.width ?? 0;
        const clientHeight = device?.clientRect?.height ?? 0;
        return screenToWorldWithCameraProjectionData(camera, cameraMatricesScratch, sx, sy, cameraz, clientWidth, clientHeight, world);
    }

    getRay(screenX: number, screenY: number, ray: Ray, options?: { space?: 'css' | 'target' }) {
        let sx = screenX;
        let sy = screenY;
        if (options?.space === 'target') {
            const mapped = this.mapTargetToCssCoords(screenX, screenY);
            if (!mapped) {
                return false;
            }
            sx = mapped.x;
            sy = mapped.y;
        }
        const camera = this.entity.camera;
        const device = this.scene?.graphicsDevice;
        const clientWidth = device?.clientRect?.width ?? 0;
        const clientHeight = device?.clientRect?.height ?? 0;
        return buildCameraRayWithProjectionData(camera, cameraMatricesScratch, sx, sy, clientWidth, clientHeight, ray);
    }

    // intersect the scene at the given normalized screen coordinate (0-1 range) using depth picking
    async intersect(x: number, y: number) {
        const { scene } = this;

        if (this.targetSize) {
            return null;
        }

        const canvas = scene?.canvas;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        if (!(w > 0 && h > 0)) {
            return null;
        }

        const screenX = x * w;
        const screenY = y * h;
        const mapped = this.mapCssToTargetCoords(screenX, screenY);
        if (!mapped) {
            return null;
        }

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const pickX = clamp(mapped.x, 0, mapped.width - 1);
        const pickY = clamp(mapped.y, 0, mapped.height - 1);
        const ix = Math.floor(pickX);
        const iy = Math.floor(pickY);

        const nx = clamp(mapped.x / mapped.width, 0, 1);
        const ny = clamp(mapped.y / mapped.height, 0, 1);

        const splats = scene.getElementsByType(ElementType.splat) as Splat[];
        const resolveIntersectionPosition = (normalizedDepth: number) => {
            const device = scene?.graphicsDevice;
            const clientWidth = device?.clientRect?.width ?? 0;
            const clientHeight = device?.clientRect?.height ?? 0;
            if (!(clientWidth > 0 && clientHeight > 0)) {
                return null;
            }

            if (resolveCameraProjectionData(this.entity.camera, cameraMatricesScratch, {
                fallbackToCurrentMatrices: true
            })) {
                cameraMatricesScratch.viewInv.getTranslation(cameraPos);
            } else {
                cameraPos.copy(this.entity.getPosition());
            }

            const position = new Vec3();
            if (!screenToWorldFromDepthWithProjectionData(
                cameraMatricesScratch,
                screenX,
                screenY,
                normalizedDepth,
                clientWidth,
                clientHeight,
                this.entity.camera,
                position
            )) {
                return null;
            }

            return {
                position,
                distance: vecb.sub2(position, cameraPos).length()
            };
        };

        const findSplatByGsplatComponent = (component: any) => {
            if (!component) {
                return null;
            }
            return splats.find(splat => splat.entity.gsplat === component) ?? null;
        };

        const pickLayers = [scene.worldLayer, scene.modelLightingLayer].filter((layer): layer is Layer => !!layer);
        const hasDirectUnifiedSplats =
            scene.splatRenderCapabilities.resolvedMode === 'unified-display' &&
            splats.some(splat => splat.visible && splat.entity.gsplat?.enabled);

        if (this.selectionDepthPicker && hasDirectUnifiedSplats && pickLayers.length > 0) {
            this.selectionDepthPicker.resize(mapped.width, mapped.height);
            this.selectionDepthPicker.prepare(this.entity.camera, this.scene.app.scene, pickLayers);

            const directDepth = await (this.selectionDepthPicker as any).getPointDepthAsync(ix, iy) as number | null;
            if (directDepth !== null) {
                const directHit = resolveIntersectionPosition(directDepth);
                if (!directHit) {
                    return null;
                }

                const selection = this.selectionDepthPicker.getSelection(ix, iy) as any[];
                for (let i = 0; i < selection.length; ++i) {
                    const entry = selection[i];
                    const gsplatComponent = entry?.entity?.gsplat ?? entry?.node?.gsplat ?? null;
                    const splat = findSplatByGsplatComponent(gsplatComponent);
                    if (splat) {
                        return {
                            splat,
                            element: splat,
                            position: directHit.position,
                            distance: directHit.distance
                        };
                    }

                    if (entry instanceof MeshInstance) {
                        const model = scene.events.invoke('mesh.fromGraphNode', entry.node) as Model;
                        if (model) {
                            return {
                                model,
                                element: model,
                                position: directHit.position,
                                distance: directHit.distance
                            };
                        }
                    }
                }

                return {
                    element: null as Element | null,
                    position: directHit.position,
                    distance: directHit.distance
                };
            }
        }

        let closestDepth = Infinity;
        let closestSplat: Splat | null = null;

        // Find the splat with the smallest depth at this screen position
        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i] as Splat;
            if (!splat.visible) {
                continue;
            }

            this.picker.prepareDepth(splat);
            const normalizedDepth = await this.picker.readDepth(nx, ny);

            if (normalizedDepth !== null && normalizedDepth < closestDepth) {
                closestDepth = normalizedDepth;
                closestSplat = splat;
            }
        }

        const worldLayer = scene.app.scene.layers.getLayerByName('World');
        const layersToPick = [worldLayer, scene.modelLightingLayer].filter(layer => !!layer);

        let closestModel: Model | null = null;
        let closestModelDepth: number | null = null;
        let closestModelPosition: Vec3 | null = null;

        if (this.selectionDepthPicker && layersToPick.length > 0) {
            this.selectionDepthPicker.resize(mapped.width, mapped.height);
            this.selectionDepthPicker.prepare(this.entity.camera, this.scene.app.scene, layersToPick);

            const worldDepth = await (this.selectionDepthPicker as any).getPointDepthAsync(ix, iy) as number | null;
            const worldPosition = worldDepth !== null ?
                await (this.selectionDepthPicker as any).getWorldPointAsync(ix, iy) as Vec3 | null :
                null;

            if (worldDepth !== null && worldPosition) {
                const selection = this.selectionDepthPicker.getSelection(ix, iy);
                for (let i = 0; i < selection.length; ++i) {
                    const mesh = selection[i];
                    if (!(mesh instanceof MeshInstance)) {
                        continue;
                    }

                    const model = scene.events.invoke('mesh.fromGraphNode', mesh.node) as Model;
                    if (model) {
                        closestModel = model;
                        closestModelDepth = worldDepth;
                        closestModelPosition = worldPosition.clone();
                        break;
                    }
                }
            }
        }

        const useSplatHit =
            closestSplat &&
            (
                closestModelDepth === null ||
                closestDepth <= closestModelDepth + 1e-5
            );

        if (useSplatHit) {
            const splatHit = resolveIntersectionPosition(closestDepth);
            if (!splatHit) {
                return null;
            }

            return {
                splat: closestSplat,
                element: closestSplat,
                position: splatHit.position,
                distance: splatHit.distance
            };
        }

        if (closestModelPosition) {
            if (resolveCameraProjectionData(this.entity.camera, cameraMatricesScratch, {
                fallbackToCurrentMatrices: true
            })) {
                cameraMatricesScratch.viewInv.getTranslation(cameraPos);
            } else {
                cameraPos.copy(this.entity.getPosition());
            }

            const distance = vecb.sub2(closestModelPosition, cameraPos).length();
            return {
                model: closestModel,
                element: closestModel,
                position: closestModelPosition,
                distance
            };
        }

        return null;
    }

    intersectCss(screenX: number, screenY: number) {
        const normalized = this.cssToNormalized(screenX, screenY);
        if (!normalized) {
            return null;
        }
        return this.intersect(normalized.x, normalized.y);
    }

    isSelectionVolumeDirectPassActive() {
        if (!this.renderOverlays || this.scene.splatRenderCapabilities.resolvedMode !== 'unified-display') {
            return false;
        }

        const splats = this.scene.getElementsByType(ElementType.splat) as Splat[];
        return splats.some(splat => splat.visible && splat.entity.gsplat?.enabled);
    }

    prepareSelectionVolumeDepth() {
        if (!this.isSelectionVolumeDirectPassActive() || !this.selectionDepthPicker || !this.scene.worldLayer) {
            this.selectionDepthFrame = -1;
            this.selectionDepthTexture = null;
            this.selectionDepthWidth = 0;
            this.selectionDepthHeight = 0;
            return null;
        }

        const renderTarget = this.mainTarget ?? this.entity.camera.renderTarget;
        const width = renderTarget?.width ?? this.targetSize?.width ?? this.scene.targetSize.width ?? this.scene.graphicsDevice.width;
        const height = renderTarget?.height ?? this.targetSize?.height ?? this.scene.targetSize.height ?? this.scene.graphicsDevice.height;

        if (!(width > 0 && height > 0)) {
            this.selectionDepthFrame = -1;
            this.selectionDepthTexture = null;
            this.selectionDepthWidth = 0;
            this.selectionDepthHeight = 0;
            return null;
        }

        if (
            this.selectionDepthFrame !== this.scene.app.frame ||
            this.selectionDepthWidth !== width ||
            this.selectionDepthHeight !== height ||
            !this.selectionDepthTexture
        ) {
            this.selectionDepthPicker.resize(width, height);
            this.selectionDepthPicker.prepare(this.entity.camera, this.scene.app.scene, [this.scene.worldLayer]);
            this.selectionDepthFrame = this.scene.app.frame;
            this.selectionDepthTexture = (this.selectionDepthPicker as any).depthBuffer ?? null;
            this.selectionDepthWidth = width;
            this.selectionDepthHeight = height;
        }

        if (!this.selectionDepthTexture) {
            return null;
        }

        return {
            texture: this.selectionDepthTexture,
            width: this.selectionDepthWidth,
            height: this.selectionDepthHeight
        };
    }

    // intersect the scene at the normalized screen location (0-1 range) and focus the camera on this location
    async pickFocalPoint(x: number, y: number) {
        const result = await this.intersect(x, y);
        if (result) {
            const { scene } = this;
            const targetElement = (result.element as Element) ?? (result.splat as Element) ?? (result.model as Element) ?? null;

            this.setFocalPoint(result.position);
            this.setDistance(result.distance / this.sceneRadius * this.getFramingFactor());
            scene.events.fire('camera.focalPointPicked', {
                camera: this,
                splat: result.splat,
                model: result.model,
                element: targetElement,
                position: result.position
            });
        }
    }

    // pick mode

    // render picker contents
    pickPrep(splat: Splat, mode: 'add' | 'remove' | 'set') {
        this.currentPickTarget = splat;

        // Ensure blending is disabled for picking so that alpha=0 IDs are written
        this.scene.splatRenderPicking.withPickingBlendDisabled(() => {
            this.picker.prepareId(splat, mode);
        });
    }

    private mapPickIdToLocal(id: number) {
        const mapped = this.scene.splatRenderPicking.mapPickId(id);
        if (!mapped || (this.currentPickTarget && mapped.splat !== this.currentPickTarget)) {
            return -1;
        }
        return mapped.local;
    }

    async pick(x: number, y: number, pixelRadius = 0) {
        const finish = (result: number) => {
            this.currentPickTarget = null;
            return result;
        };

        if (!(pixelRadius > 0)) {
            const id = await this.picker.readId(x, y);
            return finish(this.mapPickIdToLocal(id));
        }

        const targetSize = this.scene.targetSize;
        const width = targetSize?.width ?? 0;
        const height = targetSize?.height ?? 0;
        if (!(width > 0 && height > 0)) {
            const id = await this.picker.readId(x, y);
            return finish(this.mapPickIdToLocal(id));
        }

        const nx = Math.max(0, Math.min(1, x));
        const ny = Math.max(0, Math.min(1, y));
        const radiusX = pixelRadius / width;
        const radiusY = pixelRadius / height;
        const sampleX = Math.max(0, nx - radiusX);
        const sampleY = Math.max(0, ny - radiusY);
        const sampleWidth = Math.min(1 - sampleX, (pixelRadius * 2 + 1) / width);
        const sampleHeight = Math.min(1 - sampleY, (pixelRadius * 2 + 1) / height);
        const ids = await this.picker.readIds(sampleX, sampleY, sampleWidth, sampleHeight);

        const px = Math.floor(sampleX * width);
        const py = Math.floor(sampleY * height);
        const pw = Math.max(1, Math.ceil((sampleX + sampleWidth) * width) - px);
        const ph = Math.max(1, Math.ceil((sampleY + sampleHeight) * height) - py);
        const targetPx = Math.max(0, Math.min(width - 1, Math.floor(nx * width)));
        const targetPy = Math.max(0, Math.min(height - 1, Math.floor(ny * height)));
        const centerCol = Math.max(0, Math.min(pw - 1, targetPx - px));
        const centerRow = Math.max(0, Math.min(ph - 1, targetPy - py));

        let closestLocal = -1;
        let closestDistance = Number.POSITIVE_INFINITY;
        const count = Math.min(ids.length, pw * ph);

        for (let i = 0; i < count; i++) {
            const local = this.mapPickIdToLocal(ids[i]);
            if (local < 0) {
                continue;
            }

            const col = i % pw;
            const row = Math.floor(i / pw);
            const dx = col - centerCol;
            const dy = row - centerRow;
            const distance = dx * dx + dy * dy;
            if (distance < closestDistance) {
                closestDistance = distance;
                closestLocal = local;
            }
        }

        return finish(closestLocal);
    }

    async pickRect(x: number, y: number, width: number, height: number) {
        const ids = await this.picker.readIds(x, y, width, height);
        const result: number[] = [];

        for (let i = 0; i < ids.length; i++) {
            result.push(this.mapPickIdToLocal(ids[i]));
        }

        this.currentPickTarget = null;
        return result;
    }

    docSerialize(): CameraDoc {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        const result: CameraDoc = {
            focalPoint: pack3(this.focalPointTween.target),
            azim: this.azim,
            elev: this.elevation,
            distance: this.distance,
            fov: this.fov,
            tonemapping: this.tonemapping,
            roll: this.rollTween.target.roll ?? 0,
            navMode: this.navMode,
            ortho: this.ortho,
            customFrustum: this.getCustomFrustum(),
            renderOverlays: this.renderOverlays,
            fpvPosition: this.navMode === 'fpv' ? pack3(this.fpvPosition) : undefined
        };
        if (!this.nearOverrideTransient) {
            result.nearOverride = this.getNearOverride();
        }
        return result;
    }

    docDeserialize(settings: any, options?: { allowOrtho?: boolean; preserveNavMode?: boolean; source?: string; }) {
        if (!settings) {
            return;
        }

        const toVec3 = (value: any, fallback: Vec3) => {
            if (Array.isArray(value) && value.length >= 3) {
                return new Vec3(
                    Number(value[0] ?? fallback.x),
                    Number(value[1] ?? fallback.y),
                    Number(value[2] ?? fallback.z)
                );
            }
            if (value && typeof value === 'object') {
                return new Vec3(
                    Number(value.x ?? fallback.x),
                    Number(value.y ?? fallback.y),
                    Number(value.z ?? fallback.z)
                );
            }
            return fallback.clone();
        };

        const focalPoint = toVec3(settings.focalPoint, new Vec3(0, 0, 0));
        const azim = settings.azim ?? this.azim;
        const elev = settings.elev ?? this.elevation;
        const distance = settings.distance ?? this.distance;
        const allowOrtho = options?.allowOrtho !== false;
        const preserveNavMode = options?.preserveNavMode !== false;
        const hasOrtho = Object.prototype.hasOwnProperty.call(settings, 'ortho');
        let navMode = settings.navMode ?? this.navMode;
        let ortho = hasOrtho ? !!settings.ortho : this.ortho;

        if (navMode === 'fpv') {
            ortho = false;
        }
        if (ortho) {
            navMode = 'orbit';
        }
        if (!allowOrtho) {
            ortho = false;
        }

        this.setFocalPoint(focalPoint, 0);
        this.setAzimElevWithOptions(azim, elev, 0, { dropOrtho: !ortho });
        this.setDistance(distance, 0);
        if (settings.roll !== undefined) {
            this.rollTween.goto({ roll: settings.roll }, 0);
        }
        if (settings.fov !== undefined) {
            this.fov = settings.fov;
        }
        if (settings.tonemapping !== undefined) {
            this.tonemapping = settings.tonemapping;
        }
        if (!allowOrtho) {
            this.ortho = false;
        } else if (hasOrtho) {
            this.ortho = ortho;
        }
        if (settings.hasOwnProperty('nearOverride')) {
            this.setNearOverride(settings.nearOverride, { transient: false });
        }
        if (settings.hasOwnProperty('customFrustum')) {
            this.setCustomFrustum(settings.customFrustum);
        }
        if (settings.hasOwnProperty('renderOverlays')) {
            this.renderOverlays = !!settings.renderOverlays;
        }
        if (navMode && navMode !== this.navMode) {
            this.setNavMode(navMode, { preservePose: preserveNavMode, source: options?.source });
        }
        if (this.navMode === 'fpv' && settings.fpvPosition) {
            this.fpvPosition.copy(toVec3(settings.fpvPosition, this.fpvPosition));
        }
        this.syncEntityTransformFromState();
    }

    // offscreen render mode

    startOffscreenMode(width: number, height: number) {
        this.targetSize = { width, height };
        this.suppressFinalBlit = true;
        if (this.finalPass) {
            this.finalPass.enabled = false;
        }
        this.updateLockFramingAspect();
        this.rebuildRenderTargets();
        this.onUpdate(0);
    }

    endOffscreenMode() {
        this.targetSize = null;
        this.suppressFinalBlit = false;
        if (this.finalPass) {
            this.finalPass.enabled = true;
        }
        this.updateLockFramingAspect();
        this.rebuildRenderTargets();
        this.onUpdate(0);
    }

    get entity() {
        return this.mainCamera;
    }

    set targetSize(value: { width: number, height: number } | null) {
        this.targetSizeOverride = value ? { ...value } : null;
    }

    get targetSize() {
        return this.targetSizeOverride;
    }

    get camera() {
        return this.mainCamera.camera;
    }

    get worldTransform() {
        return this.mainCamera.getWorldTransform();
    }

    get position() {
        return this.mainCamera.getPosition();
    }

    get forward() {
        return this.mainCamera.forward;
    }
}

export { Camera };
