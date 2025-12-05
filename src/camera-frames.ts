import { cameraFramesVersion } from './camera-frames-version';
import { ElementType } from './element';
import { Events } from './events';
import { PngCompressor } from './png-compressor';
import { exportPsd } from './psd-export';
import { Scene } from './scene';
import { Crc } from './serialize/crc';
import { localize } from './ui/localization';

type RenderBoxState = {
    baseSize: { w: number; h: number; };
    scalePct: { x: number; y: number; };
    scale: { kx: number; ky: number; };
    anchor: { ax: 0 | 0.5 | 1; ay: 0 | 0.5 | 1; };
    center: { cx: number; cy: number; };
    fitScale: number;
    viewZoomPct: number;
    lastViewport: { vw: number; vh: number; };
    projection: {
        type: 'perspective' | 'ortho';
        baseFov?: number;
        orthoHalfHeight?: number;
    };
};

type FrameState = {
    id: string;
    pos: { x: number; y: number; };
    scalePct: number;
    scaleK: number;
    baseSize: { w: number; h: number; };
    order: number;
    selected?: boolean;
    rotationDeg?: number;
    anchor?: { x: number; y: number; };
};

type FrameMaskState = {
    enabled: boolean;
    opacity: number; // 0.0 - 1.0
};

export type CameraFramesState = {
    enabled: boolean;
    renderBox: RenderBoxState;
    frames: FrameState[];
    mask: FrameMaskState;
    nearClip?: number | null;
    exportName?: string;
    exportFormat?: ExportFormat;
    exportGridOverlay?: boolean;
};

type Viewport = { vw: number; vh: number; };

type FovInfo = {
    crop: number;
    hfovDeg: number;
    hfovFrameDeg: number;
    eqMm: number;
    minEqMm: number;
    maxEqMm: number;
};

type ExportFormat = 'png' | 'psd';

type ViewportMapping = {
    fitScale: number;
    viewScale: number;
    logicalW: number;
    logicalH: number;
    rectPx: { x: number; y: number; w: number; h: number; };
    rectNorm: { x: number; y: number; w: number; h: number; };
    rectPxRaw: { x: number; y: number; w: number; h: number; };
    rectNormRaw: { x: number; y: number; w: number; h: number; };
};

type CameraFrustum = {
    l0: number;
    r0: number;
    b0: number;
    t0: number;
    near: number;
    far: number;
};

const DEFAULT_RENDERBOX = (): RenderBoxState => ({
    baseSize: { w: 1754, h: 1240 },
    scalePct: { x: 100, y: 100 },
    scale: { kx: 1, ky: 1 },
    anchor: { ax: 0.5, ay: 0.5 },
    center: { cx: 0, cy: 0 },
    fitScale: 1,
    viewZoomPct: 100,
    lastViewport: { vw: 1, vh: 1 },
    projection: { type: 'perspective', baseFov: 60 }
});

const DEFAULT_FRAME_BASE = { w: 1536, h: 864 };

const DEFAULT_MASK: FrameMaskState = {
    enabled: false,
    opacity: 0.8
};

const DEFAULT_NEAR_CLIP = 0.01;

// constants for FOV <-> 35mm換算
const W_35MM = 36;          // 35mmフィルムの横幅 [mm]
const HFOV_MIN = 10;        // supersplat 制約
const HFOV_MAX = 120;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const MIN_VIEW_ZOOM_PCT = 25;
const MAX_VIEW_ZOOM_PCT = 100;
const PAN_MARGIN_PX = 0;

const cloneFrame = (f: FrameState): FrameState => ({
    ...f,
    rotationDeg: f.rotationDeg ?? 0,
    pos: { ...f.pos },
    baseSize: { ...f.baseSize },
    anchor: f.anchor ? { ...f.anchor } : undefined
});

export class CameraFramesController {
    private events: Events;
    private scene: Scene;
    private overlay: HTMLCanvasElement;
    private overlayCtx: CanvasRenderingContext2D;
    private viewport: Viewport = { vw: 1, vh: 1 };
    private canvasContainer: HTMLElement;
    private state: CameraFramesState = {
        enabled: false,
        renderBox: DEFAULT_RENDERBOX(),
        frames: [],
        mask: { ...DEFAULT_MASK },
        nearClip: null,
        exportName: 'yc4_00_000_CGLO',
        exportFormat: 'psd',
        exportGridOverlay: false
    };
    private selectedId: string = null;
    private compressor: PngCompressor | null = null;
    private resizeObserver: ResizeObserver;
    private lastPointer: { x: number; y: number } | null = null;
    private dragState: {
        frameId: string | null;
        startPos: { x: number; y: number; };
        startPointer: { x: number; y: number; };
        axisLock: 'x' | 'y' | null;
        shiftLock: boolean;
        pointerId: number;
        mode: 'move' | 'resize' | 'anchor' | 'rotate' | 'pan';
        handleId?: string;
        startScaleK?: number;
        startCenterLogical?: { x: number; y: number; };
        startAnchorLogical?: { x: number; y: number; };
        startHandleLogical?: { x: number; y: number; };
        startDistance?: number;
        startRotationRad?: number;
        startAngle?: number;
        startCenterScreen?: { x: number; y: number; };
    } = null;
    private addedCount = 0;
    private fovInfo: FovInfo | null = null;
    private lockFovAxis: 'vertical' | 'horizontal' | undefined = 'horizontal';
    private runtimeFrustum: CameraFrustum | null = null;
    private baseFovRad: number = 60 * DEG2RAD;
    private pendingNearClipGuard = 0;
    private nearClipGuardSeed: number | null = null;
    private history: {
        begin(label: string): void;
        commit(label?: string): void;
        record(label: string, fn: () => void): void;
        debounced(label: string, fn: () => void): void;
        isApplying(): boolean;
    } | null = null;
    private applyingHistory = false;

    constructor(events: Events, scene: Scene, canvasContainer: HTMLElement) {
        this.events = events;
        this.scene = scene;
        this.canvasContainer = canvasContainer;

        // overlay canvas
        this.overlay = document.createElement('canvas');
        this.overlay.id = 'camera-frames-overlay';
        this.overlayCtx = this.overlay.getContext('2d');
        this.overlay.style.position = 'absolute';
        this.overlay.style.inset = '0';
        this.overlay.style.pointerEvents = 'none'; // 初期状態では既存UI操作を阻害しない
        // WebGLキャンバスの直後に挿入してUI要素より下に配置
        const baseCanvas = canvasContainer.querySelector<HTMLCanvasElement>('#canvas');
        if (baseCanvas && baseCanvas.parentElement === canvasContainer) {
            canvasContainer.insertBefore(this.overlay, baseCanvas.nextSibling);
        } else {
            canvasContainer.appendChild(this.overlay);
        }

        this.applyCameraFramesVersionLabel();

        // initial viewport update (forces fit & center)
        this.updateViewportFromContainer();

        // observe canvas container resize (css pixels)
        this.resizeObserver = new ResizeObserver(() => {
            // Resize: always force fit & recenter to avoid losing the box
            this.updateViewportFromContainer();
            if (!this.state.enabled) {
                return;
            }
            this.requestRender();
        });
        this.resizeObserver.observe(canvasContainer);

        // hover判定で必要なときだけポインターイベントを有効化
        canvasContainer.addEventListener('pointermove', e => this.onHover(e));

        // events wiring
        this.registerEvents();

        // draw each frame
        this.events.on('postrender', () => {
            this.runPendingNearClipGuard();
            this.drawOverlay();
        });

        const initialBaseFov = this.scene.camera?.fov ?? this.state.renderBox.projection.baseFov ?? 60;
        this.state.renderBox.projection.baseFov = initialBaseFov;
        this.baseFovRad = initialBaseFov * DEG2RAD;
        this.rebuildBaseFrustum();

        this.updateFovInfo();

        this.scheduleNearClipGuard();

        // 初期化は有効化時に行う
    }

    setHistory(history: {
        begin(label: string): void;
        commit(label?: string): void;
        record(label: string, fn: () => void): void;
        debounced(label: string, fn: () => void): void;
        isApplying(): boolean;
    } | null) {
        this.history = history;
    }

