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
    Mat4,
    Layer,
    Quat,
    Ray,
    RenderPass,
    RenderPassForward,
    RenderTarget,
    Texture,
    Vec3,
    Vec4
} from 'playcanvas';

import { applyView } from './cameras/apply-view';
import { cameraAngles, quaternionFromAngles } from './cameras/camera-legacy';
import { canvasLens } from './cameras/canvas-lens';
import type { RenderView } from './cameras/render-view';
import { PointerController } from './controllers';
import { Element, ElementType } from './element';
import { Picker } from './picker';
import type { ProjectedSplatRenderer } from './projected-splat-renderer';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/blit-shader';
import { Splat } from './splat';
import { TweenValue } from './tween-value';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

// work globals
const forwardVec = new Vec3();
const cameraPosition = new Vec3();
const ray = new Ray();
const vec = new Vec3();
const vecb = new Vec3();
const va = new Vec3();
const m = new Mat4();
const v4 = new Vec4();

// modulo dealing with negative numbers
const mod = (n: number, m: number) => ((n % m) + m) % m;

// scene.resolveMode -> the blit shader's quadResolve enum
const RESOLVE_UNIFORM = { none: 0, old: 1, new: 2 };

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

    minElev = -90;
    maxElev = 90;

    sceneRadius = 1;

    flySpeed = 1;
    navigationRoll = 0;
    nearOverride: number | null = null;

    controlMode: 'orbit' | 'fly' = 'orbit';

    // during fly-mode look, stores the camera position that must stay fixed
    // while the azim/elev tween smoothly converges
    lookCameraPos: Vec3 | null = null;

    picker: Picker;

    mainCamera: Entity;

    mainTarget: RenderTarget;
    splatTarget: RenderTarget;
    colorTarget: RenderTarget;
    workTarget: RenderTarget;
    overlayLayers: Layer[] = [];

    // Render passes
    clearPass: RenderPass;
    mainPass: RenderPassForward;
    splatPass: RenderPassForward;
    gizmoPass: RenderPassForward;
    finalPass: SimpleRenderPass;

    // overridden target size
    targetSizeOverride: { width: number, height: number } = null;

    // when set, overrides the tween-driven pose, fov and clipping planes each
    // update (used by 360 capture to render arbitrary face orientations that
    // the azim/elev pose system cannot express)
    poseOverride: { position: Vec3, rotation: Quat, fov: number, near: number, far: number } | null = null;

    // world transform of the user-facing camera pose. while a pose override
    // is active this holds the last tween-driven pose, so ui elements (view
    // cube, overlays) don't track the internal capture poses
    displayTransform = new Mat4();

    renderOverlays = true;
    active = true;
    inputEnabled = true;
    inputFilter: (event: PointerEvent) => boolean = () => true;
    paneRect = new Vec4(0, 0, 1, 1);
    paneSize: { width: number; height: number } | null = null;
    resolvedView: RenderView | null = null;
    splatLayer: Layer;
    worldLayer: Layer;
    exportGrid = false;
    projector: ProjectedSplatRenderer;
    private inputEntity: Entity;
    viewRevision = 0;
    private inputKey = '';

    get inputCamera() {
        return this.inputEntity.camera;
    }

    get inputContext() {
        return { camera: this.inputCamera, mainCamera: this.inputEntity, targetSize: this.scene.targetSize, renderOverlays: this.renderOverlays };
    }

    setView(view: RenderView | null) {
        this.resolvedView = view;
        if (view) applyView(this.mainCamera, view);
        else this.camera.projectionOffset = this.camera.projectionOffset.clone().set(0, 0);
        this.syncInputCamera();
        this.scene.forceRender = true;
    }

    syncInputCamera() {
        const target = this.inputCamera;
        const source = this.camera;
        const fovY = source.horizontalFov ? 2 * Math.atan(Math.tan(source.fov * Math.PI / 360) / source.aspectRatio) * 180 / Math.PI : source.fov;
        const lens = canvasLens({ aspect: source.aspectRatio, fovY, orthoHalfHeight: source.orthoHeight, offsetX: source.projectionOffset.x, offsetY: source.projectionOffset.y }, this.paneRect);
        const key = [...this.mainCamera.getWorldTransform().data, source.projection, source.nearClip, source.farClip, ...Object.values(lens)].join(',');
        if (key !== this.inputKey) this.viewRevision++;
        this.inputKey = key;
        this.inputEntity.setPosition(this.mainCamera.getPosition());
        this.inputEntity.setRotation(this.mainCamera.getRotation());
        target.projection = source.projection;
        target.aspectRatioMode = ASPECT_MANUAL;
        target.aspectRatio = lens.aspect;
        target.horizontalFov = false;
        target.fov = lens.fovY;
        target.orthoHeight = lens.orthoHalfHeight;
        target.nearClip = source.nearClip;
        target.farClip = source.farClip;
        target.projectionOffset = source.projectionOffset.clone().set(lens.offsetX, lens.offsetY);
        target.rect = new Vec4(0, 0, 1, 1);
    }

    updateCameraUniforms: () => void;

    constructor(private navigation = true) {
        super(ElementType.camera);

        // create the camera entity
        this.mainCamera = new Entity('Camera');
        this.mainCamera.addComponent('camera');
        this.inputEntity = new Entity('CameraInput');
        this.inputEntity.addComponent('camera', { enabled: false });
    }

    // ortho
    set ortho(value: boolean) {
        if (value !== this.ortho) {
            this.camera.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
            this.scene.events.fire('camera.ortho', value);
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

    setFocalPoint(point: Vec3, dampingFactorFactor: number = 1) {
        this.lookCameraPos = null;
        this.focalPointTween.goto(point, dampingFactorFactor * this.scene.config.controls.dampingFactor);
    }

    // Fly mode: rotate camera around itself, keeping the camera position fixed
    look(dx: number, dy: number) {
        const sensitivity = this.scene.config.controls.orbitSensitivity;
        const d = this.distance * this.sceneRadius / this.fovFactor;

        Camera.calcForwardVec(forwardVec, this.azim, this.elevation);
        const cameraPos = this.focalPoint.add(forwardVec.clone().mulScalar(d));

        const azim = this.azim - dx * sensitivity;
        const elev = this.elevation - dy * sensitivity;

        Camera.calcForwardVec(forwardVec, azim, elev);
        const focalPoint = cameraPos.clone().sub(forwardVec.clone().mulScalar(d));

        this.setAzimElev(azim, elev);
        this.focalPointTween.goto(focalPoint, this.scene.config.controls.dampingFactor);
        this.lookCameraPos = cameraPos;
    }

    setAzimElev(azim: number, elev: number, dampingFactorFactor: number = 1) {
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
        this.ortho = false;
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
        this.setFocalPoint(target, dampingFactorFactor);
        this.setAzimElev(azim, elev, dampingFactorFactor);
        this.setDistance(l / this.sceneRadius * this.fovFactor, dampingFactorFactor);
    }

    // set or clear the pose override and apply it immediately so subsequent
    // splat sorting and rendering see the new transform
    setPoseOverride(override: Camera['poseOverride']) {
        this.poseOverride = override;
        this.onUpdate(0);
    }

    // transform the world space coordinate to normalized screen coordinate
    worldToScreen(world: Vec3, screen: Vec3) {
        const camera = this.inputCamera;
        m.mul2(camera.projectionMatrix, camera.viewMatrix);

        v4.set(world.x, world.y, world.z, 1);
        m.transformVec4(v4, v4);

        screen.x = v4.x / v4.w * 0.5 + 0.5;
        screen.y = 1.0 - (v4.y / v4.w * 0.5 + 0.5);
        screen.z = v4.z / v4.w;
    }

    add() {
        const { camera, scene } = this;

        scene.cameraRoot.addChild(this.mainCamera);
        scene.cameraRoot.addChild(this.inputEntity);
        this.splatLayer ??= scene.splatLayer;
        this.worldLayer ??= scene.worldLayer;
        this.projector ??= scene.projectedSplatRenderer;

        // configure camera to render all layers
        this.mainCamera.camera.layers = [
            this.worldLayer.id,
            this.splatLayer.id,
            scene.overlayLayer.id,
            scene.centersLayer.id,
            scene.gizmoLayer.id
        ];

        // use manual aspect ratio mode so we can set it based on targetSize
        camera.aspectRatioMode = ASPECT_MANUAL;

        // create render passes
        const device = scene.graphicsDevice;
        const { app } = scene;
        const renderer = app.renderer;
        const composition = app.scene.layers;

        this.clearPass = new RenderPass(device);
        this.mainPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.mainPass.before = () => {
            this.updateCameraUniforms();
            scene.events.fire('view.prerender', this);
        };
        this.splatPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.gizmoPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.finalPass = new SimpleRenderPass(device,
            new ShaderQuad(device, vertexShader, fragmentShader, 'final-blit'), {
                vars: () => {
                    const gd = this.scene.graphicsDevice;
                    const ts = this.targetSize;
                    return {
                        srcTexture: this.mainTarget.colorBuffer,
                        // upscale the (possibly lower-res) target to the backbuffer
                        blitScale: [ts.width / (gd.width * this.paneRect.z), ts.height / (gd.height * this.paneRect.w)],
                        blitOffset: [gd.width * this.paneRect.x, gd.height * (1 - this.paneRect.y - this.paneRect.w)],
                        // stochastic frames composite their samples through the
                        // quad resolve; settled frames blit unfiltered
                        quadResolve: this.scene.movingRender ? RESOLVE_UNIFORM[this.scene.resolveMode] : 0
                    };
                }
            });

        const target = document.getElementById('canvas-container');
        if (this.navigation) this.controller = new PointerController(this, target);

        // apply scene config
        const config = scene.config;
        const controls = config.controls;

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

        // initial camera position and orientation
        this.setAzimElev(controls.initialAzim, controls.initialElev, 0);
        this.setDistance(controls.initialZoom, 0);

        // picker
        this.picker = new Picker(scene, this);

        scene.events.on('scene.boundChanged', this.onBoundChanged, this);

        // prepare camera-specific uniforms
        this.updateCameraUniforms = () => {
            const device = scene.graphicsDevice;
            const entity = this.mainCamera;
            const camera = entity.camera;

            const set = (name: string, vec: Vec3) => {
                device.scope.resolve(name).setValue([vec.x, vec.y, vec.z]);
            };

            // get frustum corners in world space
            const points = camera.camera.getFrustumCorners(-100);
            const worldTransform = this.worldTransform;
            for (let i = 0; i < points.length; i++) {
                worldTransform.transformPoint(points[i], points[i]);
            }

            // near
            if (camera.projection === PROJECTION_PERSPECTIVE) {
                // perspective
                set('near_origin', worldTransform.getTranslation());
                set('near_x', Vec3.ZERO);
                set('near_y', Vec3.ZERO);
            } else {
                // orthographic
                set('near_origin', points[3]);
                set('near_x', va.sub2(points[0], points[3]));
                set('near_y', va.sub2(points[2], points[3]));
            }

            // far
            set('far_origin', points[7]);
            set('far_x', va.sub2(points[4], points[7]));
            set('far_y', va.sub2(points[6], points[7]));
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

        this.controller?.destroy();
        this.controller = null;

        // cleanup render passes
        this.clearPass?.destroy();
        this.mainPass?.destroy();
        this.splatPass?.destroy();
        this.gizmoPass?.destroy();
        this.finalPass?.destroy();
        (this.finalPass?.renderable as ShaderQuad)?.destroy();
        this.camera.framePasses = null;

        const targets = [this.mainTarget, this.splatTarget, this.colorTarget, this.workTarget].filter(Boolean);
        const textures = new Set(targets.flatMap(target => [target.colorBuffer, target.depthBuffer]).filter(Boolean));
        targets.forEach(target => target.destroy());
        textures.forEach(texture => texture.destroy());
        this.mainTarget = this.splatTarget = this.colorTarget = this.workTarget = null;
        this.mainCamera.destroy();
        this.inputEntity.destroy();

        this.picker.destroy();
        this.picker = null;

        scene.events.off('scene.boundChanged', this.onBoundChanged, this);
    }

    // handle the scene's bound changing. the camera must be configured to render
    // the entire extents as well as possible.
    // also update the existing camera distance to maintain the current view
    onBoundChanged(bound: BoundingBox) {
        const prevDistance = this.distanceTween.value.distance * this.sceneRadius;
        this.sceneRadius = Math.max(1e-03, bound.halfExtents.length());
        this.setDistance(prevDistance / this.sceneRadius, 0);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.worldTransform.data);
        serializer.pack(
            this.fov,
            this.tonemapping,
            this.targetSize.width,
            this.targetSize.height
        );
    }

    // handle the viewer canvas resizing
    rebuildRenderTargets() {
        const { width, height } = this.targetSize;
        const { mainTarget, scene } = this;

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
            const pickDepthBuffer = createTexture('pickDepth', width, height, PIXELFORMAT_DEPTH);

            // create main render target
            this.mainTarget = new RenderTarget({
                colorBuffer,
                depthBuffer,
                autoResolve: false
            });

            // create MRT render target for splat pass
            this.splatTarget = new RenderTarget({
                colorBuffers: [
                    colorBuffer,        // RT0: main color (shared)
                    workBuffer          // RT1: overlay output (shared with workTarget)
                ],
                depthBuffer,
                autoResolve: false
            });

            this.colorTarget = new RenderTarget({
                colorBuffer,
                depthBuffer: pickDepthBuffer,
                depth: false,
                autoResolve: false
            });

            // create work buffer (used for picking, overlay output, and other operations)
            this.workTarget = new RenderTarget({
                colorBuffer: workBuffer,
                depthBuffer: pickDepthBuffer,
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
            this.mainPass.addLayer(this.camera, this.worldLayer, false, false);
            this.mainPass.addLayer(this.camera, this.worldLayer, true, false);

            // configure splat pass - MRT target, no clears
            this.splatPass.init(this.splatTarget);
            this.splatPass.addLayer(this.camera, this.splatLayer, false, false);
            this.splatPass.addLayer(this.camera, this.splatLayer, true, false);

            // configure gizmo pass. the centers and gizmo layers each clear depth
            // before their opaque step, after the depth-independent tool overlay,
            // so centers depth-test against each other alone and the gizmos then
            // start from a clean buffer again
            this.gizmoPass.init(this.mainTarget);
            this.gizmoPass.addLayer(this.camera, scene.overlayLayer, false, false);
            this.gizmoPass.addLayer(this.camera, scene.overlayLayer, true, false);
            for (const layer of this.overlayLayers) {
                this.gizmoPass.addLayer(this.camera, layer, false, false);
                this.gizmoPass.addLayer(this.camera, layer, true, false);
            }
            this.gizmoPass.addLayer(this.camera, scene.centersLayer, false, true);
            this.gizmoPass.addLayer(this.camera, scene.centersLayer, true, false);
            this.gizmoPass.addLayer(this.camera, scene.gizmoLayer, false, true);
            this.gizmoPass.addLayer(this.camera, scene.gizmoLayer, true, false);

            this.finalPass.init(null);

            // assign render passes to camera
            this.camera.framePasses = [this.clearPass, this.mainPass, this.splatPass, this.gizmoPass, this.finalPass];
        } else {
            // resize existing render targets
            const { splatTarget, colorTarget, workTarget } = this;

            mainTarget.resize(width, height);
            workTarget.resize(width, height);
            colorTarget.resize(width, height);
            splatTarget.resize(width, height);
        }

        this.camera.horizontalFov = width > height;
        this.camera.aspectRatio = width / height;
        scene.events.fire('camera.resize', { width, height });
    }

    onUpdate(deltaTime: number) {
        if (this.resolvedView) {
            applyView(this.mainCamera, this.resolvedView);
            this.displayTransform.copy(this.mainCamera.getWorldTransform());
            this.syncInputCamera();
            return;
        }
        // controller update
        if (this.inputEnabled) this.controller?.update(deltaTime);

        // update underlying values
        this.focalPointTween.update(deltaTime);
        this.azimElevTween.update(deltaTime);
        this.distanceTween.update(deltaTime);

        const azimElev = this.azimElevTween.value;
        const distance = this.distanceTween.value;

        Camera.calcForwardVec(forwardVec, azimElev.azim, azimElev.elev);

        if (this.lookCameraPos) {
            cameraPosition.copy(this.lookCameraPos);
            if (this.azimElevTween.timer >= this.azimElevTween.transitionTime) {
                this.lookCameraPos = null;
            }
        } else {
            cameraPosition.copy(forwardVec);
            cameraPosition.mulScalar(distance.distance * this.sceneRadius / this.fovFactor);
            cameraPosition.add(this.focalPointTween.value);
        }

        if (this.poseOverride) {
            // cameraRoot has identity transform, so local space is world space
            const { position, rotation, fov, near, far } = this.poseOverride;
            this.mainCamera.setLocalPosition(position);
            this.mainCamera.setLocalRotation(rotation);
            this.camera.fov = fov;
            this.near = near;
            this.far = far;
        } else {
            this.mainCamera.setLocalPosition(cameraPosition);
            this.mainCamera.setLocalRotation(quaternionFromAngles({ yaw: azimElev.azim, pitch: azimElev.elev, roll: this.navigationRoll }));

            this.fitClippingPlanes(this.mainCamera.getLocalPosition(), this.mainCamera.forward);

            this.displayTransform.copy(this.mainCamera.getWorldTransform());
        }

        const { camera } = this.mainCamera;
        const { targetSize } = this;

        // update ortho height
        camera.orthoHeight = this.distanceTween.value.distance * this.sceneRadius / this.fovFactor * (this.fov / 90) * (camera.horizontalFov ? targetSize.height / targetSize.width : 1);
        camera.camera._updateViewProjMat();
    }

    fitClippingPlanes(cameraPosition: Vec3, forwardVec: Vec3) {
        const bound = this.scene.bound;
        const boundRadius = bound.halfExtents.length();

        vec.sub2(bound.center, cameraPosition);
        const dist = vec.dot(forwardVec);

        if (this.ortho) {
            // orthographic has no perspective divide, so the near plane can sit
            // behind the camera. Span the whole scene bound (near goes negative
            // when the camera is inside it) so scene content is never clipped in
            // front of or behind the camera.
            const radius = Math.max(boundRadius, 1e-2);
            this.far = dist + radius;
            this.near = dist - radius;
        } else {
            const far = Math.max(dist + boundRadius, 1e-2);
            const near = Math.max(dist - boundRadius, far / (1024 * 16));

            this.far = far;
            this.near = Math.min(1.0, near);
        }
        if (this.nearOverride !== null) {
            this.near = this.nearOverride;
            this.far = Math.max(this.far, this.near + 0.01);
        }
    }

    onPreRender() {
        this.camera.enabled = this.active;
        if (!this.active) return;
        this.rebuildRenderTargets();
        if (this.resolvedView) applyView(this.mainCamera, this.resolvedView);
        this.syncInputCamera();
        this.updateCameraUniforms();
        const { width, height } = this.scene.graphicsDevice;
        const rect = this.paneRect;
        this.finalPass.viewport = new Vec4(Math.round(rect.x * width), Math.round(rect.y * height), Math.round(rect.z * width), Math.round(rect.w * height));
        this.finalPass.scissor = this.finalPass.viewport;
    }

    onPostRender() {

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
        // use the larger axis fov (which is always this.fov) so camera distance
        // stays constant regardless of viewport aspect ratio.
        return Math.sin(this.fov * math.DEG_TO_RAD * 0.5);
    }

    // world size of one screen pixel at the given view depth (ortho is
    // depth-independent)
    worldSizePerPixel(depth: number) {
        const pixelScale = (2 / this.camera.projectionMatrix.data[5]) / Math.max(1, this.scene.canvas.clientHeight);
        return this.ortho ? pixelScale : pixelScale * depth;
    }

    getRay(screenX: number, screenY: number, ray: Ray) {
        const { ortho } = this;
        const camera = this.inputCamera;
        const cameraPos = this.mainCamera.getPosition();

        // create the pick ray in world space
        if (ortho) {
            camera.screenToWorld(screenX, screenY, -1.0, vec);
            camera.screenToWorld(screenX, screenY, 1.0, vecb);
            vecb.sub(vec).normalize();
            ray.set(vec, vecb);
        } else {
            camera.screenToWorld(screenX, screenY, 1.0, vec);
            vec.sub(cameraPos).normalize();
            ray.set(cameraPos, vec);
        }
    }

    // intersect the scene at normalized screen coordinates (0-1 range) using
    // depth picking. The depth pass is rendered once per splat for the whole
    // batch, which keeps sampled brush strokes practical. The whole batch runs
    // under one camera frame: the caller's gesture-time pose if provided (the
    // call may run from the command queue well after the gesture), the live
    // camera otherwise.
    async intersectMany(
        points: { x: number, y: number }[],
        splats = this.scene.getElementsByType(ElementType.splat) as Splat[],
        pose?: { position: Vec3, rotation: Quat, orthoHeight: number, near: number, far: number }
    ) {
        const { scene } = this;
        const closestDepths = points.map(() => Infinity);
        const closestSplats: (Splat | null)[] = new Array(points.length).fill(null);

        const cameraPos = pose?.position ?? this.mainCamera.getPosition().clone();
        const cameraRot = pose?.rotation ?? this.mainCamera.getRotation().clone();
        const orthoHeight = pose?.orthoHeight ?? this.camera.orthoHeight;
        const near = pose?.near ?? this.near;
        const far = pose?.far ?? this.far;
        const forward = cameraRot.transformVector(Vec3.FORWARD, new Vec3());

        // run fn with the camera swapped to the snapshot frame and restored
        // before returning. The camera can move between the awaits below
        // (wheel, right-drag, fly keys, or the command queue delaying the
        // call), and the rays, every depth pass, and the near/far encoding
        // the depths are decoded with must all share one frame.
        const withSnapshotCamera = (fn: () => void) => {
            const livePos = this.mainCamera.getPosition().clone();
            const liveRot = this.mainCamera.getRotation().clone();
            const liveOrthoHeight = this.camera.orthoHeight;
            const liveNear = this.camera.nearClip;
            const liveFar = this.camera.farClip;
            this.mainCamera.setPosition(cameraPos);
            this.mainCamera.setRotation(cameraRot);
            this.camera.orthoHeight = orthoHeight;
            this.camera.nearClip = near;
            this.camera.farClip = far;
            this.syncInputCamera();
            try {
                fn();
            } finally {
                this.mainCamera.setPosition(livePos);
                this.mainCamera.setRotation(liveRot);
                this.camera.orthoHeight = liveOrthoHeight;
                this.camera.nearClip = liveNear;
                this.camera.farClip = liveFar;
                this.syncInputCamera();
            }
        };

        // build the pick rays under the snapshot frame. getRay seeds the ray
        // origin differently per projection - at the camera for perspective, on
        // (just behind) the near plane for ortho - so each origin's own view
        // depth is measured here rather than assuming near.
        const rays: { origin: Vec3, direction: Vec3, cosAngle: number, originDepth: number }[] = [];
        withSnapshotCamera(() => {
            for (const { x, y } of points) {
                this.getRay(x * scene.canvas.clientWidth, y * scene.canvas.clientHeight, ray);
                rays.push({
                    origin: ray.origin.clone(),
                    direction: ray.direction.clone(),
                    cosAngle: ray.direction.dot(forward),
                    originDepth: vecb.sub2(ray.origin, cameraPos).dot(forward)
                });
            }
        });

        // Find the splat with the smallest depth at each screen position. Each
        // depth pass composites through the projected cache front to back, so
        // it needs a sorted order under it, rendered under the same frame
        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i];

            withSnapshotCamera(() => {
                this.projector.renderSortedForPick(this);
                this.picker.prepareDepth(splat);
            });
            const depths = await this.picker.readDepths(points.map(point => this.localPoint(point.x, point.y)));
            for (let j = 0; j < depths.length; ++j) {
                const depth = depths[j];
                if (depth !== null && depth < closestDepths[j]) {
                    closestDepths[j] = depth;
                    closestSplats[j] = splat;
                }
            }
        }

        return points.map((point, index) => {
            const splat = closestSplats[index];
            if (!splat) {
                return null;
            }

            // Convert normalized depth to linear depth
            const linearDepth = closestDepths[index] * (far - near) + near;

            // Calculate world position from the snapshotted ray and view depth
            const { origin, direction, cosAngle, originDepth } = rays[index];
            const t = (linearDepth - originDepth) / cosAngle;
            const position = new Vec3();
            position.copy(origin).add(vec.copy(direction).mulScalar(t));

            // dolly distance for the caller: the along-view distance to the surface,
            // |linearDepth| / cosAngle. abs keeps behind-camera ortho depths positive
            // (a negative distance would clamp to minZoom and collapse the view), and
            // dividing by cosAngle reproduces perspective's ray distance unchanged.
            // Deliberately the along-view distance, not position.distance(cameraPos):
            // the latter includes the lateral offset for an off-axis ortho pick, which
            // would couple orthoHeight to where in the viewport the click landed.
            const distance = Math.abs(linearDepth) / cosAngle;

            return { splat, position, distance, depth: linearDepth };
        });
    }

    // intersect the scene at the given normalized screen coordinate (0-1 range) using depth picking
    async intersect(x: number, y: number) {
        return (await this.intersectMany([{ x, y }]))[0];
    }

    // intersect the scene at the normalized screen location (0-1 range) and focus the camera on this location
    async pickFocalPoint(x: number, y: number) {
        const result = await this.intersect(x, y);
        if (result) {
            const { scene } = this;

            this.setFocalPoint(result.position);
            this.setDistance(result.distance / this.sceneRadius * this.fovFactor);
            scene.events.fire('camera.focalPointPicked', {
                camera: this,
                splat: result.splat,
                position: result.position
            });
        }
    }

    // pick mode

    // render picker contents
    pickPrep(splat: Splat, mode: 'add' | 'remove' | 'set' | 'intersect') {
        this.picker.prepareId(splat, mode);
    }

    pick(x: number, y: number) {
        const point = this.localPoint(x, y);
        return this.picker.readId(point.x, point.y);
    }

    pickRect(x: number, y: number, width: number, height: number) {
        const point = this.localPoint(x, y);
        return this.picker.readIds(point.x, point.y, width / this.paneRect.z, height / this.paneRect.w);
    }

    localPoint(x: number, y: number) {
        const rect = this.paneRect;
        return { x: (x - rect.x) / rect.z, y: (y - (1 - rect.y - rect.w)) / rect.w };
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        return {
            position: pack3(this.position),
            rotation: this.mainCamera.getRotation().toArray(),
            navMode: this.controlMode,
            nearOverride: this.nearOverride,
            ortho: this.ortho,
            focalPoint: pack3(this.focalPointTween.target),
            azim: this.azim,
            elev: this.elevation,
            distance: this.distance,
            fov: this.fov,
            tonemapping: this.tonemapping
        };
    }

    docDeserialize(settings: any) {
        if (!settings) return;
        this.fov = settings.fov ?? 60;
        this.tonemapping = settings.tonemapping ?? 'linear';
        this.nearOverride = settings.nearOverride ?? null;
        this.ortho = settings.ortho ?? false;
        this.controlMode = settings.navMode === 'fpv' || settings.navMode === 'fly' ? 'fly' : 'orbit';
        if (Array.isArray(settings.position) || settings.fpvPosition) {
            const value = settings.position ?? settings.fpvPosition;
            const position = Array.isArray(value) ? new Vec3(value) : new Vec3(value.x, value.y, value.z);
            const rotation = Array.isArray(settings.rotation) ? new Quat(settings.rotation) : quaternionFromAngles({ yaw: settings.azim ?? 0, pitch: settings.elev ?? 0, roll: settings.roll ?? 0 });
            const angles = cameraAngles(rotation.toArray() as [number, number, number, number]);
            const target = this.controlMode === 'orbit' && Array.isArray(settings.position) && Array.isArray(settings.focalPoint) ?
                new Vec3(settings.focalPoint) : rotation.transformVector(new Vec3(0, 0, -1)).add(position);
            this.setPose(position, target, 0);
            this.setAzimElev(angles.yaw, angles.pitch, 0);
            this.navigationRoll = angles.roll;
            return;
        }
        this.navigationRoll = settings.roll ?? 0;
        this.setFocalPoint(new Vec3(settings.focalPoint), 0);
        this.setAzimElev(settings.azim, settings.elev, 0);
        this.setDistance(settings.distance, 0);
    }

    // offscreen render mode

    startOffscreenMode(width: number, height: number) {
        this.targetSizeOverride = { width, height };
        this.finalPass.enabled = false;
        this.rebuildRenderTargets();
        this.onUpdate(0);
    }

    endOffscreenMode() {
        this.targetSizeOverride = null;
        this.finalPass.enabled = true;
        this.rebuildRenderTargets();
        this.onUpdate(0);
    }

    get targetSize() {
        return this.targetSizeOverride ?? this.paneSize ?? this.scene.targetSize;
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
