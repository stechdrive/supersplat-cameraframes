import { readPsd, type Layer } from 'ag-psd';
import { Texture } from 'playcanvas';

import { Events } from './events';
import { ReferenceImageAssets } from './reference-image-assets';
import { DEFAULT_REFERENCE_IMAGE_FILENAME, normalizeReferenceImageFilename } from './reference-image-filename';
import { ReferenceImageLoader } from './reference-image-loader';
import { ReferenceImageRenderer, type RenderParams } from './reference-image-renderer';
import type { ReferenceImageSourceMeta, ReferenceImageState } from './reference-image-types';
import type { ReferenceImagesHistory } from './reference-images-history';
import {
    DEFAULT_REFERENCE_IMAGES_STATE,
    type ReferenceImageAsset,
    type ReferenceImageItemGroup,
    type ReferenceImageItemState,
    type ReferenceImageItemV2,
    type ReferenceImagePreset,
    type ReferenceImagesDocState,
    type ReferenceImagesDocStateV1,
    type ReferenceImagesExportLayer,
    type ReferenceImagesFullState,
    type ReferenceImagesPresetsState,
    type ReferenceImagesState
} from './reference-images-types';
import { Scene } from './scene';

type ViewportMapping = {
    logicalW: number;
    logicalH: number;
    rectPxRaw: { x: number; y: number; w: number; h: number; };
    rectNormRaw: { x: number; y: number; w: number; h: number; };
};

type ReferenceImageItemRuntime = {
    assetId: string;
    blob: Blob | null;
    previewCanvas: HTMLCanvasElement | null;
    texture: Texture | null;
};

type ExportWorkEntry = {
    canvas: HTMLCanvasElement | null;
    promise: Promise<HTMLCanvasElement> | null;
};

type ReferenceImageItemPatch = Partial<Omit<ReferenceImageItemState, 'offsetPx' | 'anchor'>> & {
    offsetPx?: { x?: number; y?: number; };
    anchor?: { ax?: number; ay?: number; };
};

type ReferenceImagesUpdateManyPayload = {
    ids?: string[];
    patch?: ReferenceImageItemPatch;
    updates?: Array<{ id: string; patch: ReferenceImageItemPatch; }>;
};

type PendingAdd = {
    id: string;
    decoded: Awaited<ReturnType<ReferenceImageLoader['decode']>>;
    assetId: string;
    assetSource: ReferenceImageSourceMeta;
    assetBlob: Blob;
    assetIsNew: boolean;
    group: ReferenceImageItemGroup;
    name: string;
    visible: boolean;
    includeInRender: boolean;
    opacity: number;
    scalePct: number;
    offsetPx: { x: number; y: number; };
    anchor: { ax: number; ay: number; };
};

type AddContext = {
    presetId: string | null;
    cameraPresetId: string | null;
    cameraName: string;
    presetNameHint?: string;
};

type ReferenceImagesLoadReport = {
    missingItems: number;
};

type ReferenceImageItemBase = ReferenceImageItemState | ReferenceImageItemV2;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const DEFAULT_REFERENCE_IMAGE_PRESET_ID = 'refpreset-blank';
const DEFAULT_REFERENCE_IMAGE_PRESET_NAME = '(blank)';
const LEGACY_REFERENCE_IMAGE_PRESET_ID = 'refpreset-1';
const LEGACY_REFERENCE_IMAGE_PRESET_NAME = 'Preset 1';
let fallbackIdCounter = 0;
const createId = () => {
    try {
        const uuid = (globalThis.crypto as any)?.randomUUID?.();
        if (typeof uuid === 'string' && uuid) {
            return uuid;
        }
    } catch {
        // ignore
    }
    fallbackIdCounter++;
    return `refimg_${Date.now().toString(16)}_${fallbackIdCounter.toString(16)}_${Math.random().toString(16).slice(2)}`;
};

let presetIdCounter = 0;
const createPresetId = () => {
    try {
        const uuid = (globalThis.crypto as any)?.randomUUID?.();
        if (typeof uuid === 'string' && uuid) {
            return `refpreset_${uuid}`;
        }
    } catch {
        // ignore
    }
    presetIdCounter++;
    return `refpreset_${Date.now().toString(16)}_${presetIdCounter.toString(16)}_${Math.random().toString(16).slice(2)}`;
};

const createCanvasBlob = (canvas: HTMLCanvasElement, type: string) => {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create blob from canvas'));
            }
        }, type);
    });
};

const isReferenceImageGroup = (value: unknown): value is ReferenceImageItemGroup => value === 'back' || value === 'front';

const normalizeGroup = (value: unknown, fallback: ReferenceImageItemGroup): ReferenceImageItemGroup => {
    return isReferenceImageGroup(value) ? value : fallback;
};

const normalizeBool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

const normalizeAnchor = (value: any, fallback: { ax: number; ay: number; }) => {
    const ax = isFiniteNumber(value?.ax) ? clamp(value.ax, 0, 1) : fallback.ax;
    const ay = isFiniteNumber(value?.ay) ? clamp(value.ay, 0, 1) : fallback.ay;
    return { ax, ay };
};

const normalizeOffset = (value: any, fallback: { x: number; y: number; }) => {
    const x = isFiniteNumber(value?.x) ? value.x : fallback.x;
    const y = isFiniteNumber(value?.y) ? value.y : fallback.y;
    return { x, y };
};

const normalizeBaseRenderBox = (value: any) => {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const w = isFiniteNumber(value.w) ? value.w : null;
    const h = isFiniteNumber(value.h) ? value.h : null;
    if (w === null || h === null || w <= 0 || h <= 0) {
        return undefined;
    }
    return { w, h };
};

const normalizeItem = (value: any): ReferenceImageItemState | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const rawId = typeof value.id === 'string' && value.id ? value.id : createId();
    const id = rawId.replace(/[\\/]/g, '_');
    const source = value.source as ReferenceImageSourceMeta | null;
    if (!source || typeof source !== 'object') {
        return null;
    }
    const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : (source.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
    const group = normalizeGroup(value.group, 'front');
    const order = isFiniteNumber(value.order) ? Math.max(0, Math.floor(value.order)) : 0;
    const visible = normalizeBool(value.visible, true);
    const includeInRender = normalizeBool(value.includeInRender, false);
    const opacity = clamp(isFiniteNumber(value.opacity) ? value.opacity : 0.7, 0, 1);
    const scalePct = clamp(isFiniteNumber(value.scalePct) ? value.scalePct : 100, 1, 400);
    const offsetPx = normalizeOffset(value.offsetPx, { x: 0, y: 0 });
    const anchor = normalizeAnchor(value.anchor, { ax: 0.5, ay: 0.5 });

    return {
        id,
        name,
        group,
        order,
        visible,
        includeInRender,
        opacity,
        scalePct,
        offsetPx,
        anchor,
        source
    };
};

const normalizeItemV2 = (value: any): ReferenceImageItemV2 | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const rawId = typeof value.id === 'string' && value.id ? value.id : createId();
    const id = rawId.replace(/[\\/]/g, '_');
    const assetId = typeof value.assetId === 'string' && value.assetId ? value.assetId : null;
    if (!assetId) {
        return null;
    }
    const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : DEFAULT_REFERENCE_IMAGE_FILENAME;
    const group = normalizeGroup(value.group, 'front');
    const order = isFiniteNumber(value.order) ? Math.max(0, Math.floor(value.order)) : 0;
    const visible = normalizeBool(value.visible, true);
    const includeInRender = normalizeBool(value.includeInRender, false);
    const opacity = clamp(isFiniteNumber(value.opacity) ? value.opacity : 0.7, 0, 1);
    const scalePct = clamp(isFiniteNumber(value.scalePct) ? value.scalePct : 100, 1, 400);
    const offsetPx = normalizeOffset(value.offsetPx, { x: 0, y: 0 });
    const anchor = normalizeAnchor(value.anchor, { ax: 0.5, ay: 0.5 });

    return {
        id,
        name,
        group,
        order,
        visible,
        includeInRender,
        opacity,
        scalePct,
        offsetPx,
        anchor,
        assetId
    };
};

const normalizeOrders = (items: ReferenceImageItemBase[]) => {
    const groups: ReferenceImageItemGroup[] = ['back', 'front'];
    groups.forEach((group) => {
        const groupItems = items
        .filter(i => i.group === group)
        .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
        groupItems.forEach((item, index) => {
            item.order = index;
        });
    });
};

const createDefaultPreset = (id = DEFAULT_REFERENCE_IMAGE_PRESET_ID, name = DEFAULT_REFERENCE_IMAGE_PRESET_NAME): ReferenceImagePreset => ({
    id,
    name,
    masterVisible: true,
    activeId: null,
    items: []
});

const ensureBlankPreset = (presets: ReferenceImagePreset[]) => {
    const blank = presets.find(preset => preset.id === DEFAULT_REFERENCE_IMAGE_PRESET_ID) ?? null;
    if (blank) {
        blank.name = DEFAULT_REFERENCE_IMAGE_PRESET_NAME;
        return;
    }
    presets.push(createDefaultPreset());
};

const ensureUniquePresetIds = (presets: ReferenceImagePreset[]) => {
    const seen = new Set<string>();
    presets.forEach((preset) => {
        let id = preset.id;
        if (!id || seen.has(id)) {
            let nextId = createPresetId();
            while (seen.has(nextId)) {
                nextId = createPresetId();
            }
            id = nextId;
            preset.id = id;
        }
        seen.add(id);
    });
};

const normalizePreset = (value: any): ReferenceImagePreset | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const id = typeof value.id === 'string' && value.id ? value.id : createPresetId();
    const rawName = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : '';
    const fallbackName = id === DEFAULT_REFERENCE_IMAGE_PRESET_ID ?
        DEFAULT_REFERENCE_IMAGE_PRESET_NAME :
        LEGACY_REFERENCE_IMAGE_PRESET_NAME;
    const name = rawName || fallbackName;
    const masterVisible = normalizeBool(value.masterVisible, true);
    const baseRenderBox = normalizeBaseRenderBox((value as any).baseRenderBox);
    const itemsRaw = Array.isArray(value.items) ? value.items : [];
    const items = itemsRaw.map(normalizeItemV2).filter(Boolean) as ReferenceImageItemV2[];
    items.forEach((item) => {
        item.id = item.id.replace(/[\\/]/g, '_');
    });
    const ids = new Set(items.map(i => i.id));
    const activeId = (typeof value.activeId === 'string' && ids.has(value.activeId)) ? value.activeId : (items[0]?.id ?? null);
    items.forEach((item) => {
        item.order = isFiniteNumber(item.order) ? Math.max(0, Math.floor(item.order)) : 0;
    });
    return {
        id,
        name,
        masterVisible,
        activeId,
        baseRenderBox,
        items
    };
};