    private historyBegin(label: string) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            return;
        }
        this.history.begin(label);
    }

    private historyCommit(label: string) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            return;
        }
        this.history.commit(label);
    }

    private historyRecord(label: string, fn: () => void) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            fn();
            return;
        }
        this.history.record(label, fn);
    }

    private historyDebounced(label: string, fn: () => void) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            fn();
            return;
        }
        this.history.debounced(label, fn);
    }

    private registerEvents() {
        this.events.on('scene.elementAdded', (element: any) => {
            if (element?.type === ElementType.splat) {
                this.scheduleNearClipGuard();
            }
        });
        this.events.on('scene.boundChanged', () => {
            if (!this.state.enabled) {
                return;
            }
            this.syncCameraFrustum();
            this.requestRender();
        });

        // カメラ操作でクリップが変わった場合も追従
        this.events.on('camera.transform', () => {
            if (!this.state.enabled) {
                return;
            }
            this.syncCameraFrustum();
        });

        // enable / disable
        this.events.function('cameraFrames.enabled', () => this.state.enabled);
        this.events.on('cameraFrames.setEnabled', (value: boolean) => this.setEnabled(value));
        this.events.on('cameraFrames.toggleEnabled', () => this.setEnabled(!this.state.enabled));

        // 提供: 現在のレンダーボックスに基づくアスペクトロック情報
        this.events.function('cameraFrames.aspectLock', () => {
            if (!this.state.enabled) {
                return null;
            }
            // 引数 false (fitScale更新なし) で呼び出す。
            // 内部で targetSize をチェックするため、書き出し時には正しい出力用Rectが計算される。
            const mapping = this.computeViewportMapping(false);
            const aspect = mapping.logicalW / mapping.logicalH;
            return {
                aspect,
                logicalW: mapping.logicalW,
                logicalH: mapping.logicalH,
                rectNorm: mapping.rectNorm,
                rectPx: mapping.rectPx,
                rectNormRaw: mapping.rectNormRaw,
                rectPxRaw: mapping.rectPxRaw
            };
        });

        // 提供: View Zoom / View Scale (CAMERA FRAMES 有効時のみ)
        this.events.function('cameraFrames.viewZoom', () => {
            if (!this.state.enabled) {
                return null;
            }
            const mapping = this.computeViewportMapping(false);
            const rb = this.state.renderBox;
            const zoomPct = this.normalizeViewZoomPct(rb.viewZoomPct);
            return {
                viewScale: mapping.viewScale,
                viewZoomPct: zoomPct
            };
        });

        // 提供: グリッド用フラスタム / ビューポート情報（CAMERA FRAMES 有効時のみ）
        this.events.function('cameraFrames.gridViewportInfo', () => {
            if (!this.state.enabled) {
                return null;
            }
            const mapping = this.computeViewportMapping(false);
            // effective frustum (render box基準)
            const rbFrustum = this.computeEffectiveFrustum();
            // previewか書き出しかでviewportを切り替え
            const targetSize = this.scene.camera.targetSize;
            const vw = targetSize ? targetSize.width : this.viewport.vw;
            const vh = targetSize ? targetSize.height : this.viewport.vh;

            // 最終的に camera.setCustomFrustum に渡しているのは syncCameraFrustum の戻り値
            // ここでは外挿後のフラスタム（画面全体をカバーするもの）を計算し直す
            let finalFrustum = rbFrustum;
            if (rbFrustum && mapping && vw > 0 && vh > 0) {
                const rbW = rbFrustum.right - rbFrustum.left;
                const rbH = rbFrustum.top - rbFrustum.bottom;
                const pxToWorldX = mapping.rectPxRaw.w > 0 ? rbW / mapping.rectPxRaw.w : 0;
                const pxToWorldY = mapping.rectPxRaw.h > 0 ? rbH / mapping.rectPxRaw.h : 0;
                if (pxToWorldX > 0 && pxToWorldY > 0) {
                    const left = rbFrustum.left - mapping.rectPxRaw.x * pxToWorldX;
                    const right = left + vw * pxToWorldX;
                    const top = rbFrustum.top + mapping.rectPxRaw.y * pxToWorldY;
                    const bottom = top - vh * pxToWorldY;
                    finalFrustum = {
                        ...rbFrustum,
                        left,
                        right,
                        bottom,
                        top
                    };
                }
            }

            return {
                rectPxRaw: { x: 0, y: 0, w: vw, h: vh },
                viewport: { vw, vh },
                frustum: finalFrustum
            };
        });

        // 提供: FOV / 35mm換算情報
        this.events.function('cameraFrames.fovInfo', () => this.fovInfo ?? this.calcFovInfo());

        // near clip override (CAMERA FRAMES 有効時にのみ適用)
        this.events.function('cameraFrames.nearClip', () => this.state.nearClip ?? null);
        this.events.on('cameraFrames.setNearClip', (value: number | null) => this.setNearClip(value));

        // render box scale and anchor
        this.events.on('cameraFrames.setScalePct', (values: { x?: number; y?: number }) => {
            const x = values.x ?? this.state.renderBox.scalePct.x;
            const y = values.y ?? this.state.renderBox.scalePct.y;
            this.setRenderBoxScale(x, y);
        });
        this.events.on('cameraFrames.setAnchor', (anchor: { ax: 0 | 0.5 | 1; ay: 0 | 0.5 | 1 }) => {
            const rb = this.state.renderBox;
            const prev = rb.anchor;
            if (prev.ax === anchor.ax && prev.ay === anchor.ay) {
                return;
            }

            this.historyRecord('cameraFrames.anchor', () => {
                rb.anchor = anchor;
                // アンカー変更は「次の拡縮用の基準点」を差し替えるだけとし、
                // 現在のフラスタム／表示を変えない（v4: 構図維持）
                this.requestRender(); // UI/オーバーレイだけ更新
                this.events.fire('cameraFrames.stateChanged', this.snapshot());
            });
        });

        // view zoom
        this.events.on('cameraFrames.setViewZoomPct', (pct: number) => {
            this.setViewZoomPct(pct);
        });

        // frames
        this.events.on('cameraFrames.addFrame', () => this.addFrame());
        this.events.on('cameraFrames.deleteSelected', () => this.deleteSelectedFrame());
        this.events.on('cameraFrames.selectFrame', (id: string) => this.selectFrame(id));
        this.events.on('cameraFrames.setFrameScale', (data: { id: string; scalePct: number }) => {
            this.setFrameScale(data.id, data.scalePct);
        });
        this.events.on('cameraFrames.setEqFovMm', (eqMm: number) => {
            this.setEqFovMm(eqMm);
        });

        // mask
        this.events.on('cameraFrames.setMask', (mask: Partial<FrameMaskState>) => {
            this.historyRecord('cameraFrames.mask', () => {
                this.state.mask = { ...this.state.mask, ...mask };
                this.requestRender();
                this.events.fire('cameraFrames.stateChanged', this.snapshot());
            });
        });

        // export settings
        this.events.on('cameraFrames.setExportName', (name: string) => {
            const value = (name ?? '').toString();
            if (this.state.exportName === value) return;
            this.state.exportName = value;
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });

        this.events.on('cameraFrames.setExportFormat', (format: ExportFormat) => {
            const next = this.normalizeFormat(format);
            if (this.state.exportFormat === next) return;
            this.state.exportFormat = next;
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });

        this.events.on('cameraFrames.setExportGridOverlay', (value: boolean) => {
            const next = !!value;
            if (this.state.exportGridOverlay === next) return;
            this.state.exportGridOverlay = next;
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });

        // overlay解除（UI操作時に安全側で無効化）
        this.events.on('cameraFrames.overlay.release', () => {
            this.overlay.style.pointerEvents = 'none';
        });

        // render output
        this.events.function('cameraFrames.render', async (options?: { format?: ExportFormat; filename?: string }) => {
            if (!this.state.enabled) {
                return;
            }
            await this.renderImage(options);
        });

        // doc serialize / deserialize
        this.events.function('docSerialize.cameraFrames', () => {
            return this.serialize();
        });

        this.events.function('docDeserialize.cameraFrames', (docState: any) => {
            this.deserialize(docState);
        });

        // camera fov -> update fov info
        this.events.on('camera.fov', (value?: number) => {
            const currentFov = (typeof value === 'number' && isFinite(value)) ? value : this.events.invoke('camera.fov');
            if (typeof currentFov === 'number' && isFinite(currentFov)) {
                const projection = this.state.renderBox.projection ?? { type: 'perspective' as const };
                projection.baseFov = currentFov;
                this.state.renderBox.projection = projection;
                this.rebuildBaseFrustum();
                if (this.state.enabled) {
                    this.syncCameraFrustum();
                }
            }
            this.updateFovInfo();
        });

        // camera resize -> just update viewport-based overlay
        this.events.on('camera.resize', () => {
            if (!this.state.enabled) {
                return;
            }
            // Scene camera resize event: update viewport and refit based on the new size
            this.updateViewportFromContainer();
            this.requestRender();
        });

        // モデルロード直後など、強制リフレッシュ要求に応じてビューポートを再計算する
        this.events.on('cameraFrames.forceRefreshViewport', () => {
            this.updateViewportFromContainer();
            this.requestRender();
        });

        // Undo / Redo 適用後に UI を最新状態へ同期
        this.events.on('edit.apply', (op: any) => {
            if (!op?.name || typeof op.name !== 'string') {
                return;
            }
            if (!op.name.startsWith('cameraFrames')) {
                return;
            }
            // 履歴適用直後の状態を通知してパネル数値を更新
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        });
    }

    private normalizeFormat(format?: ExportFormat): ExportFormat {
        return format === 'psd' ? 'psd' : 'png';
    }

    private resolveFilename(name: string | undefined, format: ExportFormat) {
        const fallback = 'camera-frames';
        const trimmed = name?.trim();
        const base = trimmed && trimmed.length > 0 ? trimmed : fallback;
        const hasExtension = /\.[^./\\]+$/.test(base);
        return hasExtension ? base : `${base}.${format}`;
    }

    private updateViewportFromContainer() {
        if (!this.canvasContainer) return;
        const rect = this.canvasContainer.getBoundingClientRect();
        const newVw = rect.width;
        const newVh = rect.height;

        if (newVw !== this.viewport.vw || newVh !== this.viewport.vh) {
            this.viewport = { vw: newVw, vh: newVh };

            const dpr = window.devicePixelRatio || 1;
            this.overlay.width = Math.max(1, Math.floor(newVw * dpr));
            this.overlay.height = Math.max(1, Math.floor(newVh * dpr));
            this.overlay.style.width = `${newVw}px`;
            this.overlay.style.height = `${newVh}px`;
            const ctx = this.overlayCtx;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
        }

        // viewport が変わったらフィットと rect を再計算
        this.computeViewportMapping(true);
        if (this.state.enabled) {
            this.syncCameraFrustum();
        }
    }

    private initDefaultsIfNeeded() {
        const { vw, vh } = this.viewport;
        const renderBox = this.state.renderBox;

        // center が未セット（初期値）ならビューポート中央で初期化
        if (renderBox.center.cx === 0 && renderBox.center.cy === 0) {
            renderBox.center = { cx: vw / 2, cy: vh / 2 };
        }

        renderBox.viewZoomPct = this.normalizeViewZoomPct(renderBox.viewZoomPct);
        if (!isFinite(renderBox.fitScale) || renderBox.fitScale <= 0) {
            const logicalW = renderBox.baseSize.w * renderBox.scale.kx;
            const logicalH = renderBox.baseSize.h * renderBox.scale.ky;
            renderBox.fitScale = Math.min(
                vw > 0 ? vw / logicalW : 1,
                vh > 0 ? vh / logicalH : 1
            );
        }
        // 初期化時は現ビューポート基準でフィットを再計算
        this.computeViewportMapping(true);

        // フレーム未生成ならデフォルト 1 枚を追加
        if (this.state.frames.length === 0) {
            this.addFrame();
        }
    }

    private setEnabled(value: boolean) {
        this.historyRecord('cameraFrames.enabled', () => {
            if (value === this.state.enabled) return;
            this.state.enabled = value;
            // CAMERA FRAMES 有効時はカメラフレーミングと水平画角をロック
            this.events.fire('camera.setLockFraming', value);
            this.events.fire('camera.setLockFovAxis', value ? (this.lockFovAxis ?? 'horizontal') : undefined);
            this.overlay.style.pointerEvents = 'none';
            if (value) {
                // ニアクリップの初期値を現在のカメラから引き継ぎ、固定値として適用
                const baseNear = (this.state.nearClip === null || this.state.nearClip === undefined) ?
                    this.events.invoke('camera.near') :
                    this.state.nearClip;
                this.state.nearClip = this.computeSafeNearClip(baseNear);
                this.applyNearClipOverride();
                this.initDefaultsIfNeeded();
                // 有効化時は現ビューポートに合わせてフィットを再計算
                this.computeViewportMapping(true);
                this.rebuildBaseFrustum();
                this.syncCameraFrustum();
                this.requestRender();
                this.scheduleNearClipGuard();
            } else {
                // 無効化時はニアクリップ固定を解除
                this.events.fire('camera.setNearOverride', null);
                this.events.fire('camera.setCustomFrustum', null);
                // 無効化中は追従ロジックを停止するが状態は保持
                this.requestRender();
            }
            this.events.fire('cameraFrames.enabled', this.state.enabled);
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updateFovInfo();
        });
    }

    private applyNearClipOverride() {
        if (!this.state.enabled) {
            return;
        }
        const near = this.state.nearClip;
        if (typeof near === 'number' && isFinite(near)) {
            this.events.fire('camera.setNearOverride', near);
        } else {
            this.events.fire('camera.setNearOverride', null);
        }
    }

    private setNearClip(value: number | null, suppressHistory = false) {
        const apply = () => {
            const sanitized = (typeof value === 'number' && isFinite(value)) ? Math.max(1e-6, value) : null;
            if (this.state.nearClip === sanitized) return;
            this.state.nearClip = sanitized;
            if (this.state.enabled) {
                this.applyNearClipOverride();
                this.rebuildBaseFrustum();
                this.syncCameraFrustum();
            }
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        };

        if (suppressHistory) {
            apply();
        } else {
            this.historyDebounced('cameraFrames.nearClip', apply);
        }
    }

    private computeSafeNearClip(value: number | null | undefined) {
        const raw = (typeof value === 'number' && isFinite(value)) ? value : NaN;
        const far = this.scene?.camera?.far;
        const boundRadius = this.scene?.bound?.halfExtents.length();

        const maxCandidates: number[] = [];
        if (typeof far === 'number' && isFinite(far) && far > 0) {
            maxCandidates.push(far * 0.1);
        }
        if (typeof boundRadius === 'number' && isFinite(boundRadius) && boundRadius > 0) {
            maxCandidates.push(boundRadius * 0.5);
        }
        const maxNear = maxCandidates.length ? Math.min(...maxCandidates) : null;

        const invalid = !isFinite(raw) ||
            raw <= 0 ||
            (maxNear !== null && raw > maxNear) ||
            (typeof far === 'number' && isFinite(far) && raw >= far);

        if (invalid) {
            return DEFAULT_NEAR_CLIP;
        }
        return Math.max(1e-6, raw);
    }

    private enforceSafeNearClip() {
        if (!this.state.enabled) {
            return;
        }
        if (this.nearClipGuardSeed !== this.state.nearClip) {
            return;
        }
        const currentNear = this.state.nearClip ?? this.events.invoke('camera.near');
        const safeNear = this.computeSafeNearClip(currentNear);
        if (this.state.nearClip !== safeNear) {
            this.setNearClip(safeNear, true);
        }
    }

    private scheduleNearClipGuard(frames = 2) {
        this.nearClipGuardSeed = this.state.nearClip ?? null;
        this.pendingNearClipGuard = Math.max(this.pendingNearClipGuard, frames);
    }

    private runPendingNearClipGuard() {
        if (!this.state.enabled || this.pendingNearClipGuard <= 0) {
            return;
        }
        this.pendingNearClipGuard--;
        if (this.pendingNearClipGuard === 0) {
            this.enforceSafeNearClip();
        }
    }

    private setRenderBoxScale(xPct: number, yPct: number) {
        this.historyDebounced('cameraFrames.renderBoxScale', () => {
            const rb = this.state.renderBox;
            const baseW = rb.baseSize.w;
            const baseH = rb.baseSize.h;

            const oldKx = rb.scale.kx;
            const oldKy = rb.scale.ky;

            // 元の論理サイズと center（仮想スクリーン座標）
            const logicalW0 = baseW * oldKx;
            const logicalH0 = baseH * oldKy;
            const cx0 = rb.center.cx;
            const cy0 = rb.center.cy;

            // スケール変更前のフレーム中心（仮想スクリーン上の論理座標）を保存
            const frameCentersLogical = new Map<string, { x: number; y: number }>();
            for (const f of this.state.frames) {
                const gx = cx0 + (f.pos.x - 0.5) * logicalW0;
                const gy = cy0 + (f.pos.y - 0.5) * logicalH0;
                frameCentersLogical.set(f.id, { x: gx, y: gy });
            }

            // --- スケール値のクランプ（100%以上 ＆ 各軸16000px以下） ---
            const MIN_PCT = 100;
            const MAX_DIM = 16000;

            const maxPctX = baseW > 0 ? Math.floor((MAX_DIM / baseW) * 100) : MIN_PCT;
            const maxPctY = baseH > 0 ? Math.floor((MAX_DIM / baseH) * 100) : MIN_PCT;

            const newPctX = Math.min(maxPctX, Math.max(MIN_PCT, xPct));
            const newPctY = Math.min(maxPctY, Math.max(MIN_PCT, yPct));

            const newKx = newPctX / 100;
            const newKy = newPctY / 100;

            if (Math.abs(newKx - oldKx) < 1e-6 && Math.abs(newKy - oldKy) < 1e-6) {
                return;
            }

            // --- 新しいレンダーボックス矩形をアンカー基準で計算 ---
            const logicalW1 = baseW * newKx;
            const logicalH1 = baseH * newKy;

            const { ax, ay } = rb.anchor;

            const left0 = cx0 - logicalW0 * 0.5;
            const top0 = cy0 - logicalH0 * 0.5;
            const anchorX = left0 + ax * logicalW0;
            const anchorY = top0 + ay * logicalH0;

            const left1 = anchorX - ax * logicalW1;
            const top1 = anchorY - ay * logicalH1;
            const cx1 = left1 + logicalW1 * 0.5;
            const cy1 = top1 + logicalH1 * 0.5;

            rb.scalePct = { x: newPctX, y: newPctY };
            rb.scale = { kx: newKx, ky: newKy };
            rb.center = { cx: cx1, cy: cy1 };

            // 変更中: アンカー基準で変形しつつ、fitScale は維持する
            // これにより、ドラッグ中はアンカー位置が固定され、そこを中心に拡大縮小する自然な挙動になる
            this.computeViewportMapping(true);
            this.syncCameraFrustum();

            // --- フレームの pos を更新して、論理中心を元と同じに保つ ---
            for (const f of this.state.frames) {
                const c = frameCentersLogical.get(f.id);
                if (!c) continue;
                // 更新された rb.center (cx1, cy1) を使用する
                f.pos = {
                    x: 0.5 + (c.x - cx1) / logicalW1,
                    y: 0.5 + (c.y - cy1) / logicalH1
                };
            }

            if (this.state.enabled) {
                // 現在のレンダーボックス比率でカメラのアスペクトを再適用
                this.events.fire('camera.setLockFraming', true);
            }

            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updateFovInfo();
        });
    }

    private setViewZoomPct(viewZoomPct: number) {
        this.historyDebounced('cameraFrames.viewZoom', () => {
            const rb = this.state.renderBox;
            const clamped = this.normalizeViewZoomPct(viewZoomPct);
            if (rb.viewZoomPct === clamped) {
                return;
            }
            rb.viewZoomPct = clamped;
            this.computeViewportMapping(false);
            this.syncCameraFrustum();
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });
    }

    private setEqFovMm(eqMm: number) {
        this.historyDebounced('cameraFrames.fov', () => {
            const info = this.calcFovInfo();
            const crop = info.crop;
            const minMm = info.minEqMm;
            const maxMm = info.maxEqMm;
            const clampedMm = Math.min(maxMm, Math.max(minMm, eqMm));
            const targetHfovDeg = this.clampFov(this.eqMmToHfov(clampedMm, crop));
            const targetHfovRad = targetHfovDeg * DEG2RAD;
            const axisFovDeg = this.horizontalRadToAxisDeg(targetHfovRad);
            const projection = this.state.renderBox.projection ?? { type: 'perspective' as const };
            projection.baseFov = axisFovDeg;
            this.state.renderBox.projection = projection;
            this.rebuildBaseFrustum();
            this.syncCameraFrustum();
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updateFovInfo();
        });
    }

    private addFrame() {
        this.historyRecord('cameraFrames.addFrame', () => {
            const frames = this.state.frames;
            if (frames.length >= 20) {
                console.warn('cameraFrames: maximum 20 frames reached');
                return;
            }
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const id = letters[this.addedCount % letters.length] ?? `Frame ${this.addedCount + 1}`;
            this.addedCount++;
            const order = frames.reduce((m, f) => Math.max(m, f.order), -1) + 1;
            const pos = { x: 0.5, y: 0.5 };
            const frame: FrameState = {
                id,
                pos,
                scalePct: 100,
                scaleK: 1,
                baseSize: { ...DEFAULT_FRAME_BASE },
                order,
                rotationDeg: 0,
                anchor: { ...pos }
            };
            frames.push(frame);
            this.selectFrame(id);
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
        });
    }

    private deleteSelectedFrame() {
        this.historyRecord('cameraFrames.deleteFrame', () => {
            if (!this.selectedId) return;
            this.state.frames = this.state.frames.filter(f => f.id !== this.selectedId);
            this.selectedId = this.state.frames.length ? this.state.frames[this.state.frames.length - 1].id : null;
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        });
    }

    private selectFrame(id: string) {
        this.historyRecord('cameraFrames.selectFrame', () => {
            this.selectedId = id;
            this.state.frames.forEach((f) => {
                f.selected = f.id === id;
            });
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        });
    }

    private setFrameScale(id: string, scalePct: number) {
        this.historyRecord('cameraFrames.frameScale', () => {
            const frame = this.state.frames.find(f => f.id === id);
            if (!frame) return;
            const MIN_PCT = 10;
            const MAX_PCT = 400;
            const clamped = Math.min(MAX_PCT, Math.max(MIN_PCT, scalePct));
            frame.scalePct = clamped;
            frame.scaleK = frame.scalePct / 100;
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        });
    }

    private requestRender() {
        this.scene.forceRender = true;
    }

    private logicalToScreen(x: number, y: number) {
        const rb = this.state.renderBox;
        const mapping = this.computeViewportMapping();
        const effectiveScale = mapping.viewScale;
        const leftLogical = rb.center.cx - mapping.logicalW * 0.5;
        const topLogical = rb.center.cy - mapping.logicalH * 0.5;
        const sx = mapping.rectPxRaw.x + (x - leftLogical) * effectiveScale;
        const sy = mapping.rectPxRaw.y + (y - topLogical) * effectiveScale;
        return { x: sx, y: sy };
    }

    private screenToLogical(px: number, py: number) {
        const rb = this.state.renderBox;
        const mapping = this.computeViewportMapping();
        const effectiveScale = mapping.viewScale;
        const leftLogical = rb.center.cx - mapping.logicalW * 0.5;
        const topLogical = rb.center.cy - mapping.logicalH * 0.5;
        const lx = leftLogical + (px - mapping.rectPxRaw.x) / effectiveScale;
        const ly = topLogical + (py - mapping.rectPxRaw.y) / effectiveScale;
        return { x: lx, y: ly };
    }

    private clampFov(hfov: number) {
        return Math.min(HFOV_MAX, Math.max(HFOV_MIN, hfov));
    }

    private normalizeViewZoomPct(value?: number) {
        const raw = (typeof value === 'number' && isFinite(value)) ? value : MAX_VIEW_ZOOM_PCT;
        return Math.min(MAX_VIEW_ZOOM_PCT, Math.max(MIN_VIEW_ZOOM_PCT, raw));
    }

    private computeViewportMapping(updateFitScale: boolean = false): ViewportMapping {
        const rb = this.state.renderBox;

        // 書き出しモード判定: Sceneカメラに targetSize が設定されていれば書き出し中
        const targetSize = this.scene.camera.targetSize;
        const isExporting = !!targetSize;

        // ビューポートサイズ: 書き出し時はターゲットサイズ、プレビュー時はキャンバスサイズ
        const vw = isExporting ? targetSize.width : this.viewport.vw;
        const vh = isExporting ? targetSize.height : this.viewport.vh;

        const logicalW = Math.max(1e-6, rb.baseSize.w * rb.scale.kx);
        const logicalH = Math.max(1e-6, rb.baseSize.h * rb.scale.ky);

        const autoFit = Math.min(
            vw > 0 ? vw / logicalW : 1,
            vh > 0 ? vh / logicalH : 1
        ) || 1;

        const prevViewport = rb.lastViewport ?? { vw, vh };
        const viewportChanged = prevViewport.vw !== vw || prevViewport.vh !== vh;

        // パラメータ決定
        // 書き出し時: Zoom=100%, FitScale=1.0 (等倍出力), Center=画面中央
        // プレビュー時: UI設定値を使用
        const viewZoomPct = isExporting ? 100 : this.normalizeViewZoomPct(rb.viewZoomPct);
        const zoomScale = viewZoomPct / 100;

        let fitScale = rb.fitScale;
        const prevFitScaleRaw = rb.fitScale;
        const prevFitScaleSafe = (isFinite(prevFitScaleRaw) && prevFitScaleRaw > 0) ? prevFitScaleRaw : autoFit;

        // プレビュー時のみ FitScale を更新する。リサイズや復元時に autoFit を採用し、
        // viewZoom 変更などでは fitScale を触らない。
        const shouldUpdateFitScale = !isExporting && (updateFitScale || !isFinite(prevFitScaleRaw) || prevFitScaleRaw <= 0);
        if (shouldUpdateFitScale) {
            fitScale = autoFit;
            rb.fitScale = fitScale;
        }

        const prevViewScale = Math.max(1e-6, prevFitScaleSafe * zoomScale);
        // ViewScale
        // 書き出し時は 1.0 (1:1)
        const viewScale = isExporting ? 1.0 : Math.max(1e-6, fitScale * zoomScale);

        // Center
        // 書き出し時は中央、プレビュー時は設定値
        let cx = isExporting ? vw / 2 : rb.center.cx;
        let cy = isExporting ? vh / 2 : rb.center.cy;

        // リサイズ時はアンカーのスクリーン座標を維持するために center を補正する
        const shouldPreserveAnchor = !isExporting && updateFitScale && viewportChanged;
        if (shouldPreserveAnchor) {
            const anchor = rb.anchor ?? { ax: 0.5, ay: 0.5 };
            if (isFinite(anchor.ax) && isFinite(anchor.ay)) {
                const anchorOffsetX = (anchor.ax - 0.5) * logicalW * prevViewScale;
                const anchorOffsetY = (anchor.ay - 0.5) * logicalH * prevViewScale;
                const anchorPx = rb.center.cx + anchorOffsetX;
                const anchorPy = rb.center.cy + anchorOffsetY;

                const newAnchorOffsetX = (anchor.ax - 0.5) * logicalW * viewScale;
                const newAnchorOffsetY = (anchor.ay - 0.5) * logicalH * viewScale;

                cx = anchorPx - newAnchorOffsetX;
                cy = anchorPy - newAnchorOffsetY;
                rb.center = { cx, cy };
            }
        }
        if (!isExporting && updateFitScale) {
            rb.lastViewport = { vw, vh };
        }

        const displayW = logicalW * viewScale;
        const displayH = logicalH * viewScale;

        const rectXRaw = cx - displayW * 0.5;
        const rectYRaw = cy - displayH * 0.5;

        const rectPxRaw = { x: rectXRaw, y: rectYRaw, w: displayW, h: displayH };

        // クリップ計算 (UI表示用)
        const clippedX = Math.max(0, Math.min(vw, rectXRaw));
        const clippedY = Math.max(0, Math.min(vh, rectYRaw));
        const clippedW = Math.max(0, Math.min(vw, rectXRaw + displayW) - clippedX);
        const clippedH = Math.max(0, Math.min(vh, rectYRaw + displayH) - clippedY);

        const rectPx = { x: clippedX, y: clippedY, w: clippedW, h: clippedH };
        const rectNorm = {
            x: vw > 0 ? rectPx.x / vw : 0,
            y: vh > 0 ? rectPx.y / vh : 0,
            w: vw > 0 ? rectPx.w / vw : 1,
            h: vh > 0 ? rectPx.h / vh : 1
        };
        const rectNormRaw = {
            x: vw > 0 ? rectXRaw / vw : 0,
            y: vh > 0 ? rectYRaw / vh : 0,
            w: vw > 0 ? displayW / vw : 1,
            h: vh > 0 ? displayH / vh : 1
        };

        return {
            fitScale,
            viewScale,
            logicalW,
            logicalH,
            rectPx,
            rectNorm,
            rectPxRaw,
            rectNormRaw
        };
    }

    private cropFactor(renderBox: RenderBoxState) {
        // 基準: デフォルトフレーム (1536px) に対するレンダーボックス基準幅
        const rbW = renderBox.baseSize.w || 1;
        const frameW = DEFAULT_FRAME_BASE.w;
        const crop = rbW / frameW;
        return isFinite(crop) && crop > 0 ? crop : 1;
    }

    private baseAspect() {
        return DEFAULT_FRAME_BASE.w / DEFAULT_FRAME_BASE.h;
    }

    private baseFovToHorizontalRad(baseFovRad: number, axis: 'horizontal' | 'vertical', aspect: number) {
        if (axis === 'vertical') {
            return 2 * Math.atan(Math.tan(baseFovRad * 0.5) * aspect);
        }
        return baseFovRad;
    }

    private horizontalRadToAxisDeg(horizontalRad: number) {
        const aspect = this.baseAspect();
        if ((this.lockFovAxis ?? 'horizontal') === 'vertical') {
            const vertical = 2 * Math.atan(Math.tan(horizontalRad * 0.5) / aspect);
            return vertical * RAD2DEG;
        }
        return horizontalRad * RAD2DEG;
    }

    private rebuildBaseFrustum() {
        const rb = this.state.renderBox;
        const projection = rb.projection ?? { type: 'perspective' as const };
        const axis = this.lockFovAxis ?? 'horizontal';

        // 修正: 構図基準(Base Frustum)のアスペクト比は RenderBox の Base Size に合わせる
        // これにより、RenderBoxがA4ならA4のフラスタム、16:9なら16:9のフラスタムが生成され、
        // ピクセルマッピング時の縦横比歪みを防止する。
        const rbW = rb.baseSize.w;
        const rbH = rb.baseSize.h;
        const aspect = (rbW > 0 && rbH > 0) ? rbW / rbH : this.baseAspect();

        const baseFovDeg = projection.baseFov ?? this.scene.camera.fov ?? HFOV_MIN;
        const baseFovRadAxis = baseFovDeg * DEG2RAD;
        const horizontalRad = this.baseFovToHorizontalRad(baseFovRadAxis, axis, aspect);
        const clampedHorizontalDeg = this.clampFov(horizontalRad * RAD2DEG);
        const clampedHorizontalRad = clampedHorizontalDeg * DEG2RAD;
        this.baseFovRad = clampedHorizontalRad;
        const axisBaseFovDeg = this.horizontalRadToAxisDeg(clampedHorizontalRad);

        const nearRaw = this.state.nearClip ?? this.events.invoke('camera.near') ?? this.scene.camera.near;
        const farRaw = this.scene.camera.far;
        const near = (typeof nearRaw === 'number' && isFinite(nearRaw)) ? Math.max(1e-6, nearRaw) : 0.1;
        const far = (typeof farRaw === 'number' && isFinite(farRaw)) ? farRaw : 1000;

        if (projection.type === 'ortho') {
            const halfHeight = projection.orthoHalfHeight ?? 1;
            this.runtimeFrustum = {
                l0: -halfHeight * aspect,
                r0: halfHeight * aspect,
                b0: -halfHeight,
                t0: halfHeight,
                near,
                far
            };
        } else {
            const halfW = near * Math.tan(clampedHorizontalRad * 0.5);
            const halfH = halfW / aspect;
            this.runtimeFrustum = {
                l0: -halfW,
                r0: halfW,
                b0: -halfH,
                t0: halfH,
                near,
                far
            };
        }

        rb.projection = {
            ...projection,
            baseFov: axisBaseFovDeg
        };
        this.events.fire('camera.setFov', rb.projection.baseFov);
    }

    private computeEffectiveFrustum() {
        if (!this.runtimeFrustum) {
            this.rebuildBaseFrustum();
        }
        const frustum = this.runtimeFrustum;
        if (!frustum) {
            return null;
        }
        const rb = this.state.renderBox;
        const { kx, ky } = rb.scale;
        const { ax, ay } = rb.anchor;

        // BaseFrustum (構図基準) を レンダーボックスのスケールとアンカーで変形 (Off-axis)
        // ここでは View Zoom (UI倍率) は適用せず、純粋な「レンダーボックス領域」のフラスタムを計算する。

        const width1 = (frustum.r0 - frustum.l0) * kx;
        const height1 = (frustum.t0 - frustum.b0) * ky;
        const left1 = frustum.l0 + ax * ((frustum.r0 - frustum.l0) - width1);
        const right1 = left1 + width1;
        // Y軸 (Bottom -> Top): PlayCanvasはY-up。ay=0はUI上でTop(上)を指すため、
        // フラスタム(Y-up)計算においては (1.0 - ay) として反転させる必要がある。
        // ay=0(上) -> 係数1.0 -> bottom = t0 - h -> top = t0 (上辺固定: 正解)
        // ay=1(下) -> 係数0.0 -> bottom = b0 -> 下辺固定 (正解)
        const bottom1 = frustum.b0 + (1.0 - ay) * ((frustum.t0 - frustum.b0) - height1);
        const top1 = bottom1 + height1;

        const camFarRaw = this.scene.camera.far;
        const far = (typeof camFarRaw === 'number' && isFinite(camFarRaw) && camFarRaw > frustum.near) ? camFarRaw : Math.max(frustum.near * 2, frustum.far);

        // これは「レンダーボックスの四隅」に対応するフラスタム
        return {
            left: left1,
            right: right1,
            bottom: bottom1,
            top: top1,
            near: frustum.near,
            far
        };
    }

    private syncCameraFrustum() {
        if (!this.state.enabled) {
            return null;
        }

        // 1. 基本となるレンダーボックスのフラスタム (Zoomなし)
        const rbFrustum = this.computeEffectiveFrustum();
        if (!rbFrustum) {
            this.events.fire('camera.setCustomFrustum', null);
            return null;
        }

        // 2. 書き出しモード判定
        const targetSize = this.scene.camera.targetSize;
        const isExporting = !!targetSize;

        let finalFrustum = rbFrustum;

        if (isExporting) {
            // 書き出し時: レンダーボックスのフラスタムをそのまま使う
            // (出力画像サイズ == レンダーボックスサイズ なので一致する)
            finalFrustum = rbFrustum;
        } else {
            // プレビュー時: ビューポート全体をカバーするようにフラスタムを拡張 (Extrapolate)

            // 現在の画面上のレンダーボックス位置 (rectPxRaw) を取得
            // computeViewportMapping はプレビュー設定で計算される
            const mapping = this.computeViewportMapping(false);
            const { rectPxRaw } = mapping;
            const { vw, vh } = this.viewport;

            // レンダーボックスのフラスタム幅・高さ (Near平面上)
            const rbW = rbFrustum.right - rbFrustum.left;
            const rbH = rbFrustum.top - rbFrustum.bottom;

            // 1ピクセルあたりのワールド幅 (Near平面上)
            // rectPxRaw.w が極端に小さい(0)場合の保護を入れる
            const pxToWorldX = rectPxRaw.w > 0 ? rbW / rectPxRaw.w : 0;
            const pxToWorldY = rectPxRaw.h > 0 ? rbH / rectPxRaw.h : 0;

            if (pxToWorldX === 0 || pxToWorldY === 0) {
                this.events.fire('camera.setCustomFrustum', null);
                return null;
            }

            // フラスタム拡張 (Extrapolation)
            // 画面左端 (x=0) に対応する left
            // left_screen = rb_left - (レンダーボックス左端までの距離) * スケール
            const leftScreen = rbFrustum.left - (rectPxRaw.x) * pxToWorldX;
            const rightScreen = leftScreen + vw * pxToWorldX;

            // 画面上端 (y=0) に対応する top
            // 注意: DOMのY=0は上、PlayCanvasのProjectionのTopは上 (+Y)
            // rectPxRaw.y は「上からのピクセル距離」
            const topScreen = rbFrustum.top + (rectPxRaw.y) * pxToWorldY;
            const bottomScreen = topScreen - vh * pxToWorldY;

            finalFrustum = {
                ...rbFrustum,
                left: leftScreen,
                right: rightScreen,
                bottom: bottomScreen,
                top: topScreen
            };
        }

        this.events.fire('camera.setCustomFrustum', finalFrustum);
        return finalFrustum;
    }

    private eqMmForFov(hfovDeg: number, crop: number) {
        const hfovRad = hfovDeg * DEG2RAD;
        const focalVirtual = W_35MM / (2 * Math.tan(hfovRad * 0.5));
        return focalVirtual * crop;
    }

    private eqMmToHfov(eqMm: number, crop: number) {
        const safeEq = Math.max(eqMm, 1e-6);
        const hfovRad = 2 * Math.atan((W_35MM * crop) / (2 * safeEq));
        return hfovRad * RAD2DEG;
    }

    private calcFovInfo(): FovInfo {
        const rb = this.state.renderBox;
        const crop = this.cropFactor(rb);
        const axis = this.lockFovAxis ?? 'horizontal';
        const baseAspect = this.baseAspect();
        const baseFovDeg = rb.projection?.baseFov ?? this.scene.camera.fov;
        const baseFovRadAxis = (baseFovDeg ?? HFOV_MIN) * DEG2RAD;
        const hfovRad = this.baseFovToHorizontalRad(baseFovRadAxis, axis, baseAspect);
        const hfovClamped = this.clampFov(hfovRad * RAD2DEG);
        const hfovClampedRad = hfovClamped * DEG2RAD;
        this.baseFovRad = hfovClampedRad;

        const focalVirtual = W_35MM / (2 * Math.tan(hfovClampedRad * 0.5));
        const eqMm = focalVirtual * crop;

        const hfovFrame = 2 * Math.atan(Math.tan(hfovClampedRad * 0.5) / crop) * RAD2DEG;

        const minEqMm = this.eqMmForFov(HFOV_MAX, crop);
        const maxEqMm = this.eqMmForFov(HFOV_MIN, crop);

        return {
            crop,
            hfovDeg: hfovClamped,
            hfovFrameDeg: hfovFrame,
            eqMm,
            minEqMm,
            maxEqMm
        };
    }

    private updateFovInfo() {
        const next = this.calcFovInfo();
        const prev = this.fovInfo;
        this.fovInfo = next;
        const changed =
            !prev ||
            Math.abs(prev.eqMm - next.eqMm) > 1e-4 ||
            Math.abs(prev.hfovDeg - next.hfovDeg) > 1e-4 ||
            Math.abs(prev.crop - next.crop) > 1e-4;
        if (changed) {
            this.events.fire('cameraFrames.fovInfoChanged', next);
        }
    }

    private frameRotationRad(frame: FrameState) {
        const deg = frame.rotationDeg ?? 0;
        return deg * DEG2RAD;
    }

    private rotateOffset(offset: { x: number; y: number; }, rad: number) {
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        return {
            x: offset.x * c - offset.y * s,
            y: offset.x * s + offset.y * c
        };
    }

    private normalizeDegrees(deg: number) {
        const wrapped = ((deg % 360) + 360) % 360;
        return Math.abs(wrapped - 360) < 1e-6 ? 0 : wrapped;
    }

    private frameCenterLogical(frame: FrameState, logicalW: number, logicalH: number) {
        const { renderBox } = this.state;
        return {
            x: renderBox.center.cx + (frame.pos.x - 0.5) * logicalW,
            y: renderBox.center.cy + (frame.pos.y - 0.5) * logicalH
        };
    }

    private frameRectsScreen() {
        const rb = this.state.renderBox;
        const mapping = this.computeViewportMapping();
        const logicalW = mapping.logicalW;
        const logicalH = mapping.logicalH;
        const effectiveScale = mapping.viewScale;
        const leftLogical = rb.center.cx - mapping.logicalW * 0.5;
        const topLogical = rb.center.cy - mapping.logicalH * 0.5;
        const logicalToScreen = (x: number, y: number) => ({
            x: mapping.rectPxRaw.x + (x - leftLogical) * effectiveScale,
            y: mapping.rectPxRaw.y + (y - topLogical) * effectiveScale
        });
        const framesSorted = this.state.frames.slice().sort((a, b) => a.order - b.order);
        return framesSorted.map((frame) => {
            const frameW = frame.baseSize.w * frame.scaleK;
            const frameH = frame.baseSize.h * frame.scaleK;
            const centerLogical = this.frameCenterLogical(frame, logicalW, logicalH);
            const centerScreen = logicalToScreen(centerLogical.x, centerLogical.y);
            const rotationRad = this.frameRotationRad(frame);
            const hw = frameW * 0.5;
            const hh = frameH * 0.5;
            const cornersLogical = [
                { x: -hw, y: -hh },
                { x: hw, y: -hh },
                { x: hw, y: hh },
                { x: -hw, y: hh }
            ].map((off) => {
                const rotated = this.rotateOffset(off, rotationRad);
                return { x: centerLogical.x + rotated.x, y: centerLogical.y + rotated.y };
            });
            const cornersScreen = cornersLogical.map(p => logicalToScreen(p.x, p.y));
            let minX = Number.POSITIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;
            cornersScreen.forEach((p) => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
            const bounding = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
            return {
                frame,
                logicalW,
                logicalH,
                frameW,
                frameH,
                centerLogical,
                centerScreen,
                rotationRad,
                cornersLogical,
                cornersScreen,
                effectiveScale,
                bounding
            };
        });
    }

    private handleRects(frameRect: ReturnType<CameraFramesController['frameRectsScreen']>[number]) {
        const size = 10;
        const { centerLogical, frameW, frameH, rotationRad, effectiveScale } = frameRect;
        const anchorLogical = this.frameAnchorLogical(frameRect.frame, frameRect.logicalW, frameRect.logicalH);
        const anchorScreen = this.logicalToScreen(anchorLogical.x, anchorLogical.y);
        const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((id) => {
            const pos = this.getHandleLogicalPosition(id, centerLogical, frameW, frameH, rotationRad);
            const screen = this.logicalToScreen(pos.x, pos.y);
            return { id, x: screen.x, y: screen.y };
        });
        handles.push({ id: 'anchor', x: anchorScreen.x, y: anchorScreen.y });
        const gapPx = 30;
        const logicalGap = gapPx / Math.max(1e-6, effectiveScale);
        const rotateOffset = this.rotateOffset({ x: 0, y: -(frameH * 0.5 + logicalGap) }, rotationRad);
        const rotateLogical = { x: centerLogical.x + rotateOffset.x, y: centerLogical.y + rotateOffset.y };
        const rotateScreen = this.logicalToScreen(rotateLogical.x, rotateLogical.y);
        handles.push({ id: 'rotate', x: rotateScreen.x, y: rotateScreen.y });
        return handles.map(h => ({
            ...h,
            rect: { x: h.x - size * 0.5, y: h.y - size * 0.5, w: size, h: size }
        }));
    }

    private frameAnchorLogical(frame: FrameState, logicalW: number, logicalH: number) {
        const anchor = frame.anchor ?? { x: frame.pos?.x ?? 0.5, y: frame.pos?.y ?? 0.5 };
        return {
            x: this.state.renderBox.center.cx + (anchor.x - 0.5) * logicalW,
            y: this.state.renderBox.center.cy + (anchor.y - 0.5) * logicalH
        };
    }

    private getHandleLogicalOffset(handleId: string, frameW: number, frameH: number) {
        const hw = frameW * 0.5;
        const hh = frameH * 0.5;
        switch (handleId) {
            case 'nw': return { x: -hw, y: -hh };
            case 'n': return { x: 0, y: -hh };
            case 'ne': return { x: hw, y: -hh };
            case 'e': return { x: hw, y: 0 };
            case 'se': return { x: hw, y: hh };
            case 's': return { x: 0, y: hh };
            case 'sw': return { x: -hw, y: hh };
            case 'w': return { x: -hw, y: 0 };
            default: return { x: 0, y: 0 };
        }
    }

    private getHandleLogicalPosition(handleId: string, center: { x: number; y: number; }, frameW: number, frameH: number, rotationRad: number) {
        const off = this.getHandleLogicalOffset(handleId, frameW, frameH);
        const rotated = this.rotateOffset(off, rotationRad);
        return { x: center.x + rotated.x, y: center.y + rotated.y };
    }

    private getAnchorLogicalForHandle(handleId: string | undefined, frame: FrameState, center: { x: number; y: number; }, frameW: number, frameH: number, logicalW: number, logicalH: number, rotationRad: number) {
        if (!handleId) {
            return center;
        }
        if (handleId === 'anchor' || handleId === 'rotate') {
            return this.frameAnchorLogical(frame, logicalW, logicalH);
        }
        const off = this.getHandleLogicalOffset(handleId, frameW, frameH);
        const rotated = this.rotateOffset(off, rotationRad);
        return { x: center.x - rotated.x, y: center.y - rotated.y };
    }

    private drawMask(rects: ReturnType<CameraFramesController['frameRectsScreen']>) {
        const { mask } = this.state;
        if (!mask?.enabled || rects.length === 0) {
            return;
        }
        const ctx = this.overlayCtx;
        const { vw, vh } = this.viewport;

        // compute bounding box
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        rects.forEach((r) => {
            const b = r.bounding;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        });

        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${mask.opacity ?? 0.8})`;
        ctx.beginPath();
        ctx.rect(0, 0, vw, vh);
        ctx.rect(minX, minY, maxX - minX, maxY - minY);
        ctx.fill('evenodd');
        ctx.restore();
    }

    private drawOverlay() {
        const ctx = this.overlayCtx;
        const { vw, vh } = this.viewport;
        ctx.clearRect(0, 0, vw, vh);

        if (!this.state.enabled) {
            return;
        }

        const rb = this.state.renderBox;
        const mapping = this.computeViewportMapping();
        const logicalW = mapping.logicalW;
        const logicalH = mapping.logicalH;
        const leftTop = this.logicalToScreen(rb.center.cx - logicalW * 0.5, rb.center.cy - logicalH * 0.5);
        const rightBottom = this.logicalToScreen(rb.center.cx + logicalW * 0.5, rb.center.cy + logicalH * 0.5);

        // render box
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(leftTop.x, leftTop.y, rightBottom.x - leftTop.x, rightBottom.y - leftTop.y);
        ctx.restore();

        const rects = this.frameRectsScreen();

        // mask
        this.drawMask(rects);

        // frames
        rects.forEach(({ frame, cornersScreen }) => {
            if (!cornersScreen?.length) {
                return;
            }
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cornersScreen[0].x, cornersScreen[0].y);
            cornersScreen.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ff0000';
            ctx.stroke();
            if (frame.selected) {
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.setLineDash([3, 2]);
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.restore();
        });

        // handles (選択時のみ)
        const selectedRect = rects.find(r => r.frame.selected);
        if (selectedRect) {
            const handles = this.handleRects(selectedRect);
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#ff0000';
            handles.forEach((h) => {
                ctx.fillRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);
                ctx.strokeRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);
            });
            ctx.restore();
        }
    }

    // pointer interactions --------------------------------------------------

    private onHover(e: PointerEvent) {
        this.lastPointer = { x: e.clientX, y: e.clientY };

        if (!this.state.enabled) {
            this.overlay.style.pointerEvents = 'none';
            this.overlay.style.cursor = '';
            return;
        }
        if (this.dragState) {
            this.overlay.style.pointerEvents = 'auto';
            this.overlay.style.cursor = this.dragState.mode === 'pan' ? 'grabbing' : '';
            return;
        }
        if (e.shiftKey) {
            this.overlay.style.pointerEvents = 'auto';
            this.overlay.style.cursor = 'grab';
            return;
        }

        const rect = this.canvasContainer.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        const handleHit = this.hitTestHandle(px, py);
        const borderHit = !handleHit && this.hitTestFrameBorder(px, py);

        this.overlay.style.pointerEvents = (handleHit || borderHit) ? 'auto' : 'none';
        this.overlay.style.cursor = this.getCursorForHit(handleHit?.handleId, borderHit);
    }

    private updatePointerFromLast() {
        if (!this.lastPointer) {
            this.overlay.style.pointerEvents = 'none';
            return;
        }
        const rect = this.canvasContainer.getBoundingClientRect();
        const px = this.lastPointer.x - rect.left;
        const py = this.lastPointer.y - rect.top;
        const handleHit = this.hitTestHandle(px, py);
        const borderHit = !handleHit && this.hitTestFrameBorder(px, py);
        this.overlay.style.pointerEvents = (handleHit || borderHit) && this.state.enabled ? 'auto' : 'none';
        this.overlay.style.cursor = this.getCursorForHit(handleHit?.handleId, borderHit);
    }

    private isPointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number; }) {
        return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    }

    private hitTestHandle(px: number, py: number) {
        const rects = this.frameRectsScreen().sort((a, b) => a.frame.order - b.frame.order);
        for (let i = rects.length - 1; i >= 0; i--) {
            const r = rects[i];
            // ハンドルは選択中のフレームのみ有効
            if (r.frame.id !== this.selectedId) {
                continue;
            }
            const handles = this.handleRects(r);
            const hit = handles.find(h => this.isPointInRect(px, py, h.rect));
            if (hit) {
                return { frame: r.frame, handleId: hit.id, frameRect: r, handle: hit };
            }
        }
        return null;
    }

    private getCursorForHit(handleId: string | undefined, borderHit: any) {
        if (handleId) {
            switch (handleId) {
                case 'nw':
                case 'se':
                    return 'nwse-resize';
                case 'ne':
                case 'sw':
                    return 'nesw-resize';
                case 'n':
                case 's':
                    return 'ns-resize';
                case 'e':
                case 'w':
                    return 'ew-resize';
                case 'anchor':
                    return 'move';
                case 'rotate':
                    return 'grab';
                default:
                    return 'default';
            }
        }
        if (borderHit) {
            return 'move';
        }
        return '';
    }

    private applyCameraFramesVersionLabel() {
        const appLabel = document.getElementById('app-label');
        if (!appLabel) {
            return;
        }
        const EXISTING_CLASS = 'camera-frames-version';
        const existing = appLabel.querySelector(`.${EXISTING_CLASS}`);
        const text = ` | CAMERA FRAMES ${cameraFramesVersion}`;
        if (existing) {
            existing.textContent = text;
            return;
        }
        const span = document.createElement('span');
        span.className = EXISTING_CLASS;
        span.textContent = text;
        appLabel.appendChild(span);
    }

    attachPointerHandlers() {
        this.overlay.addEventListener('pointerdown', e => this.onPointerDown(e));
        this.overlay.addEventListener('pointermove', e => this.onPointerMove(e));
        this.overlay.addEventListener('pointerup', e => this.onPointerUp(e));
        this.overlay.addEventListener('pointercancel', e => this.onPointerUp(e));
        this.overlay.addEventListener('dblclick', e => this.onDoubleClick(e));
        this.overlay.addEventListener('lostpointercapture', () => {
            this.historyCommit('cameraFrames.drag');
            this.dragState = null;
        });
    }

    private hitTestFrameBorder(px: number, py: number) {
        const HIT = 8;
        const rects = this.frameRectsScreen().sort((a, b) => a.frame.order - b.frame.order);
        const logical = this.screenToLogical(px, py);
        for (let i = rects.length - 1; i >= 0; i--) {
            const r = rects[i];
            const margin = HIT / Math.max(1e-6, r.effectiveScale);
            const dx = logical.x - r.centerLogical.x;
            const dy = logical.y - r.centerLogical.y;
            const local = this.rotateOffset({ x: dx, y: dy }, -r.rotationRad);
            const inside = Math.abs(local.x) <= r.frameW * 0.5 + margin && Math.abs(local.y) <= r.frameH * 0.5 + margin;
            const inner = Math.abs(local.x) <= Math.max(0, r.frameW * 0.5 - margin) && Math.abs(local.y) <= Math.max(0, r.frameH * 0.5 - margin);
            if (inside && !inner) {
                return r.frame;
            }
        }
        return null;
    }

    private onPointerDown(e: PointerEvent) {
        if (!this.state.enabled) return;
        const handleHit = this.hitTestHandle(e.offsetX, e.offsetY);
        const frame = handleHit?.frame ?? this.hitTestFrameBorder(e.offsetX, e.offsetY);
        if (e.shiftKey && e.button === 0 && !handleHit && !frame) {
            this.overlay.setPointerCapture(e.pointerId);
            this.dragState = {
                frameId: null,
                startPos: { x: 0, y: 0 },
                startPointer: { x: e.offsetX, y: e.offsetY },
                axisLock: null,
                shiftLock: false,
                pointerId: e.pointerId,
                mode: 'pan',
                startCenterScreen: { x: this.state.renderBox.center.cx, y: this.state.renderBox.center.cy }
            };
            this.historyBegin('cameraFrames.renderBoxPan');
            this.overlay.style.cursor = 'grabbing';
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        if (!frame) {
            return;
        }

        this.selectFrame(frame.id);
        this.overlay.setPointerCapture(e.pointerId);

        const rb = this.state.renderBox;
        const mapping = this.computeViewportMapping();
        const logicalW = mapping.logicalW;
        const logicalH = mapping.logicalH;
        const centerLogical = this.frameCenterLogical(frame, logicalW, logicalH);
        const frameW = frame.baseSize.w * frame.scaleK;
        const frameH = frame.baseSize.h * frame.scaleK;
        const rotationRad = this.frameRotationRad(frame);

        const handleId = handleHit?.handleId;
        const mode: 'move' | 'resize' | 'anchor' | 'rotate' =
            handleId === 'anchor' ? 'anchor' :
                (handleId === 'rotate' ? 'rotate' : (handleId ? 'resize' : 'move'));

        const anchorLogicalDefault = this.getAnchorLogicalForHandle(handleId, frame, centerLogical, frameW, frameH, logicalW, logicalH, rotationRad);
        const anchorLogical = (mode === 'resize' && e.altKey) ? this.frameAnchorLogical(frame, logicalW, logicalH) : anchorLogicalDefault;
        const handleLogical = handleId ? this.getHandleLogicalPosition(handleId, centerLogical, frameW, frameH, rotationRad) : null;
        const startDistance = (mode === 'resize' && handleLogical) ? Math.hypot(handleLogical.x - anchorLogical.x, handleLogical.y - anchorLogical.y) : null;
        const pointerLogical = this.screenToLogical(e.offsetX, e.offsetY);
        const startAngle = (mode === 'rotate') ? Math.atan2(pointerLogical.y - anchorLogical.y, pointerLogical.x - anchorLogical.x) : undefined;

        this.dragState = {
            frameId: frame.id,
            startPos: { ...frame.pos },
            startPointer: { x: e.offsetX, y: e.offsetY },
            axisLock: null,
            shiftLock: e.shiftKey,
            pointerId: e.pointerId,
            mode,
            handleId,
            startScaleK: frame.scaleK,
            startCenterLogical: centerLogical,
            startAnchorLogical: anchorLogical,
            startHandleLogical: handleLogical,
            startDistance,
            startRotationRad: mode === 'rotate' ? rotationRad : undefined,
            startAngle
        };
        this.historyBegin(`cameraFrames.${mode}`);
        this.overlay.style.cursor = mode === 'rotate' ? 'grabbing' : this.getCursorForHit(handleId, true);

        e.stopPropagation();
        e.preventDefault();
    }

    private onPointerMove(e: PointerEvent) {
        if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;
        if (this.dragState.mode === 'pan') {
            this.handlePanDrag(e);
            this.overlay.style.cursor = 'grabbing';
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        const frame = this.state.frames.find(f => f.id === this.dragState.frameId);
        if (!frame) return;

        const rb = this.state.renderBox;
        const mapping = this.computeViewportMapping();
        const logicalW = mapping.logicalW;
        const logicalH = mapping.logicalH;

        if (this.dragState.mode === 'move') {
            const dx = e.offsetX - this.dragState.startPointer.x;
            const dy = e.offsetY - this.dragState.startPointer.y;

            if (this.dragState.shiftLock && !this.dragState.axisLock) {
                if (Math.abs(dx) + Math.abs(dy) > 5) {
                    this.dragState.axisLock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
                }
            }

            const effectiveScale = mapping.viewScale;
            const deltaLocalX = dx / (effectiveScale * logicalW);
            const deltaLocalY = dy / (effectiveScale * logicalH);

            frame.pos.x = this.dragState.startPos.x + (this.dragState.axisLock === 'y' ? 0 : deltaLocalX);
            frame.pos.y = this.dragState.startPos.y + (this.dragState.axisLock === 'x' ? 0 : deltaLocalY);
        } else if (this.dragState.mode === 'anchor') {
            const logical = this.screenToLogical(e.offsetX, e.offsetY);
            frame.anchor = {
                x: 0.5 + (logical.x - rb.center.cx) / logicalW,
                y: 0.5 + (logical.y - rb.center.cy) / logicalH
            };
        } else if (this.dragState.mode === 'resize') {
            const start = this.dragState;
            const logical = this.screenToLogical(e.offsetX, e.offsetY);
            const handleLogical = logical;
            if (!start.startHandleLogical || !start.startAnchorLogical || !start.startCenterLogical || !start.startScaleK || !start.startDistance) {
                return;
            }
            const d1 = Math.hypot(handleLogical.x - start.startAnchorLogical.x, handleLogical.y - start.startAnchorLogical.y);
            if (d1 <= 1e-6 || start.startDistance <= 1e-6) return;
            const s = d1 / start.startDistance;

            const newScaleK = start.startScaleK * s;
            const MIN_K = 0.10;  // 10%
            const MAX_K = 4.0;   // 400%
            const clampedK = Math.min(MAX_K, Math.max(MIN_K, newScaleK));
            frame.scaleK = clampedK;
            frame.scalePct = clampedK * 100;

            const newCenter = {
                x: start.startAnchorLogical.x + (start.startCenterLogical.x - start.startAnchorLogical.x) * s,
                y: start.startAnchorLogical.y + (start.startCenterLogical.y - start.startAnchorLogical.y) * s
            };

            frame.pos.x = 0.5 + (newCenter.x - rb.center.cx) / logicalW;
            frame.pos.y = 0.5 + (newCenter.y - rb.center.cy) / logicalH;
        } else if (this.dragState.mode === 'rotate') {
            this.overlay.style.cursor = 'grabbing';
            const start = this.dragState;
            if (!start.startAnchorLogical || !start.startCenterLogical || start.startRotationRad === undefined || start.startAngle === undefined) {
                return;
            }
            const anchorLogical = start.startAnchorLogical;
            const logical = this.screenToLogical(e.offsetX, e.offsetY);
            const angle = Math.atan2(logical.y - anchorLogical.y, logical.x - anchorLogical.x);
            const delta = angle - start.startAngle;
            const unsnappedNextRad = start.startRotationRad + delta;
            const useSnap = start.shiftLock || e.shiftKey;
            const snap = Math.PI / 12; // 15deg snap
            const nextRad = useSnap ? Math.round(unsnappedNextRad / snap) * snap : unsnappedNextRad;
            this.applyFrameRotationFromStart(frame, start, nextRad, logicalW, logicalH);
        }

        this.requestRender();
        this.events.fire('cameraFrames.stateChanged', this.snapshot());

        e.stopPropagation();
        e.preventDefault();
    }

    private clampCenterToViewport(cx: number, cy: number, rectW: number, rectH: number, vw: number, vh: number) {
        const halfW = rectW * 0.5;
        const halfH = rectH * 0.5;
        let minCx = -PAN_MARGIN_PX + halfW;
        let maxCx = vw + PAN_MARGIN_PX - halfW;
        if (minCx > maxCx) {
            const mid = (minCx + maxCx) * 0.5;
            minCx = mid;
            maxCx = mid;
        }
        let minCy = -PAN_MARGIN_PX + halfH;
        let maxCy = vh + PAN_MARGIN_PX - halfH;
        if (minCy > maxCy) {
            const mid = (minCy + maxCy) * 0.5;
            minCy = mid;
            maxCy = mid;
        }
        return {
            cx: Math.min(maxCx, Math.max(minCx, cx)),
            cy: Math.min(maxCy, Math.max(minCy, cy))
        };
    }

    private handlePanDrag(e: PointerEvent) {
        const mapping = this.computeViewportMapping();
        const rectW = mapping.logicalW * mapping.viewScale;
        const rectH = mapping.logicalH * mapping.viewScale;
        const vw = this.scene.camera.targetSize?.width ?? this.viewport.vw;
        const vh = this.scene.camera.targetSize?.height ?? this.viewport.vh;
        const startCenter = this.dragState.startCenterScreen ?? { x: this.state.renderBox.center.cx, y: this.state.renderBox.center.cy };
        const dx = e.offsetX - (this.dragState.startPointer?.x ?? e.offsetX);
        const dy = e.offsetY - (this.dragState.startPointer?.y ?? e.offsetY);
        const nextCenter = this.clampCenterToViewport(
            startCenter.x + dx,
            startCenter.y + dy,
            rectW,
            rectH,
            vw,
            vh
        );

        this.state.renderBox.center = nextCenter;
        this.syncCameraFrustum();
        this.requestRender();
        this.events.fire('cameraFrames.stateChanged', this.snapshot());
    }

    private applyFrameRotationFromStart(frame: FrameState, start: { startCenterLogical?: { x: number; y: number; }; startAnchorLogical?: { x: number; y: number; }; startRotationRad?: number; }, nextRad: number, logicalW: number, logicalH: number) {
        if (!start.startCenterLogical || !start.startAnchorLogical) {
            return;
        }
        const rb = this.state.renderBox;
        const baseRad = start.startRotationRad ?? 0;
        const delta = nextRad - baseRad;
        const offset = {
            x: start.startCenterLogical.x - start.startAnchorLogical.x,
            y: start.startCenterLogical.y - start.startAnchorLogical.y
        };
        const rotatedOffset = this.rotateOffset(offset, delta);
        const newCenter = {
            x: start.startAnchorLogical.x + rotatedOffset.x,
            y: start.startAnchorLogical.y + rotatedOffset.y
        };
        frame.rotationDeg = this.normalizeDegrees(nextRad * RAD2DEG);
        frame.pos.x = 0.5 + (newCenter.x - rb.center.cx) / logicalW;
        frame.pos.y = 0.5 + (newCenter.y - rb.center.cy) / logicalH;
    }

    private onPointerUp(e: PointerEvent) {
        if (this.dragState && e.pointerId === this.dragState.pointerId) {
            this.historyCommit('cameraFrames.drag');
            this.overlay.releasePointerCapture(e.pointerId);
            this.dragState = null;
            this.lastPointer = { x: e.clientX, y: e.clientY };
            this.updatePointerFromLast();
            this.overlay.style.cursor = e.shiftKey ? 'grab' : '';
            e.stopPropagation();
            e.preventDefault();
        }
    }

    private onDoubleClick(e: MouseEvent) {
        if (!this.state.enabled) return;
        const handleHit = this.hitTestHandle(e.offsetX, e.offsetY);
        if (handleHit?.handleId === 'anchor') {
            this.resetAnchorToCenter(handleHit.frame);
        } else if (handleHit?.handleId === 'rotate') {
            this.resetFrameRotation(handleHit.frame);
        } else {
            return;
        }
        e.stopPropagation();
        e.preventDefault();
    }

    private resetFrameRotation(frame: FrameState | null) {
        this.historyRecord('cameraFrames.resetRotation', () => {
            if (!frame) {
                return;
            }
            const rb = this.state.renderBox;
            const logicalW = rb.baseSize.w * rb.scale.kx;
            const logicalH = rb.baseSize.h * rb.scale.ky;
            const start = {
                startCenterLogical: this.frameCenterLogical(frame, logicalW, logicalH),
                startAnchorLogical: this.frameAnchorLogical(frame, logicalW, logicalH),
                startRotationRad: this.frameRotationRad(frame)
            };
            this.applyFrameRotationFromStart(frame, start, 0, logicalW, logicalH);
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
        });
    }

    private resetAnchorToCenter(frame: FrameState | null) {
        this.historyRecord('cameraFrames.resetAnchor', () => {
            if (!frame) {
                return;
            }
            frame.anchor = { x: frame.pos.x, y: frame.pos.y };
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
        });
    }

    // rendering to image ---------------------------------------------------

    private drawFramesToCtx(ctx: CanvasRenderingContext2D, rb: RenderBoxState, width: number, height: number, frames: FrameState[]) {
        const logicalW = rb.baseSize.w * rb.scale.kx;
        const logicalH = rb.baseSize.h * rb.scale.ky;
        const boxLeft = width * 0.5 - logicalW * 0.5;
        const boxTop = height * 0.5 - logicalH * 0.5;
        ctx.save();
        ctx.beginPath();
        ctx.rect(boxLeft, boxTop, logicalW, logicalH);
        ctx.clip();

        const framesSorted = frames.slice().sort((a, b) => a.order - b.order);
        framesSorted.forEach((frame) => {
            const frameW = frame.baseSize.w * frame.scaleK;
            const frameH = frame.baseSize.h * frame.scaleK;
            const centerX = width * 0.5 + (frame.pos.x - 0.5) * logicalW;
            const centerY = height * 0.5 + (frame.pos.y - 0.5) * logicalH;
            const rotationRad = this.frameRotationRad(frame);
            const lineWidth = 2;
            ctx.save();
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = lineWidth;

            // 回転が 90 度刻み（軸揃い）の場合はピクセルグリッドにスナップしてシャープに描く
            const quarterTurn = Math.PI * 0.5;
            const nearestQuarter = Math.round(rotationRad / quarterTurn);
            const alignedRad = nearestQuarter * quarterTurn;
            const isAxisAligned = Math.abs(rotationRad - alignedRad) < 1e-3;

            if (isAxisAligned) {
                const swap = (Math.abs(nearestQuarter) % 2) === 1;
                const w = swap ? frameH : frameW;
                const h = swap ? frameW : frameH;
                const left = Math.round(centerX - w * 0.5);
                const top = Math.round(centerY - h * 0.5);
                const snapW = Math.round(w);
                const snapH = Math.round(h);
                ctx.strokeRect(left, top, snapW, snapH);
            } else {
                ctx.translate(centerX, centerY);
                ctx.rotate(rotationRad);
                ctx.strokeRect(-frameW * 0.5, -frameH * 0.5, frameW, frameH);
            }
            ctx.restore();
        });

        ctx.restore();
    }

    private canvasFromPixels(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for overlay render');
        }
        const view = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels);
        const imgData = new ImageData(width, height);
        imgData.data.set(view);
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }

    private async renderBase(width: number, height: number) {
        const pixels = await this.events.invoke('render.offscreen', width, height) as Uint8Array;
        if (!pixels) {
            throw new Error('render.offscreen returned empty buffer');
        }
        return pixels;
    }

    private async renderOverlayPass(width: number, height: number) {
        if (!this.state.exportGridOverlay) {
            return null;
        }
        const pixels = await this.events.invoke('render.offscreen', width, height, {
            includeGrid: true,
            includeEyeLevel: true,
            overlaysOnly: true,
            unpremultiplyAlpha: true
        }) as Uint8Array;
        if (!pixels) {
            throw new Error('render.offscreen returned empty overlay buffer');
        }
        return { canvas: this.canvasFromPixels(pixels, width, height) };
    }

    private renderFrameOverlay(width: number, height: number, frames?: FrameState[]) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for frame overlay');
        }

        const framesToDraw = frames ?? this.state.frames;
        this.drawFramesToCtx(ctx, this.state.renderBox, width, height, framesToDraw);
        return { canvas };
    }

    private frameManagementName(frameId: string | null | undefined) {
        const raw = (frameId ?? '').toString();
        const match = raw.match(/[a-z]+/i);
        const name = (match?.[0] ?? raw).trim();
        return name.length > 0 ? name.toUpperCase() : 'Frames';
    }

    private renderFrameOverlaysByManagement(width: number, height: number) {
        const framesSorted = this.state.frames.slice().sort((a, b) => a.order - b.order);
        const order: string[] = [];
        const groups = new Map<string, FrameState[]>();

        framesSorted.forEach((frame) => {
            const name = this.frameManagementName(frame.id);
            if (!groups.has(name)) {
                groups.set(name, []);
                order.push(name);
            }
            groups.get(name).push(frame);
        });

        return order.map((name) => {
            const groupFrames = groups.get(name) ?? [];
            const { canvas } = this.renderFrameOverlay(width, height, groupFrames);
            return { name, canvas };
        });
    }

    private getCompressor() {
        if (!this.compressor) {
            this.compressor = new PngCompressor();
        }
        return this.compressor;
    }

    private flipForCompressor(data: Uint32Array, width: number, height: number) {
        // render.offscreen() は既に y 軸を反転済みだが、PngCompressor でもう一度反転されるため、
        // ここでバッファを bottom-up に戻しておく（ダブルフリップ対策）。
        const flipped = new Uint32Array(data.length);
        for (let y = 0; y < height; y++) {
            const srcStart = (height - 1 - y) * width;
            const dstStart = y * width;
            flipped.set(data.subarray(srcStart, srcStart + width), dstStart);
        }
        return flipped;
    }

    private downloadArrayBuffer(arrayBuffer: ArrayBuffer, filename: string) {
        const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const el = document.createElement('a');
        el.href = url;
        el.download = filename;
        el.click();
        URL.revokeObjectURL(url);
    }

    private addPngDpi(arrayBuffer: ArrayBuffer, dpi: number) {
        const data = new Uint8Array(arrayBuffer);
        const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        if (data.length < 33 || !PNG_SIG.every((b, i) => data[i] === b)) {
            return arrayBuffer;
        }

        const readUint32BE = (offset: number) => {
            return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
        };

        let ihdrEnd = -1;
        let offset = 8; // after signature
        while (offset + 8 <= data.length) {
            const length = readUint32BE(offset);
            const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
            const chunkEnd = offset + 8 + length + 4;
            if (chunkEnd > data.length) {
                break;
            }
            if (type === 'IHDR') {
                ihdrEnd = chunkEnd;
                break;
            }
            offset = chunkEnd;
        }

        if (ihdrEnd < 0) {
            return arrayBuffer;
        }

        const ppm = Math.max(1, Math.round(dpi * 39.37007874015748)); // pixels per meter

        const chunk = new Uint8Array(4 + 4 + 9 + 4);
        const view = new DataView(chunk.buffer);
        view.setUint32(0, 9); // data length
        chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
        view.setUint32(8, ppm, false);  // X pixels per unit
        view.setUint32(12, ppm, false); // Y pixels per unit
        chunk[16] = 1; // unit: meter

        const crc = new Crc();
        crc.update(chunk.subarray(4, 17)); // type + data
        view.setUint32(17, crc.value(), false);

        const result = new Uint8Array(data.length + chunk.length);
        result.set(data.subarray(0, ihdrEnd), 0);
        result.set(chunk, ihdrEnd);
        result.set(data.subarray(ihdrEnd), ihdrEnd + chunk.length);
        return result.buffer;
    }

    private async renderPng(params: { basePixels: Uint8Array; frameOverlay: HTMLCanvasElement; gridOverlay?: HTMLCanvasElement | null; width: number; height: number; filename: string; }) {
        const { basePixels, frameOverlay, gridOverlay, width, height, filename } = params;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for PNG render');
        }

        const imgData = new ImageData(new Uint8ClampedArray(basePixels), width, height);
        ctx.putImageData(imgData, 0, 0);
        if (gridOverlay) {
            ctx.drawImage(gridOverlay, 0, 0);
        }
        ctx.drawImage(frameOverlay, 0, 0);

        const merged = new Uint32Array(ctx.getImageData(0, 0, width, height).data.buffer);
        const flipped = this.flipForCompressor(merged, width, height);

        const compressor = this.getCompressor();
        let arrayBuffer = await compressor.compress(flipped, width, height);
        arrayBuffer = this.addPngDpi(arrayBuffer, 150);
        this.downloadArrayBuffer(arrayBuffer, filename);
    }

    private async renderPsd(params: { basePixels: Uint8ClampedArray; overlays: Array<{ name: string; canvas: HTMLCanvasElement; }>; width: number; height: number; filename: string; }) {
        const { basePixels, overlays, width, height, filename } = params;
        await exportPsd({
            basePixels,
            overlays,
            width,
            height,
            filename
        });
    }

    private async renderImage(options?: { format?: ExportFormat; filename?: string }) {
        const rb = this.state.renderBox;
        const width = Math.round(rb.baseSize.w * rb.scale.kx);
        const height = Math.round(rb.baseSize.h * rb.scale.ky);

        if (width <= 0 || height <= 0) {
            return;
        }

        const format = this.normalizeFormat(options?.format ?? this.state.exportFormat);
        const filename = this.resolveFilename(options?.filename ?? this.state.exportName, format);

        try {
            // 書き出し前に明示的にエクスポート用フラスタムを適用し、副作用イベント(camera.resize)頼りを排除
            this.syncExportFrustum(width, height);
            const basePixels = await this.renderBase(width, height);
            const gridOverlay = await this.renderOverlayPass(width, height);

            if (format === 'psd') {
                const overlays = this.renderFrameOverlaysByManagement(width, height);
                const overlayLayers = gridOverlay ?
                    [
                        { name: localize('panel.camera-frames.export.grid-layer'), canvas: gridOverlay.canvas },
                        ...overlays
                    ] :
                    overlays;
                await this.renderPsd({
                    basePixels: basePixels instanceof Uint8ClampedArray ? basePixels : new Uint8ClampedArray(basePixels),
                    overlays: overlayLayers,
                    width,
                    height,
                    filename
                });
            } else {
                const overlay = this.renderFrameOverlay(width, height);
                await this.renderPng({
                    basePixels,
                    frameOverlay: overlay.canvas,
                    gridOverlay: gridOverlay?.canvas ?? null,
                    width,
                    height,
                    filename
                });
            }
        } catch (error) {
            console.error('cameraFrames.render failed', error);
            await this.events.invoke('showPopup', {
                type: 'error',
                header: 'Camera Frames',
                message: `'${(error as Error)?.message ?? error}'`
            });
        } finally {
            // --- 修正箇所: ビューの復元 ---
            // render.offscreen が終了し、scene.camera.targetSize は null に戻っている。
            // ここで syncCameraFrustum を呼ぶことで、「Exportモード」から「Previewモード」の計算に戻り、
            // 元の ViewZoomPct が適用されたフラスタムがカメラに再設定される。
            if (this.state.enabled) {
                this.syncCameraFrustum();
                this.requestRender();
            }
        }
    }

    // 書き出し開始前に、指定サイズを前提としたエクスポート用フラスタムを明示的にカメラへ適用する
    // camera.resize などの副作用イベントに依存しない安全策。
    private syncExportFrustum(width: number, height: number) {
        // 一時的に targetSize を設定して export モードの計算を行い、終わったら戻す
        const prevTarget = this.scene.camera.targetSize ? { ...this.scene.camera.targetSize } : null;
        this.scene.camera.targetSize = { width, height };
        this.syncCameraFrustum();
        this.scene.camera.targetSize = prevTarget;
    }

    // serialization --------------------------------------------------------

    public snapshot(): CameraFramesState {
        return {
            enabled: this.state.enabled,
            renderBox: JSON.parse(JSON.stringify(this.state.renderBox)),
            frames: this.state.frames.map(cloneFrame),
            mask: { ...this.state.mask },
            nearClip: this.state.nearClip,
            exportName: this.state.exportName,
            exportFormat: this.normalizeFormat(this.state.exportFormat),
            exportGridOverlay: !!this.state.exportGridOverlay
        };
    }

    public applySnapshot(snapshot: CameraFramesState) {
        this.applyingHistory = true;
        try {
            this.state = JSON.parse(JSON.stringify(snapshot));
            this.selectedId = this.state.frames.find(f => f.selected)?.id ?? null;
            this.state.nearClip = this.computeSafeNearClip(this.state.nearClip);
            this.state.exportGridOverlay = !!this.state.exportGridOverlay;
            this.overlay.style.pointerEvents = 'none';
            this.rebuildBaseFrustum();
            if (this.state.enabled) {
                this.applyNearClipOverride();
                this.computeViewportMapping(true);
                this.syncCameraFrustum();
                this.scheduleNearClipGuard();
            } else {
                this.events.fire('camera.setNearOverride', null);
                this.events.fire('camera.setCustomFrustum', null);
            }
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        } finally {
            this.applyingHistory = false;
        }
    }

    private serialize() {
        const snap = this.snapshot();
        return {
            ...snap,
            selectedId: this.selectedId,
            version: cameraFramesVersion
        };
    }

    private deserialize(docState: any) {
        if (!docState) {
            this.state = {
                enabled: false,
                renderBox: DEFAULT_RENDERBOX(),
                frames: [],
                mask: { ...DEFAULT_MASK },
                nearClip: null,
                exportName: 'yc4_00_000_CGLO',
                exportFormat: 'png',
                exportGridOverlay: false
            };
            this.selectedId = null;
            this.rebuildBaseFrustum();
            if (this.state.enabled) {
                this.syncCameraFrustum();
            }
            this.updateFovInfo();
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            return;
        }

        const _stateVersion = docState.version ?? 0; // reserved for future migrations

        const rb = docState.renderBox ?? DEFAULT_RENDERBOX();
        const exportName = typeof docState.exportName === 'string' ? docState.exportName : 'yc4_00_000_CGLO';
        const exportFormat = this.normalizeFormat(docState.exportFormat ?? 'psd');
        const exportGridOverlay = !!docState.exportGridOverlay;
        const frames = (docState.frames ?? []).map((f: FrameState) => ({
            id: f.id,
            pos: { ...f.pos },
            scalePct: f.scalePct ?? 100,
            scaleK: (f.scalePct ?? 100) / 100,
            baseSize: f.baseSize ?? { ...DEFAULT_FRAME_BASE },
            order: f.order ?? 0,
            rotationDeg: (typeof f.rotationDeg === 'number' && isFinite(f.rotationDeg)) ? f.rotationDeg : 0,
            anchor: f.anchor ? { ...f.anchor } : { x: f.pos?.x ?? 0.5, y: f.pos?.y ?? 0.5 }
        }));

        const baseSize = rb.baseSize ?? DEFAULT_RENDERBOX().baseSize;
        const MIN_PCT = 100;
        const MAX_DIM = 16000;
        const rawScalePctX = rb.scalePct?.x ?? 100;
        const rawScalePctY = rb.scalePct?.y ?? 100;
        const maxScalePctX = baseSize.w > 0 ? Math.floor((MAX_DIM / baseSize.w) * 100) : MIN_PCT;
        const maxScalePctY = baseSize.h > 0 ? Math.floor((MAX_DIM / baseSize.h) * 100) : MIN_PCT;
        const clampedScalePctX = Math.min(maxScalePctX, Math.max(MIN_PCT, rawScalePctX));
        const clampedScalePctY = Math.min(maxScalePctY, Math.max(MIN_PCT, rawScalePctY));
        const scalePct = { x: clampedScalePctX, y: clampedScalePctY };
        const scale = {
            kx: rb.scale?.kx ?? scalePct.x / 100,
            ky: rb.scale?.ky ?? scalePct.y / 100
        };
        const legacyUiScale = (typeof rb.uiScale === 'number' && isFinite(rb.uiScale)) ? rb.uiScale : undefined;
        const viewZoomPct = this.normalizeViewZoomPct(rb.viewZoomPct ?? (legacyUiScale !== undefined ? legacyUiScale * 100 : undefined));
        const lastViewport = rb.lastViewport ?? { ...this.viewport };
        const logicalW = baseSize.w * scale.kx;
        const logicalH = baseSize.h * scale.ky;
        const autoFit = Math.min(
            lastViewport.vw > 0 ? lastViewport.vw / logicalW : 1,
            lastViewport.vh > 0 ? lastViewport.vh / logicalH : 1
        ) || 1;
        const legacyViewScale = (typeof rb.viewScale === 'number' && isFinite(rb.viewScale)) ? rb.viewScale : null;
        const fitScale = (() => {
            if (legacyViewScale) {
                const divisor = legacyUiScale ?? (viewZoomPct / 100);
                if (divisor > 0) {
                    const fit = legacyViewScale / divisor;
                    if (isFinite(fit) && fit > 0) {
                        return fit;
                    }
                }
            }
            if (isFinite(rb.fitScale) && rb.fitScale > 0) {
                return rb.fitScale;
            }
            return autoFit;
        })();
        const projection = (() => {
            const raw = rb.projection ?? {};
            let baseFov = this.scene.camera.fov;
            if (typeof raw.baseFov === 'number' && isFinite(raw.baseFov)) {
                baseFov = raw.baseFov;
            } else if (typeof (raw as any).fovY === 'number' && isFinite((raw as any).fovY)) {
                baseFov = (raw as any).fovY;
            }
            return {
                type: raw.type ?? 'perspective',
                baseFov,
                orthoHalfHeight: raw.orthoHalfHeight
            };
        })();

        this.state = {
            enabled: !!docState.enabled,
            renderBox: {
                ...DEFAULT_RENDERBOX(),
                baseSize,
                scalePct,
                scale,
                anchor: rb.anchor ?? { ax: 0.5, ay: 0.5 },
                center: rb.center ?? { cx: this.viewport.vw / 2, cy: this.viewport.vh / 2 },
                fitScale,
                viewZoomPct,
                lastViewport,
                projection
            },
            frames,
            mask: {
                ...DEFAULT_MASK,
                ...(docState.mask ?? {})
            },
            nearClip: (typeof docState.nearClip === 'number' && isFinite(docState.nearClip)) ? Math.max(1e-6, docState.nearClip) : null,
            exportName,
            exportFormat,
            exportGridOverlay
        };

        this.state.nearClip = this.computeSafeNearClip(this.state.nearClip);

        this.overlay.style.pointerEvents = 'none';

        this.selectedId = docState.selectedId ?? frames[0]?.id ?? null;
        this.state.frames.forEach((f) => {
            f.selected = f.id === this.selectedId;
        });

        // 現在の viewport に合わせて rect を整合
        this.computeViewportMapping(false);
        this.rebuildBaseFrustum();
        if (this.state.enabled) {
            this.syncCameraFrustum();
        }

        this.scheduleNearClipGuard();
        this.requestRender();
        this.events.fire('cameraFrames.stateChanged', this.snapshot());
        this.updatePointerFromLast();
        this.updateFovInfo();
    }
}

const registerCameraFrames = (events: Events, scene: Scene, canvasContainer: HTMLElement) => {
    const controller = new CameraFramesController(events, scene, canvasContainer);
    controller.attachPointerHandlers();
    return controller;
};

export { registerCameraFrames };
