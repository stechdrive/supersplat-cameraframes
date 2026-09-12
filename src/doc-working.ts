import { MemoryFileSystem, type ReadFileSystem } from '@playcanvas/splat-transform';

import { collectProductAssets, collectProductState } from './doc-camera-frames';
import { encodeInstances } from './doc-instances';
import type { EditorSplatResource } from './editor-splat-resource';
import type { Events } from './events';
import { BlobReadSource } from './io';
import { projectSaveStateStore, type WorkingProjectRecord } from './project-save-state';
import type { Scene } from './scene';
import type { Splat } from './splat';
import { writeResourceFile } from './splat-serialize';

// Retain the old fingerprint algorithm so existing local working records can
// still be found for packages which predate persistent project IDs.
export const packageFingerprint = (name: string, size: number, json: string) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < json.length; ++i) hash = Math.imul(hash ^ json.charCodeAt(i), 0x01000193);
    return `doc:${name}:${size}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const workingCompatible = (record: WorkingProjectRecord, revision: number | null, fingerprint: string) => {
    return !!record && (record.packageRevision ?? null) === revision &&
        (!record.packageFingerprint || record.packageFingerprint === fingerprint) &&
        (revision !== null || record.packageFingerprint === fingerprint);
};

export class WorkingFileSystem implements ReadFileSystem {
    readonly blobs = new Map<string, Blob>();
    constructor(private base: ReadFileSystem, record?: WorkingProjectRecord) {
        record?.assets.forEach(asset => this.blobs.set(asset.id, asset.blob));
        record?.referenceImageAssets.forEach(asset => this.blobs.set(asset.path, asset.blob));
        // v0 working records keyed source/snapshot blobs by asset ID instead of
        // archive path. Resolve those aliases before handing the FS to loaders.
        if (record?.snapshot.version === 0) {
            for (const entry of [...record.snapshot.splats, ...record.snapshot.models ?? []]) {
                const blob = this.blobs.get(entry.assetId);
                if (blob) this.blobs.set(entry.filename, blob);
            }
        }
    }
    async createSource(path: string) {
        const blob = this.blobs.get(path);
        if (blob) return new BlobReadSource(blob);
        const source = await this.base.createSource(path);
        if (source.seekable) return source;
        // Old Camera Frames packages used DEFLATE entries. The v3 PLY reader
        // needs random access; materialize only such entries, in bounded chunks
        // instead of allocating a single multi-gigabyte ArrayBuffer.
        const stream = source.read();
        const parts: BlobPart[] = [];
        try {
            for (;;) {
                const buffer = new Uint8Array(4 * 1024 * 1024);
                const length = await stream.pull(buffer);
                if (!length) break;
                parts.push(new Blob([buffer.subarray(0, length)]));
            }
            const decompressed = new Blob(parts);
            this.blobs.set(path, decompressed);
            return new BlobReadSource(decompressed);
        } finally {
            stream.close();
            source.close();
        }
    }
}

// Editable instance lists/palettes are saved each time; immutable Gaussian data
// already in the base package is only referenced. New resources are serialized
// once and reused on subsequent Ctrl+S operations.
export class WorkingDocument {
    projectId: string | null = null;
    revision: number | null = null;
    fingerprint: string | null = null;
    resourcePaths = new Map<EditorSplatResource, string>();
    basePaths = new Set<string>();
    private assets = new Map<string, Blob>();

    reset() {
        this.projectId = null;
        this.revision = null;
        this.fingerprint = null;
        this.resourcePaths.clear();
        this.basePaths.clear();
        this.assets.clear();
    }

    restore(projectId: string, revision: number | null, fingerprint: string, basePaths: string[], record?: WorkingProjectRecord) {
        this.projectId = projectId;
        this.revision = revision;
        this.fingerprint = fingerprint;
        this.basePaths = new Set(basePaths);
        this.assets = new Map(record?.assets.map(asset => [asset.id, asset.blob]) ?? []);
    }

    async save(scene: Scene, events: Events) {
        const splats = events.invoke('scene.allSplats') as Splat[];
        const resources = [...new Set(splats.map(splat => splat.resource))];
        const assets: WorkingProjectRecord['assets'] = [];
        const rows = new Map<EditorSplatResource, Uint32Array>();
        for (const resource of resources) {
            let path = this.resourcePaths.get(resource);
            if (!path) {
                path = `working/resource_${crypto.randomUUID()}.ply`;
                this.resourcePaths.set(resource, path);
            }
            const identity = Uint32Array.from({ length: resource.numRows }, (_, i) => i);
            rows.set(resource, identity);
            if (!this.basePaths.has(path)) {
                let blob = this.assets.get(path);
                if (!blob) {
                    const memory = new MemoryFileSystem();
                    await writeResourceFile(resource, identity, path, memory);
                    blob = new Blob([memory.results.get(path) as BlobPart]);
                }
                assets.push({ kind: 'splat', storage: 'source', id: path, blob });
            }
        }
        const snapshot = {
            version: 1,
            workingStateVersion: 2,
            projectId: this.projectId,
            ...collectProductState(scene, events),
            camera: scene.camera.docSerialize(),
            view: events.invoke('docSerialize.view'),
            poseSets: events.invoke('docSerialize.poseSets'),
            timeline: events.invoke('docSerialize.timeline'),
            resources: resources.map(resource => ({ filename: this.resourcePaths.get(resource), numRows: resource.numRows })),
            splats: splats.map((splat, i) => {
                const instances = `working/instances_${i}.bin`;
                assets.push({ kind: 'splat', id: instances, blob: new Blob([encodeInstances(splat, rows.get(splat.resource))]) });
                return { ...splat.docSerialize(), resource: resources.indexOf(splat.resource), instances };
            })
        };
        const references: WorkingProjectRecord['referenceImageAssets'] = [];
        for (const asset of collectProductAssets(scene, events)) {
            if (asset.path.startsWith('models/')) assets.push({ kind: 'model', id: asset.path, blob: asset.blob });
            else references.push(asset);
        }
        const record: WorkingProjectRecord = {
            projectId: this.projectId,
            packageRevision: this.revision,
            packageFingerprint: this.fingerprint,
            savedAt: Date.now(),
            snapshot,
            assets,
            referenceImageAssets: references
        };
        await projectSaveStateStore.save(record);
        this.assets = new Map(assets.map(asset => [asset.id, asset.blob]));
        await projectSaveStateStore.setProjectLink(this.fingerprint, this.projectId);
        await projectSaveStateStore.cleanup({ keepProjectIds: [this.projectId] });
        return record;
    }
}