const normalizeFullState = (value: any): ReferenceImagesFullState => {
    const presetsRaw = Array.isArray(value?.presets) ? value.presets : [];
    const presets = presetsRaw.map(normalizePreset).filter(Boolean) as ReferenceImagePreset[];
    if (presets.length === 0) {
        presets.push(createDefaultPreset());
    }
    ensureBlankPreset(presets);
    ensureUniquePresetIds(presets);
    const assetsRaw = Array.isArray(value?.assets) ? (value.assets as unknown[]) : [];
    const assets = assetsRaw.filter((asset): asset is ReferenceImageAsset => {
        const candidate = asset as ReferenceImageAsset | null;
        return !!candidate &&
            typeof candidate.id === 'string' &&
            candidate.id &&
            candidate.source &&
            typeof candidate.source === 'object';
    }).map(asset => ({
        id: asset.id,
        source: asset.source
    }));
    presets.forEach((preset) => {
        preset.items.forEach((item) => {
            if (typeof item.order !== 'number' || !isFinite(item.order)) {
                item.order = 0;
            }
        });
        normalizeOrders(preset.items);
    });
    const requestedActivePresetId = (typeof value?.activePresetId === 'string' && value.activePresetId) ? value.activePresetId : presets[0].id;
    const activePresetId = presets.some(preset => preset.id === requestedActivePresetId) ? requestedActivePresetId : presets[0].id;
    return {
        version: 2,
        activePresetId,
        assets,
        presets
    };
};

