import { AppBase, Asset, GSplatData, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { AssetSource } from './loaders/asset-source';
import { loadGsplat } from './loaders/gsplat';
import { loadLcc } from './loaders/lcc';
import { loadSplat } from './loaders/splat';
import { Model } from './model';
import { Splat } from './splat';

const defaultOrientation = new Vec3(0, 0, 180);
const lccOrientation = new Vec3(90, 0, 180);

// handles loading gltf container assets
class AssetLoader {
    app: AppBase;
    events: Events;
    defaultAnisotropy: number;
    loadAllData = true;
    private sourceBlobs = new WeakMap<object, Blob>();

    constructor(app: AppBase, events: Events, defaultAnisotropy?: number) {
        this.app = app;
        this.events = events;
        this.defaultAnisotropy = defaultAnisotropy || 1;
    }

    private setSourceBlob(target: object, blob?: Blob | null) {
        if (!blob) {
            return;
        }
        this.sourceBlobs.set(target, blob);
        // 互換性のために既存の __sourceBlob にも格納する
        (target as any).__sourceBlob = blob;
    }

    private async prepareSourceBlob(assetSource: AssetSource, fallbackBuffer?: ArrayBuffer) {
        if (assetSource.contents instanceof Blob) {
            return assetSource.contents;
        }
        if (assetSource.contents instanceof Response) {
            try {
                return await assetSource.contents.clone().blob();
            } catch {
                return null;
            }
        }
        if (fallbackBuffer) {
            return new Blob([fallbackBuffer]);
        }
        return null;
    }

    getSourceBlob(target: Asset | { asset?: Asset }) {
        const assetCandidate = (target as any)?.asset ?? target;
        if (!(assetCandidate instanceof Asset) && !(assetCandidate as any)?.file) {
            return null;
        }
        return this.sourceBlobs.get(assetCandidate) ?? (assetCandidate as any).__sourceBlob ?? null;
    }

    private async loadContainer(assetSource: AssetSource) {
        const sourceBlob = assetSource.contents instanceof Response ? await assetSource.contents.blob() : assetSource.contents;
        const url = sourceBlob ? URL.createObjectURL(sourceBlob) : assetSource.url ?? assetSource.filename;
        const asset = new Asset(assetSource.filename || assetSource.url, 'container', {
            url,
            filename: assetSource.filename ?? assetSource.url
        });
        // 保存用に元データを残す（object URL revoke 後も参照可能にする）
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
            if (sourceBlob && url) {
                URL.revokeObjectURL(url);
            }
        }
    }

    async load(assetSource: AssetSource) {
        const wrap = (gsplatData: GSplatData, sourceBlob?: Blob | null) => {
            const asset = new Asset(assetSource.filename || assetSource.url, 'gsplat', {
                url: assetSource.contents ? `local-asset-${Date.now()}` : assetSource.url ?? assetSource.filename,
                filename: assetSource.filename
            });
            this.app.assets.add(asset);
            asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);
            this.setSourceBlob(asset, sourceBlob ?? null);
            return asset;
        };

        if (!assetSource.animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            const filename = (assetSource.filename || assetSource.url).toLowerCase();

            let asset;
            let orientation = defaultOrientation;

            if (filename.endsWith('.glb')) {
                asset = await this.loadContainer(assetSource);
                return new Model(asset);
            } else if (filename.endsWith('.splat')) {
                const { data, sourceBlob } = await loadSplat(assetSource);
                asset = wrap(data, sourceBlob);
            } else if (filename.endsWith('.lcc')) {
                const { data, sourceBlob } = await loadLcc(assetSource);
                asset = wrap(data, sourceBlob);
                orientation = lccOrientation;
            } else {
                const sourceBlobPromise = this.prepareSourceBlob(assetSource);
                asset = await loadGsplat(this.app.assets, assetSource);
                this.setSourceBlob(asset, await sourceBlobPromise);
            }

            return new Splat(asset, orientation);
        } finally {
            if (!assetSource.animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }
}

export { AssetLoader };
