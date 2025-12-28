import {
    math,
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_DEPTH,
    PROJECTION_ORTHOGRAPHIC,
    PROJECTION_PERSPECTIVE,
    TONEMAP_NONE,
    TONEMAP_ACES,
    TONEMAP_ACES2,
    TONEMAP_FILMIC,
    TONEMAP_HEJL,
    TONEMAP_LINEAR,
    TONEMAP_NEUTRAL,
    BoundingBox,
    Entity,
    Mat4,
    Picker,
    Plane,
    Quat,
    Ray,
    RenderTarget,
    Texture,
    Vec3,
    Vec4,
    WebglGraphicsDevice,
    BLEND_NONE
} from 'playcanvas';

import { PointerController } from './controllers';
import { Element, ElementType } from './element';
import { Model } from './model';
import { Serializer } from './serializer';
import { Splat } from './splat';
import { TweenValue } from './tween-value';

// calculate the forward vector given azimuth and elevation
const calcForwardVec = (result: Vec3, azim: number, elev: number) => {
    const ex = elev * math.DEG_TO_RAD;
    const ey = azim * math.DEG_TO_RAD;
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    result.set(-c1 * s2, s1, c1 * c2);
};

// work globals
const cameraPosition = new Vec3();
const plane = new Plane();
const ray = new Ray();
const vec = new Vec3();
const vecb = new Vec3();
const va = new Vec3();
const orbitOffset = new Vec3();
const orbitForward = new Vec3();
const m = new Mat4();
const v4 = new Vec4();
const rollAxis = new Vec3();
const quatYawPitch = new Quat();
const quatRoll = new Quat();
const quatFinal = new Quat();
const quatOrbitYaw = new Quat();
const quatOrbitPitch = new Quat();

// modulo dealing with negative numbers
const mod = (n: number, m: number) => ((n % m) + m) % m;

class Camera extends Element {
    controller: PointerController;
    entity: Entity;
    focalPointTween = new TweenValue({ x: 0, y: 0.5, z: 0 });
    azimElevTween = new TweenValue({ azim: 30, elev: -15 });
    distanceTween = new TweenValue({ distance: 1 });
    rollTween = new TweenValue({ roll: 0 });

    minElev = -90;
    maxElev = 90;

    sceneRadius = 1;

    flySpeed = 5;

    picker: Picker;

    workRenderTarget: RenderTarget;

    // overridden target size
    targetSize: { width: number, height: number } = null;

    suppressFinalBlit = false;

    renderOverlays = true;

    currentPickTarget: Splat | null = null;

    private customFrustum: { left: number, right: number, bottom: number, top: number, near: number, far: number } | null = null;

    // framing lock (CAMERA FRAMES 用): true のときオートフィットを抑止
    lockFraming = false;
    lockFovAxis: 'vertical' | 'horizontal' | undefined = undefined;
    navMode: 'orbit' | 'fpv' = 'orbit';
    private fpvPosition = new Vec3(0, 0, 0);
    fpvSpeed = 1;
    fpvWheelSpeed = 1;
    fpvLookSensitivity = 0.002;
    private lastOrbitDistance = 1;
    private lastOrbitPivot = new Vec3(0, 0, 0);
    private lastOrbitWorldDistance = 0;
    // CAMERA FRAMES フィルムモード用にロックしたアスペクト比を保持
    private lockedAspectRatio: number | null = null;
    private lastTransformSent: { position: { x: number, y: number, z: number }, rotation: { yaw: number, pitch: number, roll: number } } | null = null;
    private lastTransformSentTime = 0;
    private transformSendIntervalMs = 33; // ~30Hz

    private nearOverride: number | null = null;
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
        this.entity = new Entity('Camera');
        this.entity.addComponent('camera');