class ReferenceImagesController {
    private events: Events;
    private scene: Scene;
    private loader = new ReferenceImageLoader();
    private renderer: ReferenceImageRenderer;
    private history: ReferenceImagesHistory | null = null;
    private applyingHistory = false;
    private fullState: ReferenceImagesFullState = {
        version: 2,
        activePresetId: DEFAULT_REFERENCE_IMAGE_PRESET_ID,
        assets: [],
        presets: [createDefaultPreset()]
    };
    private state: ReferenceImagesState = { ...DEFAULT_REFERENCE_IMAGES_STATE, items: [] };
    private runtimeById = new Map<string, ReferenceImageItemRuntime>();
    private assets = new ReferenceImageAssets();
    private exportWorkByAssetId = new Map<string, ExportWorkEntry>();
    private exportWorkOrder: string[] = [];
    private presetCounter = 0;
    private activePresetGeneration = 0;
    private activePresetTask: Promise<void> | null = null;

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        this.renderer = new ReferenceImageRenderer();
        this.scene.add(this.renderer);
        this.registerEvents();
        this.events.on('cameraFrames.stateChanged', () => this.requestRender());
        this.events.on('prerender', () => this.updateRenderer());
        this.events.on('scene.clear', () => this.reset());
        this.syncPresetCounter();
        this.rebuildActiveState();
    }

    private requestRender() {
        this.scene.forceRender = true;
    }

    setHistory(history: ReferenceImagesHistory) {
        this.history = history;
    }

    private historyBegin(label: string) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) return;
        this.history.begin(label);
    }

    private historyCommit(label?: string) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) return;
        this.history.commit(label);
    }

    private historyRecord(label: string, fn: () => void) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            fn();
            return;
        }
        this.history.record(label, fn);
    }

    private syncPresetCounter() {
        if (this.fullState.presets.length > this.presetCounter) {
            this.presetCounter = this.fullState.presets.length;
        }
    }

    private nextPresetName() {
        this.syncPresetCounter();
        this.presetCounter += 1;
        return `Preset ${this.presetCounter}`;
    }

    private ensureDefaultPreset() {
        if (!Array.isArray(this.fullState.presets) || this.fullState.presets.length === 0) {
            this.fullState.presets = [createDefaultPreset()];
        }
        if (!this.fullState.activePresetId || !this.fullState.presets.some(preset => preset.id === this.fullState.activePresetId)) {
            this.fullState.activePresetId = this.fullState.presets[0].id;
        }
        ensureBlankPreset(this.fullState.presets);
        this.fullState.version = 2;
    }

    private nextRuntimeGeneration() {
        this.activePresetGeneration += 1;
        return this.activePresetGeneration;
    }

    private isActivePresetItem(presetId: string, itemId: string) {
        if (this.fullState.activePresetId !== presetId) {
            return false;
        }
        const preset = this.getActivePreset();
        if (preset.id !== presetId) {
            return false;
        }
        return preset.items.some(item => item.id === itemId);
    }

    private pruneRuntimeToActivePreset(preset: ReferenceImagePreset) {
        const activeIds = new Set(preset.items.map(item => item.id));
        for (const [id, runtime] of this.runtimeById) {
            if (activeIds.has(id)) {
                continue;
            }
            const blob = runtime.blob ?? this.assets.getBlob(runtime.assetId);
            this.assets.rememberPreview(runtime.assetId, blob, runtime.previewCanvas);
            this.destroyRuntime(runtime);
            this.runtimeById.delete(id);
        }
    }

    private startActivePresetRuntimeRefresh(preset: ReferenceImagePreset) {
        const token = this.nextRuntimeGeneration();
        this.pruneRuntimeToActivePreset(preset);
        const task = this.ensureRuntimeForActivePreset(preset, token);
        this.activePresetTask = task;
        return task;
    }

    private async ensureRuntimeForActivePreset(preset: ReferenceImagePreset, token: number) {
        const presetId = preset.id;
        const assetsById = this.buildAssetsById();
        for (const item of preset.items) {
            if (token !== this.activePresetGeneration) {
                return;
            }
            if (!this.isActivePresetItem(presetId, item.id)) {
                continue;
            }
            const source = assetsById.get(item.assetId)?.source ?? null;
            if (!source) {
                continue;
            }
            let runtime = this.runtimeById.get(item.id);
            if (!runtime) {
                runtime = { assetId: item.assetId, blob: null, previewCanvas: null, texture: null };
                this.runtimeById.set(item.id, runtime);
            }
            if (runtime.assetId !== item.assetId) {
                this.destroyRuntime(runtime);
                runtime.assetId = item.assetId;
                runtime.blob = null;
                runtime.previewCanvas = null;
            }
            if (!runtime.blob || !runtime.previewCanvas || !runtime.texture) {
                this.restoreRuntimeFromCache(item.assetId, runtime, item);
            }
            if (!runtime.previewCanvas || !runtime.texture) {
                const blob = runtime.blob ?? this.assets.getBlob(item.assetId);
                if (!blob) {
                    continue;
                }
                try {
                    const decoded = await this.decodeForAdd(blob, source.filename);
                    if (token !== this.activePresetGeneration) {
                        return;
                    }
                    if (!this.isActivePresetItem(presetId, item.id)) {
                        continue;
                    }
                    let current = this.runtimeById.get(item.id);
                    if (!current) {
                        current = { assetId: item.assetId, blob: null, previewCanvas: null, texture: null };
                        this.runtimeById.set(item.id, current);
                    }
                    if (current.assetId !== item.assetId) {
                        this.destroyRuntime(current);
                        current.assetId = item.assetId;
                    }
                    current.blob = blob;
                    current.previewCanvas = decoded.canvas;
                    current.texture = this.loader.createTexture(this.scene.app.graphicsDevice, decoded.canvas, this.previewPreferNearest(item));
                    this.assets.rememberPreview(item.assetId, blob, decoded.canvas);
                } catch (error) {
                    console.error('referenceImages runtime decode failed', error);
                }
            }
        }
        if (token !== this.activePresetGeneration) {
            return;
        }
        this.updateRenderer();
        this.requestRender();
    }

    private buildAssetsById() {
        const assetsById = new Map<string, ReferenceImageAsset>();
        this.fullState.assets.forEach((asset) => {
            if (!asset?.id) {
                return;
            }
            assetsById.set(asset.id, asset);
        });
        return assetsById;
    }

    private collectAssetUsage() {
        const usage = new Map<string, number>();
        this.fullState.presets.forEach((preset) => {
            preset.items.forEach((item) => {
                usage.set(item.assetId, (usage.get(item.assetId) ?? 0) + 1);
            });
        });
        return usage;
    }

    private pruneUnusedAssets(usage: Map<string, number>) {
        const removed = new Set<string>();
        const nextAssets = this.fullState.assets.filter((asset) => {
            if ((usage.get(asset.id) ?? 0) > 0) {
                return true;
            }
            removed.add(asset.id);
            return false;
        });
        if (removed.size > 0) {
            this.fullState.assets = nextAssets;
            removed.forEach(id => this.exportWorkByAssetId.delete(id));
            this.exportWorkOrder = this.exportWorkOrder.filter(id => !removed.has(id));
        } else if (nextAssets.length !== this.fullState.assets.length) {
            this.fullState.assets = nextAssets;
        }
    }

    private releaseAsset(assetId: string) {
        if (!assetId) {
            return;
        }
        if (this.assets.releaseRef(assetId)) {
            this.fullState.assets = this.fullState.assets.filter(asset => asset.id !== assetId);
            this.exportWorkByAssetId.delete(assetId);
            this.exportWorkOrder = this.exportWorkOrder.filter(id => id !== assetId);
        }
    }

    private getActivePreset() {
        this.ensureDefaultPreset();
        return this.fullState.presets.find(preset => preset.id === this.fullState.activePresetId) ?? this.fullState.presets[0];
    }

    private buildActiveItemsFromPreset(preset: ReferenceImagePreset, assetsById: Map<string, ReferenceImageAsset>) {
        const items: ReferenceImageItemState[] = [];
        preset.items.forEach((item) => {
            const source = assetsById.get(item.assetId)?.source ?? null;
            if (!source) {
                return;
            }
            items.push({
                id: item.id,
                name: item.name,
                group: item.group,
                order: item.order,
                visible: item.visible,
                includeInRender: item.includeInRender,
                opacity: item.opacity,
                scalePct: item.scalePct,
                offsetPx: { ...item.offsetPx },
                anchor: { ...item.anchor },
                source
            });
        });
        return items;
    }

    private rebuildActiveState() {
        const preset = this.getActivePreset();
        const assetsById = this.buildAssetsById();
        const items = this.buildActiveItemsFromPreset(preset, assetsById);
        let activeId = preset.activeId;
        if (activeId && !items.some(item => item.id === activeId)) {
            activeId = items[0]?.id ?? null;
        }
        preset.activeId = activeId;
        this.state = {
            masterVisible: preset.masterVisible,
            activeId,
            items
        };
    }

    private snapshotPresetsState(): ReferenceImagesPresetsState {
        return {
            activePresetId: this.fullState.activePresetId ?? null,
            presets: this.fullState.presets.map(preset => ({ id: preset.id, name: preset.name }))
        };
    }

    private firePresetsStateChanged() {
        this.events.fire('referenceImages.presetsState', this.snapshotPresetsState());
    }

    private ensurePresets(presets: Array<{ id: string; name?: string }>) {
        if (!Array.isArray(presets) || presets.length === 0) {
            return;
        }
        this.ensureDefaultPreset();
        let changed = false;
        presets.forEach((entry) => {
            const id = typeof entry?.id === 'string' ? entry.id : '';
            if (!id) {
                return;
            }
            if (id === DEFAULT_REFERENCE_IMAGE_PRESET_ID) {
                const blank = this.fullState.presets.find(preset => preset.id === id) ?? null;
                if (!blank) {
                    this.fullState.presets.push(createDefaultPreset());
                    changed = true;
                } else if (blank.name !== DEFAULT_REFERENCE_IMAGE_PRESET_NAME) {
                    blank.name = DEFAULT_REFERENCE_IMAGE_PRESET_NAME;
                    changed = true;
                }
                return;
            }
            if (this.fullState.presets.some(preset => preset.id === id)) {
                return;
            }
            const presetName = (typeof entry?.name === 'string' && entry.name.trim()) ? entry.name.trim() : this.nextPresetName();
            this.fullState.presets.push({
                id,
                name: presetName,
                masterVisible: true,
                activeId: null,
                items: []
            });
            changed = true;
        });
        if (changed) {
            this.firePresetsStateChanged();
        }
    }

    private fireStateChanged() {
        const snapshot = this.snapshot();
        this.events.fire('referenceImages.stateChanged', snapshot);
        this.events.fire('referenceImage.stateChanged', this.snapshotSingle());
    }

    snapshotFull(): ReferenceImagesFullState {
        return JSON.parse(JSON.stringify(this.fullState));
    }

    snapshot(): ReferenceImagesState {
        return JSON.parse(JSON.stringify(this.state));
    }

    private snapshotSingle(): ReferenceImageState {
        const active = this.getActiveItem();
        if (!active) {
            return {
                enabled: false,
                visible: false,
                layer: 'front',
                opacity: 0.7,
                scalePct: 100,
                scaleK: 1,
                offsetPx: { x: 0, y: 0 },
                anchor: { ax: 0.5, ay: 0.5 },
                includeInRender: true,
                source: null,
                pixelPerfectEligible: false
            };
        }
        const offsetXInt = Math.abs(active.offsetPx.x - Math.round(active.offsetPx.x)) < 1e-3;
        const offsetYInt = Math.abs(active.offsetPx.y - Math.round(active.offsetPx.y)) < 1e-3;
        const scaleDefault = Math.abs(active.scalePct - 100) < 1e-3;
        const pixelPerfectEligible = scaleDefault && offsetXInt && offsetYInt;
        const masterVisible = this.state.masterVisible;
        return {
            enabled: masterVisible,
            visible: masterVisible && active.visible,
            layer: active.group,
            opacity: active.opacity,
            scalePct: active.scalePct,
            scaleK: active.scalePct / 100,
            offsetPx: active.offsetPx,
            anchor: active.anchor,
            includeInRender: active.includeInRender,
            source: active.source,
            pixelPerfectEligible
        };
    }

    applySnapshotFull(snapshot: ReferenceImagesFullState) {
        this.applyingHistory = true;
        try {
            this.fullState = normalizeFullState(snapshot ?? this.fullState);
            this.ensureDefaultPreset();
            this.syncPresetCounter();

            const assetUsage = this.collectAssetUsage();
            this.pruneUnusedAssets(assetUsage);
            this.assets.syncAssets(this.fullState.assets, assetUsage);

            const preset = this.getActivePreset();
            this.startActivePresetRuntimeRefresh(preset).catch((): void => undefined);

            this.rebuildActiveState();
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
            this.firePresetsStateChanged();
        } finally {
            this.applyingHistory = false;
        }
    }

    private reset() {
        this.activePresetGeneration += 1;
        this.activePresetTask = null;
        for (const runtime of this.runtimeById.values()) {
            this.destroyRuntime(runtime);
        }
        this.runtimeById.clear();
        this.assets.clear();
        this.exportWorkByAssetId.clear();
        this.exportWorkOrder = [];
        this.fullState = {
            version: 2,
            activePresetId: DEFAULT_REFERENCE_IMAGE_PRESET_ID,
            assets: [],
            presets: [createDefaultPreset()]
        };
        this.presetCounter = 0;
        this.syncPresetCounter();
        this.rebuildActiveState();
        this.updateRenderer();
        this.requestRender();
        this.fireStateChanged();
        this.firePresetsStateChanged();
    }

    private registerEvents() {
        this.events.function('referenceImages.state', () => this.snapshot());
        this.events.function('referenceImages.fullState', () => this.snapshotFull());
        this.events.function('referenceImages.presetsState', () => this.snapshotPresetsState());
        this.events.function('referenceImages.ensurePresets', (presets: Array<{ id: string; name?: string }>) => {
            this.ensurePresets(presets);
        });
        this.events.on('referenceImages.setMasterVisible', (visible: boolean) => this.setMasterVisible(visible));
        this.events.on('referenceImages.toggleMasterVisible', () => this.toggleMasterVisible());
        this.events.function('referenceImages.createPreset', (name?: string, options?: { empty?: boolean; }) => {
            return this.createPreset(name, options);
        });
        this.events.function('referenceImages.clonePreset', (presetId: string) => {
            return this.clonePreset(presetId);
        });
        this.events.on('referenceImages.renamePreset', (presetId: string, name: string) => this.renamePreset(presetId, name));
        this.events.on('referenceImages.removePreset', (presetId: string) => this.removePreset(presetId));
        this.events.function('referenceImages.setActivePreset', (presetId: string) => {
            return this.setActivePreset(presetId);
        });
        this.events.function('referenceImages.addBlob', async (blob: Blob, filename?: string, opts?: { group?: ReferenceImageItemGroup; }) => {
            return await this.addBlobsInternal([{ blob, filename }], { group: opts?.group }, true).then(ids => ids[0] ?? null);
        });
        this.events.function('referenceImages.addBlobs', async (files: Array<{ blob: Blob; filename?: string }>, opts?: { group?: ReferenceImageItemGroup; }) => {
            return await this.addBlobsInternal(files, { group: opts?.group }, true);
        });
        this.events.function('referenceImages.importPsd', async (blob: Blob, filename?: string, opts?: { group?: ReferenceImageItemGroup; }) => {
            return await this.importPsd(blob, filename, opts);
        });
        this.events.on('referenceImages.remove', (id: string) => this.remove(id));
        this.events.on('referenceImages.clearAll', () => this.clearAllWithHistory());
        this.events.on('referenceImages.setActive', (id: string | null) => this.setActive(id));
        this.events.on('referenceImages.update', (id: string, patch: ReferenceImageItemPatch) => this.update(id, patch));
        this.events.on('referenceImages.updateMany', (payload: ReferenceImagesUpdateManyPayload) => this.updateMany(payload));
        this.events.on('referenceImages.center', (id: string) => this.center(id));
        this.events.on('referenceImages.reorder', (payload: { id: string; group: ReferenceImageItemGroup; toIndex: number; }) => this.reorder(payload));
        this.events.on('referenceImages.historyBegin', (label: string) => this.historyBegin(label));
        this.events.on('referenceImages.historyCommit', (label?: string) => this.historyCommit(label));

        this.events.function('referenceImages.renderExportLayers', async (width: number, height: number, options?: { applyOpacity?: boolean; }) => {
            return await this.renderExportLayers(width, height, options);
        });

        this.events.function('docSerialize.referenceImages', () => this.serializeDoc());
        this.events.function('docDeserialize.referenceImages', async (docState: any, blobs: Map<string, Blob>) => {
            return await this.deserializeDoc(docState, blobs);
        });
        this.events.function('referenceImages.docAssets', () => this.docAssets());

        // legacy wrappers (single active item)
        this.events.function('referenceImage.state', () => this.snapshotSingle());
        this.events.on('referenceImage.setEnabled', (value: boolean) => this.legacySetEnabled(value));
        this.events.on('referenceImage.setVisible', (value: boolean) => this.legacySetVisible(value));
        this.events.on('referenceImage.setLayer', (layer: ReferenceImageItemGroup) => this.legacyUpdate({ group: layer }));
        this.events.on('referenceImage.setOpacity', (opacity: number) => this.legacyUpdate({ opacity }));
        this.events.on('referenceImage.setScale', (pct: number) => this.legacyUpdate({ scalePct: pct }));
        this.events.on('referenceImage.setOffset', (offset: { x?: number; y?: number }) => this.legacyUpdateOffset(offset));
        this.events.on('referenceImage.center', () => {
            const activeId = this.state.activeId;
            if (activeId) {
                this.center(activeId);
            }
        });
        this.events.on('referenceImage.setAnchor', (anchor: { ax: number; ay: number }) => this.legacyUpdate({ anchor }));
        this.events.on('referenceImage.setIncludeInRender', (value: boolean) => this.legacyUpdate({ includeInRender: value }));
        this.events.on('referenceImage.historyBegin', (label: string) => this.historyBegin(label));
        this.events.on('referenceImage.historyCommit', (label?: string) => this.historyCommit(label));
        this.events.on('referenceImage.clear', () => this.legacyClear());
        this.events.function('referenceImage.loadBlob', async (blob: Blob, filename?: string) => {
            try {
                const ids = await this.addBlobsInternal([{ blob, filename }], {}, true);
                return ids.length > 0;
            } catch (error) {
                console.error('referenceImage.loadBlob failed', error);
                const message = (error as Error)?.message ?? `${error}`;
                await this.events.invoke('showPopup', {
                    type: 'error',
                    header: 'Reference Images',
                    message: `'${message}'`
                });
                return false;
            }
        });
        this.events.function('referenceImage.renderExportLayer', async (width: number, height: number, options?: { applyOpacity?: boolean; }) => {
            const activeId = this.state.activeId;
            if (!activeId) {
                return null;
            }
            const layer = await this.renderExportLayerForId(activeId, width, height, options);
            return layer?.canvas ?? null;
        });
        this.events.function('referenceImage.docAsset', () => {
            const active = this.getActiveItem();
            if (!active) {
                return null;
            }
            const runtime = this.runtimeById.get(active.id);
            if (!runtime?.blob) {
                return null;
            }
            return {
                blob: runtime.blob,
                filename: active.source?.filename
            };
        });
        this.events.function('docSerialize.referenceImage', () => this.serializeLegacyDoc());
        this.events.function('docDeserialize.referenceImage', async (docState: any, blob?: Blob | null) => {
            return await this.deserializeLegacyDoc(docState, blob ?? null);
        });
    }

    private getActiveItem() {
        const activeId = this.state.activeId;
        if (!activeId) {
            return null;
        }
        return this.state.items.find(i => i.id === activeId) ?? null;
    }

    private getAssetIdForActiveItem(id: string) {
        const preset = this.getActivePreset();
        return preset.items.find(item => item.id === id)?.assetId ?? null;
    }

    private legacyClear() {
        const activeId = this.state.activeId;
        if (!activeId) {
            return;
        }
        this.remove(activeId);
    }

    private legacySetEnabled(value: boolean) {
        const next = !!value;
        const preset = this.getActivePreset();
        if (next === preset.masterVisible) {
            return;
        }
        this.historyRecord('referenceImage.enabled', () => {
            preset.masterVisible = next;
            this.state.masterVisible = next;
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private legacySetVisible(value: boolean) {
        const active = this.getActiveItem();
        if (!active) {
            return;
        }
        const preset = this.getActivePreset();
        const fullItem = preset.items.find(item => item.id === active.id);
        if (!fullItem) {
            return;
        }
        const next = !!value;
        this.historyRecord('referenceImage.visible', () => {
            fullItem.visible = next;
            active.visible = next;
            if (next && !preset.masterVisible) {
                preset.masterVisible = true;
                this.state.masterVisible = true;
            }
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private legacyUpdate(patch: ReferenceImageItemPatch) {
        const activeId = this.state.activeId;
        if (!activeId) {
            return;
        }
        this.update(activeId, patch);
    }

    private legacyUpdateOffset(offset: { x?: number; y?: number }) {
        const active = this.getActiveItem();
        if (!active) {
            return;
        }
        const nextOffset = {
            x: isFiniteNumber(offset?.x) ? offset.x : active.offsetPx.x,
            y: isFiniteNumber(offset?.y) ? offset.y : active.offsetPx.y
        };
        this.update(active.id, { offsetPx: nextOffset } as any);
    }

    private setMasterVisible(value: boolean) {
        const next = !!value;
        const preset = this.getActivePreset();
        if (next === preset.masterVisible) {
            return;
        }
        this.historyRecord('referenceImages.masterVisible', () => {
            preset.masterVisible = next;
            this.state.masterVisible = next;
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private toggleMasterVisible() {
        this.setMasterVisible(!this.state.masterVisible);
    }

    private clonePresetItems(preset: ReferenceImagePreset) {
        const idMap = new Map<string, string>();
        const items = preset.items.map((item) => {
            const nextId = createId();
            idMap.set(item.id, nextId);
            return {
                ...item,
                id: nextId,
                offsetPx: { ...item.offsetPx },
                anchor: { ...item.anchor }
            };
        });
        const activeId = preset.activeId ? (idMap.get(preset.activeId) ?? null) : null;
        return { items, activeId, idMap };
    }

    private cloneRuntimeForPresetItems(preset: ReferenceImagePreset, idMap: Map<string, string>) {
        idMap.forEach((nextId, originalId) => {
            const runtime = this.runtimeById.get(originalId) ?? null;
            const originalItem = preset.items.find(item => item.id === originalId);
            if (!originalItem) {
                return;
            }
            const cached = this.assets.restorePreview(originalItem.assetId);
            const blob = runtime?.blob ?? cached?.blob ?? this.assets.getBlob(originalItem.assetId) ?? null;
            const previewCanvas = runtime?.previewCanvas ?? cached?.previewCanvas ?? null;
            if (!blob || !previewCanvas) {
                return;
            }
            const texture = this.loader.createTexture(
                this.scene.app.graphicsDevice,
                previewCanvas,
                this.previewPreferNearest(originalItem)
            );
            this.runtimeById.set(nextId, { assetId: originalItem.assetId, blob, previewCanvas, texture });
            this.assets.rememberPreview(originalItem.assetId, blob, previewCanvas);
        });
    }

    private createPreset(name?: string, options?: { empty?: boolean; }) {
        let createdId: string | null = null;
        this.historyRecord('referenceImages.createPreset', () => {
            const sourcePreset = this.getActivePreset();
            const presetName = typeof name === 'string' && name.trim() ? name.trim() : this.nextPresetName();
            const copyItems = options?.empty !== true;
            let items: ReferenceImageItemV2[] = [];
            let activeId: string | null = null;
            let idMap: Map<string, string> | null = null;
            if (copyItems) {
                const cloned = this.clonePresetItems(sourcePreset);
                items = cloned.items;
                activeId = cloned.activeId;
                idMap = cloned.idMap;
            }
            const presetId = createPresetId();
            const preset: ReferenceImagePreset = {
                id: presetId,
                name: presetName,
                masterVisible: copyItems ? sourcePreset.masterVisible : true,
                activeId,
                baseRenderBox: (copyItems && sourcePreset.baseRenderBox) ? { ...sourcePreset.baseRenderBox } : undefined,
                items
            };
            this.fullState.presets.push(preset);
            this.fullState.activePresetId = presetId;
            if (items.length > 0) {
                const assetsById = this.buildAssetsById();
                items.forEach((item) => {
                    this.assets.addRef(item.assetId, assetsById.get(item.assetId)?.source);
                });
            }
            if (idMap) {
                this.cloneRuntimeForPresetItems(sourcePreset, idMap);
            }
            this.rebuildActiveState();
            this.startActivePresetRuntimeRefresh(preset).catch((): void => undefined);
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
            this.firePresetsStateChanged();
            createdId = presetId;
        });
        return createdId;
    }

    private clonePreset(presetId: string) {
        let createdId: string | null = null;
        this.historyRecord('referenceImages.clonePreset', () => {
            const sourcePreset = this.fullState.presets.find(preset => preset.id === presetId);
            if (!sourcePreset) {
                return;
            }
            const presetName = (sourcePreset.name ?? '').trim() || this.nextPresetName();
            const cloned = this.clonePresetItems(sourcePreset);
            const presetIdNext = createPresetId();
            const preset: ReferenceImagePreset = {
                id: presetIdNext,
                name: presetName,
                masterVisible: sourcePreset.masterVisible,
                activeId: cloned.activeId,
                baseRenderBox: sourcePreset.baseRenderBox ? { ...sourcePreset.baseRenderBox } : undefined,
                items: cloned.items
            };
            this.fullState.presets.push(preset);
            this.fullState.activePresetId = presetIdNext;
            if (preset.items.length > 0) {
                const assetsById = this.buildAssetsById();
                preset.items.forEach((item) => {
                    this.assets.addRef(item.assetId, assetsById.get(item.assetId)?.source);
                });
            }
            this.cloneRuntimeForPresetItems(sourcePreset, cloned.idMap);
            this.rebuildActiveState();
            this.startActivePresetRuntimeRefresh(preset).catch((): void => undefined);
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
            this.firePresetsStateChanged();
            createdId = presetIdNext;
        });
        return createdId;
    }

    private renamePreset(presetId: string, name: string) {
        this.historyRecord('referenceImages.renamePreset', () => {
            if (presetId === DEFAULT_REFERENCE_IMAGE_PRESET_ID) {
                return;
            }
            const preset = this.fullState.presets.find(item => item.id === presetId);
            if (!preset) {
                return;
            }
            const trimmed = (name ?? '').trim();
            if (!trimmed || trimmed === preset.name) {
                return;
            }
            preset.name = trimmed;
            this.firePresetsStateChanged();
        });
    }

    private removePreset(presetId: string) {
        if (!presetId) {
            return;
        }
        if (presetId === DEFAULT_REFERENCE_IMAGE_PRESET_ID) {
            return;
        }
        this.historyRecord('referenceImages.removePreset', () => {
            const index = this.fullState.presets.findIndex(preset => preset.id === presetId);
            if (index < 0) {
                return;
            }
            const [removedPreset] = this.fullState.presets.splice(index, 1);
            removedPreset.items.forEach((item) => {
                const runtime = this.runtimeById.get(item.id);
                if (runtime) {
                    this.assets.rememberPreview(item.assetId, runtime.blob, runtime.previewCanvas);
                    this.destroyRuntime(runtime);
                    this.runtimeById.delete(item.id);
                }
                this.releaseAsset(item.assetId);
            });
            if (this.fullState.presets.length === 0) {
                const fallbackPreset = createDefaultPreset();
                this.fullState.presets = [fallbackPreset];
                this.fullState.activePresetId = fallbackPreset.id;
            } else if (this.fullState.activePresetId === presetId) {
                this.fullState.activePresetId = this.fullState.presets[0].id;
            }
            this.rebuildActiveState();
            this.startActivePresetRuntimeRefresh(this.getActivePreset()).catch((): void => undefined);
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
            this.firePresetsStateChanged();
        });
    }

    private async setActivePreset(presetId: string | null) {
        this.ensureDefaultPreset();
        const nextId = (typeof presetId === 'string' && this.fullState.presets.some(preset => preset.id === presetId)) ?
            presetId :
            null;
        if (!nextId) {
            return;
        }
        if (nextId === this.fullState.activePresetId) {
            if (this.activePresetTask) {
                await this.activePresetTask;
            }
            return;
        }
        this.fullState.activePresetId = nextId;
        const preset = this.getActivePreset();
        this.rebuildActiveState();
        const runtimeTask = this.startActivePresetRuntimeRefresh(preset);
        this.updateRenderer();
        this.requestRender();
        this.fireStateChanged();
        this.firePresetsStateChanged();
        await runtimeTask;
    }

    private previewPreferNearest(item: ReferenceImageItemBase) {
        return Math.abs(item.scalePct - 100) < 1e-3;
    }

    private restoreRuntimeFromCache(
        assetId: string,
        runtime: ReferenceImageItemRuntime,
        item: ReferenceImageItemBase
    ) {
        const cached = this.assets.restorePreview(assetId);
        const blob = runtime.blob ?? cached?.blob ?? this.assets.getBlob(assetId) ?? null;
        const previewCanvas = runtime.previewCanvas ?? cached?.previewCanvas ?? null;
        if (blob) {
            runtime.blob = blob;
        }
        if (previewCanvas) {
            runtime.previewCanvas = previewCanvas;
        }
        if (!runtime.texture && runtime.previewCanvas) {
            runtime.texture = this.loader.createTexture(this.scene.app.graphicsDevice, runtime.previewCanvas, this.previewPreferNearest(item));
        }
    }

    private destroyRuntime(runtime: ReferenceImageItemRuntime) {
        if (runtime.texture) {
            runtime.texture.destroy();
        }
        runtime.texture = null;
        runtime.blob = null;
        runtime.previewCanvas = null;
    }

    private getViewportMapping(): ViewportMapping | null {
        const mapping = this.events.invoke('cameraFrames.viewportMapping') as any;
        if (!mapping || !mapping.rectPxRaw) {
            return null;
        }
        return {
            logicalW: mapping.logicalW,
            logicalH: mapping.logicalH,
            rectPxRaw: mapping.rectPxRaw,
            rectNormRaw: mapping.rectNormRaw
        };
    }

    private computeMappingViewportSize(mapping: ViewportMapping | null) {
        const rectPxRaw = mapping?.rectPxRaw;
        const rectNormRaw = mapping?.rectNormRaw;
        if (!rectPxRaw || !rectNormRaw) {
            return null;
        }
        const vw = rectNormRaw.w !== 0 ? (rectPxRaw.w / rectNormRaw.w) : null;
        const vh = rectNormRaw.h !== 0 ? (rectPxRaw.h / rectNormRaw.h) : null;
        if (typeof vw !== 'number' || typeof vh !== 'number' || !isFinite(vw) || !isFinite(vh) || vw <= 0 || vh <= 0) {
            return null;
        }
        return { vw, vh };
    }

    private getRenderTargetSize() {
        const rt = this.scene.camera.entity.camera.renderTarget;
        if (rt && rt.width > 0 && rt.height > 0) {
            return { w: rt.width, h: rt.height };
        }
        const device = this.scene.app.graphicsDevice;
        return { w: device.width, h: device.height };
    }

    private computeRect(item: ReferenceImageItemState, runtime: ReferenceImageItemRuntime, mapping: ViewportMapping | null) {
        if (!mapping || !runtime.texture || !this.state.masterVisible || !item.visible) {
            return null;
        }
        const viewScale = mapping.logicalW > 0 ? mapping.rectPxRaw.w / mapping.logicalW : 0;
        if (!isFinite(viewScale) || viewScale <= 0) {
            return null;
        }
        const anchor = item.anchor;
        const logicalAnchorX = mapping.logicalW * anchor.ax;
        const logicalAnchorY = mapping.logicalH * anchor.ay;
        const scaleK = item.scalePct / 100;
        const imgW = item.source.appliedSize.w * scaleK;
        const imgH = item.source.appliedSize.h * scaleK;
        const topLeftX = logicalAnchorX - anchor.ax * imgW - item.offsetPx.x;
        const topLeftY = logicalAnchorY - anchor.ay * imgH - item.offsetPx.y;
        const rect = {
            x: mapping.rectPxRaw.x + topLeftX * viewScale,
            y: mapping.rectPxRaw.y + topLeftY * viewScale,
            w: imgW * viewScale,
            h: imgH * viewScale
        };
        const viewport = this.computeMappingViewportSize(mapping);
        const rtSize = this.getRenderTargetSize();
        if (!viewport) {
            return rect;
        }
        const sx = viewport.vw > 0 ? (rtSize.w / viewport.vw) : 1;
        const sy = viewport.vh > 0 ? (rtSize.h / viewport.vh) : 1;
        return {
            x: rect.x * sx,
            y: rect.y * sy,
            w: rect.w * sx,
            h: rect.h * sy
        };
    }

    private updateRenderer() {
        if (this.scene.camera.suppressFinalBlit && !this.scene.renderFlags.offscreenIncludeReferenceImage) {
            this.renderer.clearParams();
            return;
        }
        if (!this.state.masterVisible) {
            this.renderer.clearParams();
            return;
        }
        const mapping = this.getViewportMapping();
        const backParams: RenderParams[] = [];
        const frontParams: RenderParams[] = [];
        const sorted = [...this.state.items].sort((a, b) => {
            const groupOrder = (a.group === b.group) ? 0 : (a.group === 'back' ? -1 : 1);
            if (groupOrder !== 0) return groupOrder;
            return (a.order - b.order) || a.id.localeCompare(b.id);
        });
        sorted.forEach((item) => {
            const runtime = this.runtimeById.get(item.id);
            if (!runtime?.texture) {
                return;
            }
            const rect = this.computeRect(item, runtime, mapping);
            if (!rect) {
                return;
            }
            const params = {
                rectPx: rect,
                opacity: clamp(item.opacity, 0, 1),
                texture: runtime.texture,
                pixelPerfect: this.previewPreferNearest(item)
            };
            if (item.group === 'back') {
                backParams.push(params);
            } else {
                frontParams.push(params);
            }
        });

        this.renderer.setParamsList('back', backParams);
        this.renderer.setParamsList('front', frontParams);
    }

    private async decodeForAdd(blob: Blob, filename?: string) {
        const normalizedFilename = normalizeReferenceImageFilename(filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
        const device = this.scene.app.graphicsDevice;
        const deviceMaxTextureSize = (typeof device.maxTextureSize === 'number' && isFinite(device.maxTextureSize) && device.maxTextureSize > 0) ?
            device.maxTextureSize :
            4096;
        const maxPreviewDim = Math.max(1, Math.min(4096, deviceMaxTextureSize));
        const decoded = await this.loader.decode(blob, normalizedFilename, maxPreviewDim);
        return decoded;
    }

    private captureAddContext(): AddContext {
        this.ensureDefaultPreset();
        const presetId = this.fullState.activePresetId ?? null;
        let cameraPresetId: string | null = null;
        let cameraName = '';
        if (this.events.functions.has('cameraFrames.presetsState')) {
            const state = this.events.invoke('cameraFrames.presetsState') as {
                selectedPresetId?: string | null;
                presets?: Array<{ id: string; name: string; }>;
            } | null;
            cameraPresetId = (typeof state?.selectedPresetId === 'string' && state.selectedPresetId) ? state.selectedPresetId : null;
            const preset = cameraPresetId && Array.isArray(state?.presets) ?
                state.presets.find(entry => entry.id === cameraPresetId) :
                null;
            if (typeof preset?.name === 'string') {
                cameraName = preset.name.trim();
            }
        }
        return { presetId, cameraPresetId, cameraName };
    }

    private ensureWritablePresetForAdd(context?: AddContext) {
        this.ensureDefaultPreset();
        const targetPresetId = (typeof context?.presetId === 'string' && context.presetId) ? context.presetId : this.fullState.activePresetId;
        let preset = this.fullState.presets.find(entry => entry.id === targetPresetId) ?? null;
        if (!preset) {
            preset = this.getActivePreset();
        }

        if (preset.id !== DEFAULT_REFERENCE_IMAGE_PRESET_ID) {
            if (this.fullState.activePresetId !== preset.id) {
                this.fullState.activePresetId = preset.id;
                this.rebuildActiveState();
                this.firePresetsStateChanged();
                this.startActivePresetRuntimeRefresh(preset).catch((): void => undefined);
            }
            return preset;
        }

        const rawCameraName = (context?.cameraName ?? '').trim();
        const rawPresetNameHint = (context?.presetNameHint ?? '').trim();
        // Prefer the first imported filename so the preset name matches what the user added.
        const baseName = rawPresetNameHint || rawCameraName || this.nextPresetName();
        const presetName = baseName;
        const nextPreset: ReferenceImagePreset = {
            id: createPresetId(),
            name: presetName,
            masterVisible: true,
            activeId: null,
            items: []
        };
        this.fullState.presets.push(nextPreset);
        this.fullState.activePresetId = nextPreset.id;
        this.rebuildActiveState();
        this.firePresetsStateChanged();
        if (context?.cameraPresetId) {
            this.events.fire('cameraFrames.setPresetReferenceImage', context.cameraPresetId, nextPreset.id);
        }
        this.startActivePresetRuntimeRefresh(nextPreset).catch((): void => undefined);
        return nextPreset;
    }

    private applyPendingAdds(pending: PendingAdd[], recordHistory: boolean, label: string, context?: AddContext) {
        if (pending.length === 0) {
            return [];
        }

        const apply = () => {
            const preset = this.ensureWritablePresetForAdd(context);
            const nextOrderByGroup = {
                back: preset.items.filter(i => i.group === 'back').length,
                front: preset.items.filter(i => i.group === 'front').length
            };

            pending.forEach((entry) => {
                const order = entry.group === 'back' ? nextOrderByGroup.back++ : nextOrderByGroup.front++;
                if (entry.assetIsNew || !this.fullState.assets.some(asset => asset.id === entry.assetId)) {
                    this.fullState.assets.push({
                        id: entry.assetId,
                        source: entry.assetSource
                    });
                }
                this.assets.addRef(entry.assetId, entry.assetSource);
                const fullItem: ReferenceImageItemV2 = {
                    id: entry.id,
                    name: entry.name,
                    group: entry.group,
                    order,
                    visible: entry.visible,
                    includeInRender: entry.includeInRender,
                    opacity: entry.opacity,
                    scalePct: entry.scalePct,
                    offsetPx: { ...entry.offsetPx },
                    anchor: { ...entry.anchor },
                    assetId: entry.assetId
                };
                const item: ReferenceImageItemState = {
                    id: entry.id,
                    name: entry.name,
                    group: entry.group,
                    order,
                    visible: entry.visible,
                    includeInRender: entry.includeInRender,
                    opacity: entry.opacity,
                    scalePct: entry.scalePct,
                    offsetPx: { ...entry.offsetPx },
                    anchor: { ...entry.anchor },
                    source: entry.assetSource
                };
                const texture = this.loader.createTexture(this.scene.app.graphicsDevice, entry.decoded.canvas, this.previewPreferNearest(item));
                this.runtimeById.set(entry.id, {
                    assetId: entry.assetId,
                    texture,
                    blob: entry.assetBlob,
                    previewCanvas: entry.decoded.canvas
                });
                this.assets.rememberPreview(entry.assetId, entry.assetBlob, entry.decoded.canvas);
                preset.items.push(fullItem);
                this.state.items.push(item);
                preset.activeId = entry.id;
                this.state.activeId = entry.id;
            });
            normalizeOrders(preset.items);
            normalizeOrders(this.state.items);
            if (!preset.masterVisible) {
                preset.masterVisible = true;
                this.state.masterVisible = true;
            }
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        };

        if (recordHistory) {
            this.historyRecord(label, apply);
        } else {
            apply();
        }

        return pending.map(entry => entry.id);
    }

    private async addBlobsInternal(files: Array<{ blob: Blob; filename?: string }>, opts?: { group?: ReferenceImageItemGroup; }, recordHistory = true) {
        const addContext = this.captureAddContext();
        const pending: PendingAdd[] = [];
        const fallbackGroup = normalizeGroup(opts?.group, 'front');
        for (const file of (files ?? [])) {
            if (!(file?.blob instanceof Blob)) {
                continue;
            }
            const id = createId();
            const decoded = await this.decodeForAdd(file.blob, file.filename);
            const assetInfo = await this.assets.register(decoded);
            pending.push({
                id,
                decoded,
                assetId: assetInfo.assetId,
                assetSource: assetInfo.source,
                assetBlob: assetInfo.blob,
                assetIsNew: assetInfo.isNew,
                group: fallbackGroup,
                name: decoded.source.filename ?? normalizeReferenceImageFilename(file.filename),
                visible: true,
                includeInRender: true,
                opacity: 0.7,
                scalePct: 100,
                offsetPx: { x: 0, y: 0 },
                anchor: { ax: 0.5, ay: 0.5 }
            });
        }
        if (pending[0]?.name && !addContext.presetNameHint) {
            addContext.presetNameHint = pending[0].name;
        }
        return this.applyPendingAdds(pending, recordHistory, 'referenceImages.add', addContext);
    }

    private remove(id: string) {
        if (typeof id !== 'string' || !id) {
            return;
        }
        const preset = this.getActivePreset();
        const index = preset.items.findIndex(i => i.id === id);
        if (index < 0) {
            return;
        }
        const fullItem = preset.items[index];
        const assetId = fullItem?.assetId ?? '';
        this.historyRecord('referenceImages.remove', () => {
            const removedStateIndex = this.state.items.findIndex(item => item.id === id);
            const runtime = this.runtimeById.get(id) ?? null;
            if (runtime) {
                this.assets.rememberPreview(assetId, runtime.blob, runtime.previewCanvas);
                this.destroyRuntime(runtime);
                this.runtimeById.delete(id);
            }
            preset.items.splice(index, 1);
            if (removedStateIndex >= 0) {
                this.state.items.splice(removedStateIndex, 1);
            }
            normalizeOrders(preset.items);
            normalizeOrders(this.state.items);
            if (preset.activeId === id) {
                preset.activeId = preset.items[0]?.id ?? null;
                this.state.activeId = preset.activeId;
            }
            this.releaseAsset(assetId);
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private clearAllInternal() {
        const preset = this.getActivePreset();
        preset.items.forEach((item) => {
            const runtime = this.runtimeById.get(item.id);
            if (runtime) {
                this.assets.rememberPreview(item.assetId, runtime.blob, runtime.previewCanvas);
                this.destroyRuntime(runtime);
                this.runtimeById.delete(item.id);
            }
            this.releaseAsset(item.assetId);
        });
        preset.items = [];
        preset.activeId = null;
        this.state = {
            ...DEFAULT_REFERENCE_IMAGES_STATE,
            masterVisible: preset.masterVisible,
            activeId: null,
            items: []
        };
        this.renderer.clearParams();
        this.updateRenderer();
        this.requestRender();
    }

    private clearAllWithHistory() {
        if (this.state.items.length === 0) {
            return;
        }
        this.historyRecord('referenceImages.clearAll', () => {
            this.clearAllInternal();
            this.fireStateChanged();
        });
    }

    private setActive(id: string | null) {
        const next = typeof id === 'string' ? id : null;
        if (next === this.state.activeId) {
            return;
        }
        const preset = this.getActivePreset();
        if (next && !preset.items.some(i => i.id === next)) {
            return;
        }
        preset.activeId = next;
        this.state.activeId = next;
        this.fireStateChanged();
    }

    private applyPatchToItem(item: ReferenceImageItemBase, patch: ReferenceImageItemPatch, items: ReferenceImageItemBase[]) {
        let groupChanged = false;
        if (typeof patch.name === 'string' && patch.name.trim()) {
            item.name = patch.name.trim();
        }
        if (typeof (patch as any).visible === 'boolean') {
            item.visible = patch.visible as any;
        }
        if (typeof (patch as any).includeInRender === 'boolean') {
            item.includeInRender = patch.includeInRender as any;
        }
        if (typeof (patch as any).opacity === 'number') {
            item.opacity = clamp(patch.opacity as any, 0, 1);
        }
        if (typeof (patch as any).scalePct === 'number') {
            item.scalePct = clamp(patch.scalePct as any, 1, 400);
        }
        if ((patch as any).offsetPx && typeof (patch as any).offsetPx === 'object') {
            item.offsetPx = normalizeOffset((patch as any).offsetPx, item.offsetPx);
        }
        if ((patch as any).anchor && typeof (patch as any).anchor === 'object') {
            item.anchor = normalizeAnchor((patch as any).anchor, item.anchor);
        }
        if (typeof (patch as any).group === 'string' && isReferenceImageGroup((patch as any).group)) {
            const nextGroup = patch.group as any;
            if (nextGroup !== item.group) {
                groupChanged = true;
                item.group = nextGroup;
                item.order = items.filter(i => i.group === nextGroup && i.id !== item.id).length;
            }
        }
        return groupChanged;
    }

    private updateMany(payload: ReferenceImagesUpdateManyPayload) {
        let updates: Array<{ id: string; patch: ReferenceImageItemPatch; }> = [];
        if (Array.isArray(payload?.updates)) {
            updates = payload.updates;
        } else if (Array.isArray(payload?.ids)) {
            updates = payload.ids.map(id => ({ id, patch: payload?.patch ?? {} }));
        }
        if (updates.length === 0) {
            return;
        }
        const preset = this.getActivePreset();
        const itemsById = new Map(this.state.items.map(item => [item.id, item]));
        const fullItemsById = new Map(preset.items.map(item => [item.id, item]));
        this.historyRecord('referenceImages.update', () => {
            let groupChanged = false;
            updates.forEach((update) => {
                if (!update?.id || !update.patch) {
                    return;
                }
                const fullItem = fullItemsById.get(update.id);
                if (!fullItem) {
                    return;
                }
                if (this.applyPatchToItem(fullItem, update.patch, preset.items)) {
                    groupChanged = true;
                }
                const item = itemsById.get(update.id);
                if (item && this.applyPatchToItem(item, update.patch, this.state.items)) {
                    groupChanged = true;
                }
                if (Object.prototype.hasOwnProperty.call(update.patch, 'visible') && update.patch.visible === true) {
                    preset.masterVisible = true;
                    this.state.masterVisible = true;
                }
            });
            if (groupChanged) {
                normalizeOrders(preset.items);
                normalizeOrders(this.state.items);
            }
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private update(id: string, patch: ReferenceImageItemPatch) {
        if (typeof id !== 'string' || !id || !patch) {
            return;
        }
        this.updateMany({ updates: [{ id, patch }] });
    }

    private center(id: string) {
        const item = this.state.items.find(i => i.id === id);
        if (!item) {
            return;
        }
        this.update(id, { offsetPx: { x: 0, y: 0 }, anchor: { ax: 0.5, ay: 0.5 } } as any);
    }

    private reorder(payload: { id: string; group: ReferenceImageItemGroup; toIndex: number; }) {
        const id = payload?.id;
        if (typeof id !== 'string' || !id) {
            return;
        }
        const preset = this.getActivePreset();
        const item = preset.items.find(i => i.id === id);
        if (!item) {
            return;
        }
        const toGroup = normalizeGroup(payload?.group, item.group);
        const toIndex = isFiniteNumber(payload?.toIndex) ? Math.max(0, Math.floor(payload.toIndex)) : 0;

        this.historyRecord('referenceImages.reorder', () => {
            const applyReorder = (items: ReferenceImageItemBase[]) => {
                const target = items.find(i => i.id === id);
                if (!target) {
                    return;
                }
                target.group = toGroup;
                const groupItems = items
                .filter(i => i.group === toGroup && i.id !== id)
                .sort((a, b) => a.order - b.order);
                const clampedIndex = Math.max(0, Math.min(groupItems.length, toIndex));
                groupItems.splice(clampedIndex, 0, target);
                groupItems.forEach((i, idx) => {
                    i.order = idx;
                });
                const otherGroup: ReferenceImageItemGroup = toGroup === 'back' ? 'front' : 'back';
                const otherItems = items.filter(i => i.group === otherGroup).sort((a, b) => a.order - b.order);
                otherItems.forEach((i, idx) => {
                    i.order = idx;
                });
            };
            applyReorder(preset.items);
            applyReorder(this.state.items);
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
        });
    }

    private trimExportCanvas(options: { outW: number; outH: number; x0: number; y0: number; w: number; h: number; }) {
        const left = clamp(Math.floor(options.x0), 0, options.outW);
        const top = clamp(Math.floor(options.y0), 0, options.outH);
        const right = clamp(Math.ceil(options.x0 + options.w), 0, options.outW);
        const bottom = clamp(Math.ceil(options.y0 + options.h), 0, options.outH);
        if (right <= left || bottom <= top) {
            return null;
        }
        return { left, top, right, bottom };
    }

    private async getExportWorkCanvas(assetId: string, source: ReferenceImageSourceMeta, blob: Blob) {
        if (!assetId) {
            return null;
        }
        const existing = this.exportWorkByAssetId.get(assetId);
        if (existing?.canvas) {
            return existing.canvas;
        }
        if (existing?.promise) {
            return await existing.promise;
        }
        const entry: ExportWorkEntry = { canvas: null, promise: null };
        const promise = this.loader.decode(blob, source.filename).then(decoded => decoded.canvas);
        entry.promise = promise;
        this.exportWorkByAssetId.set(assetId, entry);
        this.exportWorkOrder = this.exportWorkOrder.filter(k => k !== assetId);
        this.exportWorkOrder.push(assetId);
        const MAX_CACHE = 3;
        while (this.exportWorkOrder.length > MAX_CACHE) {
            const drop = this.exportWorkOrder.shift();
            if (drop) {
                this.exportWorkByAssetId.delete(drop);
            }
        }
        try {
            const canvas = await promise;
            entry.canvas = canvas;
            entry.promise = null;
            return canvas;
        } catch (error) {
            this.exportWorkByAssetId.delete(assetId);
            this.exportWorkOrder = this.exportWorkOrder.filter(k => k !== assetId);
            throw error;
        } finally {
            if (entry.promise === promise) {
                entry.promise = null;
            }
        }
    }

    private async renderExportLayerForId(id: string, width: number, height: number, options?: { applyOpacity?: boolean; }): Promise<ReferenceImagesExportLayer | null> {
        const item = this.state.items.find(i => i.id === id);
        if (!item || !item.includeInRender) {
            return null;
        }
        const runtime = this.runtimeById.get(id);
        const assetId = this.getAssetIdForActiveItem(id) ?? runtime?.assetId ?? '';
        const blob = runtime?.blob ?? (assetId ? this.assets.getBlob(assetId) : null);
        const source = item.source;
        if (!blob || !source || !assetId) {
            return null;
        }
        const image = await this.getExportWorkCanvas(assetId, source, blob);
        if (!image) {
            return null;
        }
        const outW = Math.max(1, Math.round(width));
        const outH = Math.max(1, Math.round(height));
        const applyOpacity = options?.applyOpacity !== false;
        const opacity = clamp(item.opacity, 0, 1);
        if (applyOpacity && opacity <= 0) {
            return null;
        }

        const anchor = item.anchor;
        const scaleK = item.scalePct / 100;
        const imgW = source.appliedSize.w * scaleK;
        const imgH = source.appliedSize.h * scaleK;
        let x0 = outW * anchor.ax - anchor.ax * imgW - item.offsetPx.x;
        let y0 = outH * anchor.ay - anchor.ay * imgH - item.offsetPx.y;
        let drawW = imgW;
        let drawH = imgH;

        const scaleDefault = Math.abs(item.scalePct - 100) < 1e-3;
        if (scaleDefault) {
            x0 = Math.round(x0);
            y0 = Math.round(y0);
            drawW = source.appliedSize.w;
            drawH = source.appliedSize.h;
        }

        const bounds = this.trimExportCanvas({ outW, outH, x0, y0, w: drawW, h: drawH });
        if (!bounds) {
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = bounds.right - bounds.left;
        canvas.height = bounds.bottom - bounds.top;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for reference image export');
        }

        if (applyOpacity) {
            ctx.globalAlpha = opacity;
        }

        if (scaleDefault) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(image, x0 - bounds.left, y0 - bounds.top);
        } else {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(image, x0 - bounds.left, y0 - bounds.top, imgW, imgH);
        }

        return {
            group: item.group,
            name: item.name ?? item.source.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME,
            opacity,
            canvas,
            bounds
        };
    }

    private async renderExportLayers(width: number, height: number, options?: { applyOpacity?: boolean; }): Promise<ReferenceImagesExportLayer[]> {
        const layers: ReferenceImagesExportLayer[] = [];
        const candidates = [...this.state.items]
        .filter(i => i.includeInRender)
        .sort((a, b) => {
            const groupOrder = (a.group === b.group) ? 0 : (a.group === 'back' ? -1 : 1);
            if (groupOrder !== 0) return groupOrder;
            return (a.order - b.order) || a.id.localeCompare(b.id);
        });

        for (const item of candidates) {
            const layer = await this.renderExportLayerForId(item.id, width, height, options);
            if (layer) {
                layers.push(layer);
            }
        }
        return layers;
    }

    private serializeLegacyDoc(): ReferenceImageState | null {
        const active = this.getActiveItem();
        if (!active) {
            return null;
        }
        const runtime = this.runtimeById.get(active.id);
        if (!runtime?.blob) {
            return null;
        }
        const snapshot = this.snapshotSingle();
        if (!snapshot.source) {
            return null;
        }
        snapshot.source = { ...snapshot.source };
        if (snapshot.source.filename) {
            snapshot.source.filename = normalizeReferenceImageFilename(snapshot.source.filename);
        }
        if ('objectUrl' in snapshot.source) {
            delete (snapshot.source as any).objectUrl;
        }
        return snapshot;
    }

    private serializeDoc(): ReferenceImagesDocState {
        const snapshot = normalizeFullState(this.snapshotFull());
        snapshot.assets = snapshot.assets.map(asset => ({
            id: asset.id,
            source: { ...asset.source }
        }));
        snapshot.assets.forEach((asset) => {
            if (asset.source?.filename) {
                asset.source.filename = normalizeReferenceImageFilename(asset.source.filename);
            }
            if (asset.source && 'objectUrl' in (asset.source as any)) {
                delete (asset.source as any).objectUrl;
            }
        });
        snapshot.assets.sort((a, b) => a.id.localeCompare(b.id));
        return snapshot;
    }

    private docAssets() {
        const assets: Array<{ path: string; blob: Blob }> = [];
        const usage = this.collectAssetUsage();
        const seen = new Set<string>();
        this.fullState.assets.forEach((asset) => {
            if (!asset?.id || !asset.source || seen.has(asset.id)) {
                return;
            }
            if ((usage.get(asset.id) ?? 0) <= 0) {
                return;
            }
            const blob = this.assets.getBlob(asset.id);
            if (!blob) {
                console.warn(`reference image asset missing blob: ${asset.id}`);
                return;
            }
            const safeName = normalizeReferenceImageFilename(asset.source.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
            assets.push({
                path: `reference-images/assets/${asset.id}/${safeName}`,
                blob
            });
            seen.add(asset.id);
        });
        return assets;
    }

    private async deserializeLegacyDoc(docState: any, blob: Blob | null): Promise<ReferenceImagesLoadReport> {
        const blobs = new Map<string, Blob>();
        if (blob instanceof Blob) {
            const safeName = normalizeReferenceImageFilename(docState?.source?.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
            blobs.set(`reference-image/${safeName}`, blob);
        }
        return await this.deserializeDoc(docState, blobs);
    }

    private async deserializeDoc(docState: any, blobs: Map<string, Blob>): Promise<ReferenceImagesLoadReport> {
        const report: ReferenceImagesLoadReport = { missingItems: 0 };
        const resetRuntimeState = () => {
            this.activePresetGeneration += 1;
            for (const runtime of this.runtimeById.values()) {
                this.destroyRuntime(runtime);
            }
            this.runtimeById.clear();
            this.assets.clear();
            this.exportWorkByAssetId.clear();
            this.exportWorkOrder = [];
        };
        const docRoot = (docState && typeof docState === 'object') ? docState as Record<string, any> : null;
        const hasV2Doc = !!docRoot && (
            docRoot.version === 2 ||
            Array.isArray(docRoot.presets) ||
            Array.isArray(docRoot.assets)
        );
        if (hasV2Doc) {
            resetRuntimeState();
            const snapshot = normalizeFullState(docRoot);
            const ensureUniqueItemIds = (presets: ReferenceImagePreset[]) => {
                const seen = new Set<string>();
                presets.forEach((preset) => {
                    const remap = new Map<string, string>();
                    preset.items.forEach((item) => {
                        const currentId = item.id;
                        if (!currentId) {
                            let nextId = createId();
                            while (seen.has(nextId)) {
                                nextId = createId();
                            }
                            item.id = nextId;
                            seen.add(item.id);
                            return;
                        }
                        if (seen.has(currentId)) {
                            let nextId = createId();
                            while (seen.has(nextId)) {
                                nextId = createId();
                            }
                            item.id = nextId;
                            remap.set(currentId, nextId);
                        }
                        seen.add(item.id);
                    });
                    if (preset.activeId && remap.has(preset.activeId)) {
                        preset.activeId = remap.get(preset.activeId) ?? preset.activeId;
                    }
                });
            };
            ensureUniqueItemIds(snapshot.presets);

            const assetsById = new Map<string, ReferenceImageAsset>();
            snapshot.assets.forEach((asset) => {
                if (!asset?.id || !asset.source) {
                    return;
                }
                assetsById.set(asset.id, asset);
            });

            const assetBlobs = new Map<string, Blob>();
            const usage = new Map<string, number>();
            snapshot.presets.forEach((preset) => {
                const filtered: ReferenceImageItemV2[] = [];
                preset.items.forEach((item) => {
                    const asset = assetsById.get(item.assetId);
                    if (!asset) {
                        report.missingItems += 1;
                        console.warn(`reference image asset missing: ${item.assetId}`);
                        return;
                    }
                    const safeFilename = normalizeReferenceImageFilename(asset.source?.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
                    const path = `reference-images/assets/${asset.id}/${safeFilename}`;
                    const blob = blobs?.get(path) ?? null;
                    if (!blob) {
                        report.missingItems += 1;
                        console.warn(`reference image missing: ${path}`);
                        return;
                    }
                    filtered.push(item);
                    usage.set(asset.id, (usage.get(asset.id) ?? 0) + 1);
                    if (!assetBlobs.has(asset.id)) {
                        assetBlobs.set(asset.id, blob);
                    }
                });
                preset.items = filtered;
                normalizeOrders(preset.items);
                if (preset.activeId && !preset.items.some(item => item.id === preset.activeId)) {
                    preset.activeId = preset.items[0]?.id ?? null;
                }
            });

            const usedAssets: ReferenceImageAsset[] = [];
            const usedAssetIds = new Set<string>();
            snapshot.assets.forEach((asset) => {
                if (!asset?.id || !asset.source || usedAssetIds.has(asset.id)) {
                    return;
                }
                if ((usage.get(asset.id) ?? 0) <= 0) {
                    return;
                }
                usedAssetIds.add(asset.id);
                usedAssets.push({ id: asset.id, source: asset.source });
                const blob = assetBlobs.get(asset.id) ?? null;
                if (blob) {
                    this.assets.restoreFromDoc(asset.id, asset.source, blob);
                }
            });

            snapshot.assets = usedAssets;
            if (!snapshot.activePresetId || !snapshot.presets.some(preset => preset.id === snapshot.activePresetId)) {
                snapshot.activePresetId = snapshot.presets[0]?.id ?? null;
            }
            this.fullState = snapshot;
            this.presetCounter = 0;
            this.syncPresetCounter();
            const assetUsage = this.collectAssetUsage();
            this.assets.syncAssets(this.fullState.assets, assetUsage);
            const activePreset = this.getActivePreset();
            this.startActivePresetRuntimeRefresh(activePreset).catch((): void => undefined);
            this.rebuildActiveState();
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
            this.firePresetsStateChanged();
            return report;
        }

        const normalizeDoc = (docRoot && Array.isArray((docRoot as any).items)) ? docRoot : null;
        if (!normalizeDoc) {
            // migration from legacy referenceImage state if provided as docState
            if (docState?.source && blobs instanceof Map) {
                const legacyBlob = blobs.get(`reference-image/${normalizeReferenceImageFilename(docState?.source?.filename)}`) ?? null;
                if (legacyBlob) {
                    resetRuntimeState();
                    const decoded = await this.decodeForAdd(legacyBlob, docState?.source?.filename);
                    const id = createId();
                    const assetInfo = await this.assets.register(decoded);
                    this.assets.addRef(assetInfo.assetId, assetInfo.source);
                    const item: ReferenceImageItemState = {
                        id,
                        name: decoded.source.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME,
                        group: normalizeGroup(docState?.layer, 'front'),
                        order: 0,
                        visible: normalizeBool(docState?.visible, true),
                        includeInRender: normalizeBool(docState?.includeInRender, false),
                        opacity: clamp(isFiniteNumber(docState?.opacity) ? docState.opacity : 0.7, 0, 1),
                        scalePct: clamp(isFiniteNumber(docState?.scalePct) ? docState.scalePct : 100, 1, 400),
                        offsetPx: normalizeOffset(docState?.offsetPx, { x: 0, y: 0 }),
                        anchor: normalizeAnchor(docState?.anchor, { ax: 0.5, ay: 0.5 }),
                        source: assetInfo.source
                    };
                    const preset: ReferenceImagePreset = {
                        id: LEGACY_REFERENCE_IMAGE_PRESET_ID,
                        name: LEGACY_REFERENCE_IMAGE_PRESET_NAME,
                        masterVisible: true,
                        activeId: id,
                        items: [{
                            id,
                            name: item.name,
                            group: item.group,
                            order: item.order,
                            visible: item.visible,
                            includeInRender: item.includeInRender,
                            opacity: item.opacity,
                            scalePct: item.scalePct,
                            offsetPx: { ...item.offsetPx },
                            anchor: { ...item.anchor },
                            assetId: assetInfo.assetId
                        }]
                    };
                    this.fullState = {
                        version: 2,
                        activePresetId: preset.id,
                        assets: [{
                            id: assetInfo.assetId,
                            source: assetInfo.source
                        }],
                        presets: [preset]
                    };
                    ensureBlankPreset(this.fullState.presets);
                    this.presetCounter = 0;
                    this.syncPresetCounter();
                    this.state = {
                        masterVisible: true,
                        activeId: id,
                        items: [item]
                    };
                    const texture = this.loader.createTexture(this.scene.app.graphicsDevice, decoded.canvas, this.previewPreferNearest(item));
                    this.runtimeById.set(id, { assetId: assetInfo.assetId, texture, blob: assetInfo.blob, previewCanvas: decoded.canvas });
                    this.assets.rememberPreview(assetInfo.assetId, assetInfo.blob, decoded.canvas);
                    this.updateRenderer();
                    this.requestRender();
                    this.fireStateChanged();
                    this.firePresetsStateChanged();
                    return report;
                }
                report.missingItems += 1;
            }

            resetRuntimeState();
            this.fullState = {
                version: 2,
                activePresetId: DEFAULT_REFERENCE_IMAGE_PRESET_ID,
                assets: [],
                presets: [createDefaultPreset()]
            };
            this.presetCounter = 0;
            this.syncPresetCounter();
            this.rebuildActiveState();
            this.updateRenderer();
            this.requestRender();
            this.fireStateChanged();
            this.firePresetsStateChanged();
            return report;
        }

        const doc = normalizeDoc as ReferenceImagesDocStateV1;
        const itemsRaw = Array.isArray(doc.items) ? doc.items : [];

        resetRuntimeState();
        const loadedItems: ReferenceImageItemState[] = [];
        const loadedRuntimes: Array<{ id: string; assetId: string; blob: Blob; canvas: HTMLCanvasElement; item: ReferenceImageItemState; }> = [];
        const assetsMap = new Map<string, ReferenceImageAsset>();

        for (const raw of itemsRaw) {
            const normalized = normalizeItem(raw);
            if (!normalized) {
                continue;
            }
            const safeFilename = normalizeReferenceImageFilename(normalized.source?.filename ?? DEFAULT_REFERENCE_IMAGE_FILENAME);
            const path = `reference-images/${normalized.id}/${safeFilename}`;
            const blob = blobs?.get(path) ?? null;
            if (!blob) {
                report.missingItems += 1;
                console.warn(`reference image missing: ${path}`);
                continue;
            }
            const decoded = await this.decodeForAdd(blob, safeFilename);
            const assetInfo = await this.assets.register(decoded);
            this.assets.addRef(assetInfo.assetId, assetInfo.source);
            normalized.source = assetInfo.source;
            loadedItems.push(normalized);
            assetsMap.set(assetInfo.assetId, { id: assetInfo.assetId, source: assetInfo.source });
            loadedRuntimes.push({ id: normalized.id, assetId: assetInfo.assetId, blob: assetInfo.blob, canvas: decoded.canvas, item: normalized });
        }

        normalizeOrders(loadedItems);
        const assetIdByItemId = new Map(loadedRuntimes.map(entry => [entry.id, entry.assetId]));
        const assets = Array.from(assetsMap.values());
        const presetItems: ReferenceImageItemV2[] = [];
        loadedItems.forEach((item) => {
            const assetId = assetIdByItemId.get(item.id);
            if (!assetId) {
                return;
            }
            presetItems.push({
                id: item.id,
                name: item.name,
                group: item.group,
                order: item.order,
                visible: item.visible,
                includeInRender: item.includeInRender,
                opacity: item.opacity,
                scalePct: item.scalePct,
                offsetPx: { ...item.offsetPx },
                anchor: { ...item.anchor },
                assetId
            });
        });

        const activeId = typeof doc.activeId === 'string' ? doc.activeId : (loadedItems[0]?.id ?? null);
        const resolvedActiveId = activeId && loadedItems.some(i => i.id === activeId) ? activeId : (loadedItems[0]?.id ?? null);
        const preset: ReferenceImagePreset = {
            id: LEGACY_REFERENCE_IMAGE_PRESET_ID,
            name: LEGACY_REFERENCE_IMAGE_PRESET_NAME,
            masterVisible: normalizeBool(doc.masterVisible, true),
            activeId: resolvedActiveId,
            items: presetItems
        };

        this.fullState = {
            version: 2,
            activePresetId: preset.id,
            assets,
            presets: [preset]
        };
        ensureBlankPreset(this.fullState.presets);
        this.presetCounter = 0;
        this.syncPresetCounter();
        this.state = {
            masterVisible: preset.masterVisible,
            activeId: resolvedActiveId,
            items: loadedItems
        };
        loadedRuntimes.forEach((entry) => {
            const texture = this.loader.createTexture(this.scene.app.graphicsDevice, entry.canvas, this.previewPreferNearest(entry.item));
            this.runtimeById.set(entry.id, { assetId: entry.assetId, texture, blob: entry.blob, previewCanvas: entry.canvas });
            this.assets.rememberPreview(entry.assetId, entry.blob, entry.canvas);
        });
        this.updateRenderer();
        this.requestRender();
        this.fireStateChanged();
        this.firePresetsStateChanged();
        return report;
    }

    private async importPsd(blob: Blob, filename?: string, opts?: { group?: ReferenceImageItemGroup; }) {
        const group = normalizeGroup(opts?.group, this.getActiveItem()?.group ?? 'front');
        const addContext = this.captureAddContext();
        if (filename && !addContext.presetNameHint) {
            addContext.presetNameHint = normalizeReferenceImageFilename(filename);
        }
        const arrayBuffer = await blob.arrayBuffer();
        const psd = readPsd(arrayBuffer, { skipCompositeImageData: true, skipThumbnail: true });
        const width = (psd as any)?.width ?? 0;
        const height = (psd as any)?.height ?? 0;
        if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) {
            throw new Error('Invalid PSD dimensions');
        }

        const layers: Layer[] = [];
        const walk = (children?: Layer[]) => {
            (children ?? []).forEach((layer) => {
                const childList = (layer as any).children as Layer[] | undefined;
                if (Array.isArray(childList) && childList.length > 0) {
                    walk(childList);
                    return;
                }
                layers.push(layer);
            });
        };
        walk((psd as any).children ?? []);

        if (layers.length === 0) {
            return [];
        }

        const docCenter = { x: width / 2, y: height / 2 };

        const pending: PendingAdd[] = [];
        let skipped = 0;

        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            const canvas = (layer as any).canvas as HTMLCanvasElement | undefined;
            const left = (layer as any).left;
            const top = (layer as any).top;
            const right = (layer as any).right;
            const bottom = (layer as any).bottom;
            if (!canvas || !isFiniteNumber(left) || !isFiniteNumber(top) || !isFiniteNumber(right) || !isFiniteNumber(bottom)) {
                skipped++;
                continue;
            }
            const w = right - left;
            const h = bottom - top;
            if (!isFiniteNumber(w) || !isFiniteNumber(h) || w <= 0 || h <= 0) {
                skipped++;
                continue;
            }
            const layerName = (typeof (layer as any).name === 'string' && (layer as any).name.trim()) ? (layer as any).name.trim() : `Layer ${i + 1}`;
            const visible = !((layer as any).hidden === true);
            const opacity = clamp(isFiniteNumber((layer as any).opacity) ? (layer as any).opacity : 1, 0, 1);
            const layerCenter = { x: (left + right) / 2, y: (top + bottom) / 2 };
            const offsetPx = { x: docCenter.x - layerCenter.x, y: docCenter.y - layerCenter.y };
            const pngBlob = await createCanvasBlob(canvas, 'image/png');
            const normalizedFilename = normalizeReferenceImageFilename(`${(filename ?? 'psd').split(/[\\/]/).pop() ?? 'psd'}-${layerName}.png`);
            const decoded = await this.decodeForAdd(pngBlob, normalizedFilename);
            const assetInfo = await this.assets.register(decoded);
            pending.push({
                id: createId(),
                decoded,
                assetId: assetInfo.assetId,
                assetSource: assetInfo.source,
                assetBlob: assetInfo.blob,
                assetIsNew: assetInfo.isNew,
                group,
                name: layerName,
                visible,
                includeInRender: visible,
                opacity,
                scalePct: 100,
                offsetPx,
                anchor: { ax: 0.5, ay: 0.5 }
            });
        }

        const ids = this.applyPendingAdds(pending, true, 'referenceImages.importPsd', addContext);

        if (skipped > 0) {
            console.warn(`PSD import skipped ${skipped} layer(s) without canvas/bounds`);
        }

        return ids;
    }
}

const registerReferenceImages = (events: Events, scene: Scene) => {
    const controller = new ReferenceImagesController(events, scene);
    return controller;
};

export { ReferenceImagesController, registerReferenceImages };
