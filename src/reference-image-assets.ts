import type { LoadedImage } from './reference-image-loader';
import type { ReferenceImageSourceMeta } from './reference-image-types';
import type { ReferenceImageAsset } from './reference-images-types';

type AssetEntry = {
    id: string;
    source: ReferenceImageSourceMeta;
    blob: Blob | null;
    refCount: number;
    hash: string | null;
};

type PreviewCacheEntry = {
    blob: Blob;
    previewCanvas: HTMLCanvasElement;
};

type RegisterResult = {
    assetId: string;
    source: ReferenceImageSourceMeta;
    blob: Blob;
    isNew: boolean;
};

const ASSET_HASH_REGEX = /^refasset_([0-9a-f]{64})$/i;

class ReferenceImageAssets {
    private assets = new Map<string, AssetEntry>();
    private detached = new Map<string, AssetEntry>();
    private detachedOrder: string[] = [];
    private previewCache = new Map<string, PreviewCacheEntry>();
    private previewOrder: string[] = [];
    private hashToId = new Map<string, string>();
    private fallbackCounter = 0;
    private readonly maxPreview = 8;
    private readonly maxDetached = 8;

    private createFallbackId() {
        try {
            const uuid = (globalThis.crypto as any)?.randomUUID?.();
            if (typeof uuid === 'string' && uuid) {
                return `refasset_${uuid}`;
            }
        } catch {
            // ignore
        }
        this.fallbackCounter += 1;
        return `refasset_${Date.now().toString(16)}_${this.fallbackCounter.toString(16)}_${Math.random().toString(16).slice(2)}`;
    }

    private createUniqueFallbackId() {
        let id = this.createFallbackId();
        while (this.assets.has(id) || this.detached.has(id)) {
            id = this.createFallbackId();
        }
        return id;
    }

    private async computeHash(blob: Blob): Promise<string | null> {
        const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
        if (!subtle?.digest) {
            return null;
        }
        try {
            const buffer = await blob.arrayBuffer();
            const hashBuffer = await subtle.digest('SHA-256', buffer);
            const bytes = new Uint8Array(hashBuffer);
            let hex = '';
            for (const byte of bytes) {
                hex += byte.toString(16).padStart(2, '0');
            }
            return hex;
        } catch {
            return null;
        }
    }

    private ensureHashMapping(entry: AssetEntry) {
        if (entry.hash) {
            this.hashToId.set(entry.hash, entry.id);
            return;
        }
        const match = ASSET_HASH_REGEX.exec(entry.id);
        if (match) {
            entry.hash = match[1].toLowerCase();
            this.hashToId.set(entry.hash, entry.id);
        }
    }

    private restoreDetached(assetId: string) {
        const entry = this.detached.get(assetId);
        if (!entry) {
            return null;
        }
        this.detached.delete(assetId);
        this.detachedOrder = this.detachedOrder.filter(id => id !== assetId);
        this.assets.set(assetId, entry);
        return entry;
    }

    private detachEntry(entry: AssetEntry) {
        const assetId = entry.id;
        if (entry.blob) {
            this.detached.set(assetId, { ...entry, refCount: 0 });
            this.detachedOrder = this.detachedOrder.filter(id => id !== assetId);
            this.detachedOrder.push(assetId);
            while (this.detachedOrder.length > this.maxDetached) {
                const drop = this.detachedOrder.shift();
                if (drop) {
                    const removed = this.detached.get(drop);
                    this.detached.delete(drop);
                    if (removed?.hash && this.hashToId.get(removed.hash) === drop) {
                        this.hashToId.delete(removed.hash);
                    }
                }
            }
        }
        this.previewCache.delete(assetId);
        this.previewOrder = this.previewOrder.filter(id => id !== assetId);
        this.assets.delete(assetId);
    }