        // NOTE: this call is needed for refraction effect to work correctly, but
        // it slows rendering and should only be made when required.
        // this.entity.camera.requestSceneColorMap(true);
    }

    // ortho
    set ortho(value: boolean) {
        if (value !== this.ortho) {
            this.entity.camera.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
            this.scene.events.fire('camera.ortho', value);
        }
    }

    get ortho() {
        return this.entity.camera.projection === PROJECTION_ORTHOGRAPHIC;
    }

    // fov
    set fov(value: number) {
        this.entity.camera.fov = value;
    }

    get fov() {
        return this.entity.camera.fov;
    }

    // tonemapping
    set tonemapping(value: string) {
        const mapping: Record<string, number> = {
            none: TONEMAP_NONE,
            linear: TONEMAP_LINEAR,
            neutral: TONEMAP_NEUTRAL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL
        };

        const tvalue = mapping[value];

        if (tvalue !== undefined && tvalue !== this.entity.camera.toneMapping) {
            this.entity.camera.toneMapping = tvalue;
            this.scene.events.fire('camera.tonemapping', value);
        }
    }

    get tonemapping() {
        switch (this.entity.camera.toneMapping) {
            case TONEMAP_NONE: return 'none';
            case TONEMAP_LINEAR: return 'linear';
            case TONEMAP_NEUTRAL: return 'neutral';
            case TONEMAP_ACES: return 'aces';
            case TONEMAP_ACES2: return 'aces2';
            case TONEMAP_FILMIC: return 'filmic';
            case TONEMAP_HEJL: return 'hejl';
        }
        return 'none';
    }

    // near clip
    set near(value: number) {
        this.entity.camera.nearClip = value;
    }

    get near() {
        return this.entity.camera.nearClip;
    }

    // far clip
    set far(value: number) {
        this.entity.camera.farClip = value;
    }

    get far() {
        return this.entity.camera.farClip;
    }

    setCustomFrustum(frustum: { left: number, right: number, bottom: number, top: number, near: number, far: number } | null) {
        this.customFrustum = frustum ? { ...frustum } : null;
        const cam = this.entity.camera;
        if (frustum) {
            cam.calculateProjection = (projMat: Mat4, _view?: number) => {
                projMat.setFrustum(frustum.left, frustum.right, frustum.bottom, frustum.top, frustum.near, frustum.far);
            };
        } else {
            cam.calculateProjection = null;
        }
        (cam as any)._projMatDirty = true;
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

    setNearOverride(value: number | null | undefined) {
        const sanitized = (typeof value === 'number' && isFinite(value)) ? Math.max(1e-6, value) : null;
        this.nearOverride = sanitized;

        // すぐに反映して UI と同期させる
        this.fitClippingPlanes(this.entity.getLocalPosition(), this.entity.forward);
        this.scene.forceRender = true;
    }

    getNearOverride() {
        return this.nearOverride;
    }

    private updateLockFramingAspect() {
        const cam = this.entity.camera;

        if (!this.lockFraming) {
            this.lockedAspectRatio = null;
            cam.aspectRatio = 0;
            return;
        }

        let aspect: number | null = null;

        const aspectInfo = this.scene?.events?.invoke('cameraFrames.aspectLock') as { aspect: number } | null;
        if (aspectInfo && typeof aspectInfo.aspect === 'number' && isFinite(aspectInfo.aspect) && aspectInfo.aspect > 0) {
            aspect = aspectInfo.aspect;
        } else {
            const size = this.targetSize ?? this.scene?.targetSize;
            if (size && size.height > 0) {
                aspect = size.width / size.height;
            }
        }

        if (aspect && isFinite(aspect) && aspect > 0) {
            this.lockedAspectRatio = aspect;
            cam.aspectRatio = aspect;
            if (this.lockFovAxis === undefined) {
                // デフォルトは Horizontal に固定 (アスペクト比による自動反転を防止)
                cam.horizontalFov = true;
            } else {
                cam.horizontalFov = this.lockFovAxis === 'horizontal';
            }
        } else {
            this.lockedAspectRatio = null;
            cam.aspectRatio = 0;
        }
    }

    getLockedAspectRatio() {
        return this.lockedAspectRatio;
    }

    setFocalPoint(point: Vec3, dampingFactorFactor: number = 1) {
        this.focalPointTween.goto(point, dampingFactorFactor * this.scene.config.controls.dampingFactor);
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
        this.setDistance(l / this.sceneRadius * this.getFramingFactor(), dampingFactorFactor);
    }

    // transform the world space coordinate to normalized screen coordinate
    worldToScreen(world: Vec3, screen: Vec3) {
        const { camera } = this.entity.camera;
        m.mul2(camera.projectionMatrix, camera.viewMatrix);

        v4.set(world.x, world.y, world.z, 1);
        m.transformVec4(v4, v4);

        screen.x = v4.x / v4.w * 0.5 + 0.5;
        screen.y = 1.0 - (v4.y / v4.w * 0.5 + 0.5);
        screen.z = v4.z / v4.w;
    }

    add() {
        this.scene.cameraRoot.addChild(this.entity);
        this.entity.camera.layers = this.entity.camera.layers.concat([
            this.scene.shadowLayer.id,
            this.scene.debugLayer.id,
            this.scene.exportOverlayLayer.id,
            this.scene.gizmoLayer.id
        ]);

        if (this.scene.config.camera.debugRender) {
            this.entity.camera.setShaderPass(`debug_${this.scene.config.camera.debugRender}`);
        }

        const target = document.getElementById('canvas-container');

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
        this.scene.events.on('camera.setNavMode', (mode: 'orbit' | 'fpv') => {
            this.setNavMode(mode ?? 'orbit');
        });

        // apply scene config
        const config = this.scene.config;
        const controls = config.controls;

        // configure background
        this.entity.camera.clearColor.set(0, 0, 0, 0);

        this.minElev = (controls.minPolarAngle * 180) / Math.PI - 90;
        this.maxElev = (controls.maxPolarAngle * 180) / Math.PI - 90;

        // tonemapping
        this.scene.camera.entity.camera.toneMapping = {
            linear: TONEMAP_LINEAR,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            neutral: TONEMAP_NEUTRAL
        }[config.camera.toneMapping];

        // exposure
        this.scene.app.scene.exposure = config.camera.exposure;

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
        const { width, height } = this.scene.targetSize;
        this.picker = new Picker(this.scene.app, width, height);

        // override buffer allocation to use our render target
        this.picker.allocateRenderTarget = () => { };
        this.picker.releaseRenderTarget = () => { };

        this.scene.events.on('scene.boundChanged', this.onBoundChanged, this);

        // prepare camera-specific uniforms
        this.updateCameraUniforms = () => {
            const device = this.scene.graphicsDevice;
            const entity = this.entity;
            const camera = entity.camera;

            const set = (name: string, vec: Vec3) => {
                device.scope.resolve(name).setValue([vec.x, vec.y, vec.z]);
            };

            // get frustum corners in world space
            const points = camera.camera.getFrustumCorners(-100);
            const worldTransform = entity.getWorldTransform();
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
        // unregister lock controls
        if (this.lockFramingHandler) {
            this.scene.events.off('camera.setLockFraming', this.lockFramingHandler);
        }
        if (this.lockFovAxisHandler) {
            this.scene.events.off('camera.setLockFovAxis', this.lockFovAxisHandler);
        }

        this.controller.destroy();
        this.controller = null;

        this.entity.camera.layers = this.entity.camera.layers.filter(layer => layer !== this.scene.shadowLayer.id);
        this.scene.cameraRoot.removeChild(this.entity);

        // destroy doesn't exist on picker?
        // this.picker.destroy();
        this.picker = null;

        this.scene.events.off('scene.boundChanged', this.onBoundChanged, this);
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
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(
            this.fov,
            this.tonemapping,
            this.entity.camera.renderTarget?.width,
            this.entity.camera.renderTarget?.height,
            this.rollTween.target.roll ?? 0
        );
    }

    // handle the viewer canvas resizing
    rebuildRenderTargets() {
        const device = this.scene.graphicsDevice;
        const { width, height } = this.targetSize ?? this.scene.targetSize;
        const format = this.scene.events.invoke('camera.highPrecision') ? PIXELFORMAT_RGBA16F : PIXELFORMAT_RGBA8;

        const rt = this.entity.camera.renderTarget;
        if (rt && rt.width === width && rt.height === height && rt.colorBuffer.format === format) {
            return;
        }

        // out with the old
        if (rt) {
            rt.destroyTextureBuffers();
            rt.destroy();

            this.workRenderTarget.destroy();
            this.workRenderTarget = null;
        }

        const createTexture = (name: string, width: number, height: number, format: number) => {
            return new Texture(device, {
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

        // in with the new
        const colorBuffer = createTexture('cameraColor', width, height, format);
        const depthBuffer = createTexture('cameraDepth', width, height, PIXELFORMAT_DEPTH);
        const renderTarget = new RenderTarget({
            colorBuffer,
            depthBuffer,
            flipY: false,
            autoResolve: false
        });
        this.entity.camera.renderTarget = renderTarget;
        const aspect = this.lockedAspectRatio ?? (height > 0 ? width / height : null);
        if (!this.lockFraming) {
            this.entity.camera.horizontalFov = width > height;
        } else if (this.lockFovAxis !== undefined) {
            this.entity.camera.horizontalFov = this.lockFovAxis === 'horizontal';
        } else {
            // CAMERA FRAMES有効時はデフォルトHorizontal
            this.entity.camera.horizontalFov = true;
        }

        const workColorBuffer = createTexture('workColor', width, height, PIXELFORMAT_RGBA8);

        // create pick mode render target (reuse color buffer)
        this.workRenderTarget = new RenderTarget({
            colorBuffer: workColorBuffer,
            depth: false,
            autoResolve: false
        });

        // set picker render target
        // @ts-ignore
        this.picker.renderTarget = this.workRenderTarget;

        this.scene.events.fire('camera.resize', { width, height });
    }

    private getCameraPositionWorldFromState(out: Vec3, mode: 'orbit' | 'fpv' = this.navMode): Vec3 {
        if (mode === 'fpv') {
            out.copy(this.fpvPosition);
            return out;
        }

        const azimElev = this.azimElevTween.value;
        const distNorm = this.distanceTween.value.distance;
        const framingFactor = this.getFramingFactor();

        calcForwardVec(out, azimElev.azim, azimElev.elev);
        out.mulScalar(distNorm * this.sceneRadius / framingFactor);
        out.add(this.focalPointTween.value);
        return out;
    }

    private getOpticalAxisScreenPoint(): { x: number, y: number } | null {
        const canvas = this.scene?.canvas;
        const w = canvas?.clientWidth ?? 0;
        const h = canvas?.clientHeight ?? 0;
        if (!(w > 0 && h > 0)) {
            return null;
        }

        let xNdc = 0;
        let yNdc = 0;

        if (this.customFrustum) {
            const { left, right, bottom, top } = this.customFrustum;
            const dx = right - left;
            const dy = top - bottom;
            if (typeof dx === 'number' && isFinite(dx) && Math.abs(dx) > 1e-6) {
                xNdc = -(right + left) / dx;
            }
            if (typeof dy === 'number' && isFinite(dy) && Math.abs(dy) > 1e-6) {
                yNdc = -(top + bottom) / dy;
            }
            if (!isFinite(xNdc)) xNdc = 0;
            if (!isFinite(yNdc)) yNdc = 0;
        }

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const x = clamp((xNdc * 0.5 + 0.5) * w, 0, w - 1);
        const y = clamp((0.5 - yNdc * 0.5) * h, 0, h - 1);

        return { x, y };
    }

    private pickForwardHit(): { pivot: Vec3, worldDist: number } | null {
        if (!this.picker) {
            return null;
        }

        const pt = this.getOpticalAxisScreenPoint();
        if (!pt) {
            return null;
        }

        const hit = this.intersect(pt.x, pt.y);
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
        this.applyOrientation(azimElev, roll);

        this.fitClippingPlanes(this.entity.getLocalPosition(), this.entity.forward);

        const framingFactor = this.getFramingFactor();
        const { camera } = this.entity;
        if (!this.lockFraming && this.navMode !== 'fpv') {
            camera.orthoHeight = this.distanceTween.value.distance * this.sceneRadius / framingFactor * (this.fov / 90) * (camera.horizontalFov ? this.scene.targetSize.height / this.scene.targetSize.width : 1);
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

        if (dist > 0) {
            far = dist + boundRadius;
            // if camera is placed inside the sphere bound calculate near based far
            near = Math.max(1e-6, dist < boundRadius ? far / (1024 * 16) : dist - boundRadius);
        } else {
            // if the scene is behind the camera
            near = far / (1024 * 16);
        }

        if (this.nearOverride !== null) {
            // ユーザー指定の near を優先し、必要なら far を延長して成立させる
            const desiredNear = Math.max(1e-6, this.nearOverride);
            if (desiredNear >= far) {
                far = desiredNear * 2;
            }
            near = desiredNear;
        } else if (
            this.customFrustum === null &&
            this.targetSize === null &&
            this.scene.getElementsByType(ElementType.splat).length === 0
        ) {
            const nearCap = this.computeNoSplatNearCap(cameraPosition, forwardVec);
            if (typeof nearCap === 'number' && isFinite(nearCap) && nearCap > 1e-6) {
                near = Math.min(near, nearCap);
            }

            const farMin = this.computeNoSplatFarMin(cameraPosition, forwardVec, dist, boundRadius);
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

        const w = this.scene?.canvas?.clientWidth ?? 0;
        const h = this.scene?.canvas?.clientHeight ?? 0;
        if (w > 0 && h > 0) {
            const screenX = w * 0.5;
            const screenY = Math.max(0, h - 1);

            this.getRay(screenX, screenY, ray);

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

    private computeNoSplatFarMin(cameraPosition: Vec3, forwardVec: Vec3, dist: number, boundRadius: number): number | null {
        const candidates: number[] = [];

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
        calcForwardVec(orbitForward, nextAzim, currentAngles.elev);
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

        // update tweens so UI stays in sync
        this.azimElevTween.goto({ azim: yaw, elev: pitch }, 0);
        if (!lockRoll) {
            this.rollTween.goto({ roll }, 0);
        }

        this.applyOrientation({ azim: yaw, elev: pitch }, lockRoll ? currentRoll : roll);

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
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const renderTarget = this.entity.camera.renderTarget;

        // resolve msaa buffer
        if (renderTarget.samples > 1) {
            renderTarget.resolve(true, false);
        }

        // copy render target with aspect viewport offsets if needed
        if (!this.suppressFinalBlit) {
            const aspect = this.scene.aspectViewport;
            const devW = device.width;
            const devH = device.height;

            const useAspect = aspect.enabled && aspect.width > 0 && aspect.height > 0;

            if (useAspect) {
                device.setViewport(aspect.offsetX, aspect.offsetY, aspect.width, aspect.height);
                device.setScissor(aspect.offsetX, aspect.offsetY, aspect.width, aspect.height);
            } else {
                device.setViewport(0, 0, devW, devH);
                device.setScissor(0, 0, devW, devH);
            }

            device.copyRenderTarget(renderTarget, null, true, false);

            // restore to full backbuffer in case anything else renders afterwards
            device.setViewport(0, 0, devW, devH);
            device.setScissor(0, 0, devW, devH);
        }
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
        // we set the fov of the longer axis. here we get the fov of the other (smaller) axis so framing
        // doesn't cut off the scene.
        const width = this.scene.aspectViewport.enabled ? this.scene.aspectViewport.width : this.scene.targetSize.width;
        const height = this.scene.aspectViewport.enabled ? this.scene.aspectViewport.height : this.scene.targetSize.height;
        const aspect = (width && height) ? this.entity.camera.horizontalFov ? height / width : width / height : 1;
        const fov = 2 * Math.atan(Math.tan(this.fov * math.DEG_TO_RAD * 0.5) * aspect);
        return Math.sin(fov * 0.5);
    }

    private getFramingFactor() {
        if (this.lockFraming) {
            return 1;
        }
        const factor = this.fovFactor;
        return (typeof factor === 'number' && isFinite(factor) && factor > 1e-6) ? factor : 1;
    }

    setNavMode(mode: 'orbit' | 'fpv') {
        const next = mode ?? 'orbit';
        if (next === this.navMode) {
            return;
        }
        this.getCameraPositionWorldFromState(cameraPosition, this.navMode);

        this.navMode = next;
        if (this.navMode === 'fpv') {
            // ensure perspective
            this.ortho = false;
            // sync fpv position to current camera location
            this.fpvPosition.copy(cameraPosition);
            const currentDist = this.distanceTween.value.distance;
            this.lastOrbitDistance = (typeof currentDist === 'number' && isFinite(currentDist) && currentDist > 0) ? currentDist : 1;
            this.lastOrbitPivot.copy(this.focalPointTween.value);
            const framingFactor = this.getFramingFactor();
            this.lastOrbitWorldDistance = this.lastOrbitDistance * this.sceneRadius / framingFactor;
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

            const RATIO_TRIGGER = 4;
            const ABS_TRIGGER = 50;
            const absThreshold = this.sceneRadius * ABS_TRIGGER;

            const candidate = this.pickForwardHit();
            if (candidate) {
                const candidateThreshold = candidate.worldDist * RATIO_TRIGGER;
                if (baseInvalid || worldDist > candidateThreshold || worldDist > absThreshold) {
                    const desiredDistNorm = candidate.worldDist / this.sceneRadius * framingFactor;
                    distNorm = Math.max(minDistNorm, Math.min(maxDistNorm, desiredDistNorm));
                    worldDist = distNorm * this.sceneRadius / framingFactor;
                }
            } else if (baseInvalid || worldDist > absThreshold) {
                const fallbackWorldDist = this.sceneRadius * 2;
                const desiredDistNorm = fallbackWorldDist / this.sceneRadius * framingFactor;
                distNorm = Math.max(minDistNorm, Math.min(maxDistNorm, desiredDistNorm));
                worldDist = distNorm * this.sceneRadius / framingFactor;
            }

            // forward (pivot -> camera) using current view
            calcForwardVec(vec, currentAngles.azim, currentAngles.elev);
            va.copy(cameraPosition).sub(vec.mulScalar(worldDist));
            const pivot = va;

            this.setFocalPoint(pivot, 0);
            this.setDistance(distNorm, 0);

            // remember latest orbit params for future round-trips
            this.lastOrbitWorldDistance = worldDist;
            this.lastOrbitDistance = distNorm;
            this.lastOrbitPivot.copy(pivot);
        }

        this.scene.events.fire('camera.navMode', this.navMode);
    }

    getRay(screenX: number, screenY: number, ray: Ray) {
        const { entity, ortho, scene } = this;
        const cameraPos = this.entity.getPosition();

        // create the pick ray in world space
        if (ortho) {
            entity.camera.screenToWorld(screenX, screenY, -1.0, vec);
            entity.camera.screenToWorld(screenX, screenY, 1.0, vecb);
            vecb.sub(vec).normalize();
            ray.set(vec, vecb);
        } else {
            entity.camera.screenToWorld(screenX, screenY, 1.0, vec);
            vec.sub(cameraPos).normalize();
            ray.set(cameraPos, vec);
        }
    }

    // intersect the scene at the given screen coordinate
    intersect(screenX: number, screenY: number) {
        const { scene } = this;

        const target = scene.canvas;
        const sx = screenX / target.clientWidth * scene.targetSize.width;
        const sy = screenY / target.clientHeight * scene.targetSize.height;

        this.getRay(screenX, screenY, ray);

        const splats = scene.getElementsByType(ElementType.splat);

        let closestD = 0;
        const closestP = new Vec3();
        let closestSplat: Splat | null = null;

        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i] as Splat;

            this.pickPrep(splat, 'set');
            const pickId = this.pick(sx, sy);

            if (pickId !== -1 && splat.calcSplatWorldPosition(pickId, vec)) {
                // create a plane at the world position facing perpendicular to the camera
                plane.setFromPointNormal(vec, this.entity.forward);

                // find intersection
                if (plane.intersectsRay(ray, vec)) {
                    const distance = vecb.sub2(vec, ray.origin).length();
                    if (!closestSplat || distance < closestD) {
                        closestD = distance;
                        closestP.copy(vec);
                        closestSplat = splat;
                    }
                }
            }
        }

        if (closestSplat) {
            return {
                splat: closestSplat,
                element: closestSplat,
                position: closestP,
                distance: closestD
            };
        }

        const worldLayer = scene.app.scene.layers.getLayerByName('World');
        const layersToPick = [worldLayer, scene.modelLightingLayer].filter(layer => !!layer);
        this.picker.resize(scene.targetSize.width, scene.targetSize.height);
        this.picker.prepare(this.entity.camera, this.scene.app.scene, layersToPick.length > 0 ? layersToPick : undefined);
        const selection = this.picker.getSelection(sx, sy);
        for (let i = 0; i < selection.length; ++i) {
            const mesh = selection[i];
            const model = scene.events.invoke('mesh.fromGraphNode', mesh.node) as Model;
            if (model) {
                if (mesh.aabb.intersectsRay(ray, closestP)) {
                    const distance = vecb.sub2(closestP, ray.origin).length();
                    return {
                        model,
                        element: model,
                        position: closestP,
                        distance
                    };
                }
                closestP.copy(mesh.aabb.center);
                const distance = vecb.sub2(closestP, ray.origin).length();
                return {
                    model,
                    element: model,
                    position: closestP,
                    distance
                };
            }
        }

        return null;
    }

    // intersect the scene at the screen location and focus the camera on this location
    pickFocalPoint(screenX: number, screenY: number) {
        const result = this.intersect(screenX, screenY);
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
    pickPrep(splat: Splat, op: 'add' | 'remove' | 'set') {
        const { width, height } = this.scene.targetSize;
        const worldLayer = this.scene.app.scene.layers.getLayerByName('World');
        const layersToPick = [worldLayer, this.scene.modelLightingLayer].filter(layer => !!layer);

        const device = this.scene.graphicsDevice;
        const events = this.scene.events;
        const alpha = events.invoke('camera.mode') === 'rings' ? 0.0 : 0.2;

        this.currentPickTarget = splat;

        device.scope.resolve('pickerAlpha').setValue(alpha);
        device.scope.resolve('pickMode').setValue(['add', 'remove', 'set'].indexOf(op));
        this.picker.resize(width, height);

        // Ensure blending is disabled for picking so that alpha=0 IDs are written
        const instance = this.scene.renderSystem.mergedEntity?.gsplat?.instance as any;
        const material = instance?.material;

        if (material) {
            const oldBlend = material.blendType;
            material.blendType = BLEND_NONE;
            material.update();
            this.picker.prepare(this.entity.camera, this.scene.app.scene, layersToPick);
            material.blendType = oldBlend;
            material.update();
        } else {
            this.picker.prepare(this.entity.camera, this.scene.app.scene, layersToPick);
        }
    }

    pick(x: number, y: number) {
        return this.pickRect(x, y, 1, 1)[0];
    }

    pickRect(x: number, y: number, width: number, height: number) {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const pixels = new Uint8Array(width * height * 4);

        // read pixels
        // @ts-ignore
        device.setRenderTarget(this.picker.renderTarget);
        device.updateBegin();
        // @ts-ignore
        device.readPixels(x, this.picker.renderTarget.height - y - height, width, height, pixels);
        device.updateEnd();

        const result: number[] = [];
        for (let i = 0; i < width * height; i++) {
            const id =
                pixels[i * 4] |
                (pixels[i * 4 + 1] << 8) |
                (pixels[i * 4 + 2] << 16) |
                (pixels[i * 4 + 3] << 24);

            const mapped = this.scene.renderSystem.mapPickId(id);
            if (!mapped || (this.currentPickTarget && mapped.splat !== this.currentPickTarget)) {
                result.push(-1);
            } else {
                result.push(mapped.local);
            }
        }

        this.currentPickTarget = null;
        return result;
    }

    // build orientation that applies roll around the camera's forward axis (after yaw/pitch)
    private applyOrientation(azimElev: { azim: number, elev: number }, rollDeg: number) {
        // yaw/pitch first
        quatYawPitch.setFromEulerAngles(azimElev.elev, azimElev.azim, 0);

        // forward axis after yaw/pitch (camera forward is -Z)
        rollAxis.set(0, 0, -1);
        quatYawPitch.transformVector(rollAxis, rollAxis);

        // roll about forward (PlayCanvas expects degrees)
        quatRoll.setFromAxisAngle(rollAxis, rollDeg);

        // apply yaw/pitch then roll (world-space roll around current forward)
        quatFinal.mul2(quatRoll, quatYawPitch);

        this.entity.setRotation(quatFinal);
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        return {
            focalPoint: pack3(this.focalPointTween.target),
            azim: this.azim,
            elev: this.elevation,
            distance: this.distance,
            fov: this.fov,
            tonemapping: this.tonemapping,
            roll: this.rollTween.target.roll ?? 0,
            navMode: this.navMode,
            ortho: this.ortho,
            nearOverride: this.getNearOverride(),
            customFrustum: this.getCustomFrustum(),
            renderOverlays: this.renderOverlays,
            fpvPosition: this.navMode === 'fpv' ? pack3(this.fpvPosition) : undefined
        };
    }

    docDeserialize(settings: any) {
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

        this.setFocalPoint(focalPoint, 0);
        this.setAzimElev(azim, elev, 0);
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
        if (settings.hasOwnProperty('ortho')) {
            this.ortho = !!settings.ortho;
        }
        if (settings.hasOwnProperty('nearOverride')) {
            this.setNearOverride(settings.nearOverride);
        }
        if (settings.hasOwnProperty('customFrustum')) {
            this.setCustomFrustum(settings.customFrustum);
        }
        if (settings.hasOwnProperty('renderOverlays')) {
            this.renderOverlays = !!settings.renderOverlays;
        }
        if (settings.navMode && settings.navMode !== this.navMode) {
            this.setNavMode(settings.navMode);
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
        this.updateLockFramingAspect();
    }

    endOffscreenMode() {
        this.targetSize = null;
        this.suppressFinalBlit = false;
        this.updateLockFramingAspect();
    }
}

export { Camera };
