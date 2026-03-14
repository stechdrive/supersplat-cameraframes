import { getInputFormat, ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset, BoundingBox, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { loadGSplatData, validateGSplatData } from './io';
import { Model } from './model';
import { Splat } from './splat';

const getOrientation = (filename: string) => {
    switch (getInputFormat(filename)) {
        case 'spz':
            return new Vec3(0, 0, 0);
        case 'lcc':
            return new Vec3(90, 0, 180);
        default:
            return new Vec3(0, 0, 180);
    }
};

// handles loading gsplat assets using splat-transform
class AssetLoader {
    app: AppBase;
    events: Events;
    private sourceBlobs = new WeakMap<object, Blob>();

    constructor(app: AppBase, events: Events) {
        this.app = app;
        this.events = events;
    }

    private setSourceBlob(target: object, blob?: Blob | null) {
        if (!blob) {
            return;
        }
        this.sourceBlobs.set(target, blob);
        // Keep legacy __sourceBlob for compatibility.
        (target as any).__sourceBlob = blob;
    }

    getSourceBlob(target: Asset | { asset?: Asset }) {
        const assetCandidate = (target as any)?.asset ?? target;
        if (!(assetCandidate instanceof Asset) && !(assetCandidate as any)?.file) {
            return null;
        }
        return this.sourceBlobs.get(assetCandidate) ?? (assetCandidate as any).__sourceBlob ?? null;
    }

    private async readBlob(filename: string, fileSystem: ReadFileSystem): Promise<Blob | null> {
        try {
            const source = await fileSystem.createSource(filename);
            try {
                const data = await source.read().readAll();
                return new Blob([new Uint8Array(data)]);
            } finally {
                source.close();
            }
        } catch {
            return null;
        }
    }

    private async loadLegacyGsplat(filename: string, blob: Blob): Promise<Splat> {
        const assetUrl = URL.createObjectURL(blob);
        const asset = new Asset(filename, 'gsplat', {
            url: assetUrl,
            filename
        }, {
            decompress: true,
            reorder: true
        });
        this.setSourceBlob(asset, blob);
        this.app.assets.add(asset);

        try {
            await new Promise<void>((resolve, reject) => {
                asset.once('load', () => resolve());
                asset.once('error', (err: Error) => reject(err));
                this.app.assets.load(asset);
            });
        } finally {
            URL.revokeObjectURL(assetUrl);
        }

        return new Splat(asset, getOrientation(filename));
    }

    private async loadContainer(filename: string, blob?: Blob | null, url?: string) {
        const sourceBlob = blob ?? null;
        const assetUrl = sourceBlob ? URL.createObjectURL(sourceBlob) : (url ?? filename);
        const asset = new Asset(filename ?? url, 'container', {
            url: assetUrl,
            filename: filename ?? url
        });
        this.setSourceBlob(asset, sourceBlob ?? null);
        this.app.assets.add(asset);

        try {
            await new Promise<void>((resolve, reject) => {
                asset.once('load', () => resolve());
                asset.once('error', (err: Error) => reject(err));
                this.app.assets.load(asset);
            });
            return asset;
        } finally {
            if (sourceBlob && assetUrl) {
                URL.revokeObjectURL(assetUrl);
            }
        }
    }

    async load(filename: string,
        fileSystem: ReadFileSystem,
        animationFrame?: boolean,
        sourceBlobOrSkipReorder?: Blob | boolean | null,
        skipReorderArg?: boolean) {

        let sourceBlob: Blob | null = null;
        let skipReorder = false;

        if (typeof sourceBlobOrSkipReorder === 'boolean') {
            skipReorder = sourceBlobOrSkipReorder;
        } else {
            sourceBlob = sourceBlobOrSkipReorder ?? null;
        }

        if (typeof skipReorderArg === 'boolean') {
            skipReorder = skipReorderArg;
        }

        if (!animationFrame) {
            this.events.fire('startSpinner');
        }

        const lowerFilename = filename.toLowerCase();

        try {
            try {
                const gsplatData = await loadGSplatData(filename, fileSystem, skipReorder || animationFrame);
                validateGSplatData(gsplatData);

                const bounds = new BoundingBox();
                if (!gsplatData.calcAabb(bounds)) {
                    throw new Error('Loaded splat has invalid bounds');
                }

                const asset = new Asset(filename, 'gsplat', { url: `local-asset-${Date.now()}`, filename });
                this.app.assets.add(asset);
                asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);
                this.setSourceBlob(asset, sourceBlob ?? null);

                return new Splat(asset, getOrientation(filename));
            } catch (error) {
                const canFallback = lowerFilename.endsWith('.ply') || lowerFilename.endsWith('.sog');
                if (!canFallback) {
                    throw error;
                }

                const blob = sourceBlob ?? await this.readBlob(filename, fileSystem);
                if (!blob) {
                    throw error;
                }

                try {
                    return await this.loadLegacyGsplat(filename, blob);
                } catch (fallbackError) {
                    const primaryMessage = error instanceof Error ? error.message : `${error}`;
                    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : `${fallbackError}`;
                    throw new Error(`Failed to load '${filename}' with splat-transform: ${primaryMessage}. Legacy loader failed: ${fallbackMessage}`);
                }
            }
        } finally {
            if (!animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }

    async loadModel(filename: string, blob?: Blob | null, url?: string) {
        const asset = await this.loadContainer(filename, blob ?? null, url);
        return new Model(asset);
    }
}

export { AssetLoader };
