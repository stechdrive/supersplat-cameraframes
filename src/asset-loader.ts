import { getInputFormat, ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { loadGSplatData, validateGSplatData } from './io';
import { Model } from './model';
import { Splat } from './splat';

const defaultOrientation = new Vec3(0, 0, 180);
const lccOrientation = new Vec3(90, 0, 180);

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

    async load(filename: string, fileSystem: ReadFileSystem, animationFrame?: boolean, sourceBlob?: Blob | null) {
        if (!animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            const gsplatData = await loadGSplatData(filename, fileSystem);
            validateGSplatData(gsplatData);

            const asset = new Asset(filename, 'gsplat', { url: `local-asset-${Date.now()}`, filename });
            this.app.assets.add(asset);
            asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);
            this.setSourceBlob(asset, sourceBlob ?? null);

            const orientation = getInputFormat(filename.toLowerCase()) === 'lcc' ? lccOrientation : defaultOrientation;
            return new Splat(asset, orientation);
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