    async register(decoded: LoadedImage): Promise<RegisterResult> {
        const hash = await this.computeHash(decoded.blob);
        let assetId = hash ? this.hashToId.get(hash) ?? `refasset_${hash}` : null;
        if (hash && assetId && !this.assets.has(assetId) && !this.detached.has(assetId)) {
            this.hashToId.delete(hash);
            assetId = `refasset_${hash}`;
        }
        if (!assetId) {
            assetId = this.createUniqueFallbackId();
        }

        let entry = this.assets.get(assetId) ?? this.restoreDetached(assetId);
        let isNew = false;
        if (!entry) {
            entry = {
                id: assetId,
                source: decoded.source,
                blob: decoded.blob,
                refCount: 0,
                hash: hash ?? null
            };
            this.assets.set(assetId, entry);
            isNew = true;
        } else {
            if (!entry.blob) {
                entry.blob = decoded.blob;
            }
            if (entry.source?.filename && decoded.source?.filename && entry.source.filename !== decoded.source.filename) {
                console.warn(`reference image asset filename mismatch: '${entry.source.filename}' != '${decoded.source.filename}'`);
            }
            if (!entry.hash && hash) {
                entry.hash = hash;
            }
        }

        if (hash) {
            this.hashToId.set(hash, assetId);
        }
        this.ensureHashMapping(entry);
        this.rememberPreview(assetId, entry.blob ?? decoded.blob, decoded.canvas);

        return {
            assetId,
            source: entry.source,
            blob: entry.blob ?? decoded.blob,
            isNew
        };
    }

    addRef(assetId: string, source?: ReferenceImageSourceMeta) {
        if (!assetId) {
            return;
        }
        let entry = this.assets.get(assetId) ?? this.restoreDetached(assetId);
        if (!entry) {
            if (!source) {
                console.warn(`reference image asset missing for addRef: ${assetId}`);
                return;
            }
            entry = {
                id: assetId,
                source,
                blob: null,
                refCount: 0,
                hash: null
            };
            this.assets.set(assetId, entry);
        } else if (!entry.source && source) {
            entry.source = source;
        }
        entry.refCount += 1;
        this.ensureHashMapping(entry);
    }

    releaseRef(assetId: string) {
        const entry = this.assets.get(assetId);
        if (!entry) {
            return false;
        }
        entry.refCount = Math.max(0, entry.refCount - 1);
        if (entry.refCount > 0) {
            return false;
        }
        this.detachEntry(entry);
        return true;
    }

    getEntry(assetId: string) {
        return this.assets.get(assetId) ?? null;
    }

    getSource(assetId: string) {
        return this.assets.get(assetId)?.source ?? null;
    }

    getBlob(assetId: string) {
        return this.assets.get(assetId)?.blob ?? null;
    }

    rememberPreview(assetId: string, blob: Blob | null, previewCanvas: HTMLCanvasElement | null) {
        if (!assetId || !blob || !previewCanvas) {
            return;
        }
        this.previewCache.set(assetId, { blob, previewCanvas });
        this.previewOrder = this.previewOrder.filter(id => id !== assetId);
        this.previewOrder.push(assetId);
        while (this.previewOrder.length > this.maxPreview) {
            const drop = this.previewOrder.shift();
            if (drop) {
                this.previewCache.delete(drop);
            }
        }
    }

    restorePreview(assetId: string) {
        const cached = this.previewCache.get(assetId);
        if (!cached) {
            return null;
        }
        this.previewOrder = this.previewOrder.filter(id => id !== assetId);
        this.previewOrder.push(assetId);
        return cached;
    }

    syncAssets(assets: ReferenceImageAsset[], usage: Map<string, number>) {
        const assetIds = new Set(assets.map(asset => asset.id));
        for (const [id, entry] of this.assets) {
            if (!assetIds.has(id)) {
                this.detachEntry(entry);
            }
        }
        assets.forEach((asset) => {
            let entry = this.assets.get(asset.id) ?? this.restoreDetached(asset.id);
            if (!entry) {
                entry = {
                    id: asset.id,
                    source: asset.source,
                    blob: null,
                    refCount: 0,
                    hash: null
                };
                this.assets.set(asset.id, entry);
            } else {
                entry.source = asset.source;
            }
            entry.refCount = usage.get(asset.id) ?? 0;
            this.ensureHashMapping(entry);
        });
    }

    clear() {
        this.assets.clear();
        this.detached.clear();
        this.detachedOrder = [];
        this.previewCache.clear();
        this.previewOrder = [];
        this.hashToId.clear();
        this.fallbackCounter = 0;
    }
}

export { ReferenceImageAssets };
export type { RegisterResult };
