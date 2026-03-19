const DB_NAME = 'supersplat-project-state';
const DB_VERSION = 1;
const PROJECT_STORE = 'working-projects';
const LINK_STORE = 'project-links';

type WorkingAssetKind = 'splat' | 'model';

type WorkingAssetRecord = {
    id: string;
    kind: WorkingAssetKind;
    blob: Blob;
};

type WorkingReferenceImageAssetRecord = {
    path: string;
    blob: Blob;
};

type WorkingProjectRecord = {
    projectId: string;
    savedAt: number;
    packageRevision: number | null;
    packageFingerprint: string | null;
    snapshot: any;
    assets: WorkingAssetRecord[];
    referenceImageAssets: WorkingReferenceImageAssetRecord[];
};

type ProjectLinkRecord = {
    fingerprint: string;
    projectId: string;
    updatedAt: number;
};

const wrap = <T>(request: IDBRequest<T>) => {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            console.error('IndexedDB error', request.error);
            reject(request.error);
        };
    });
};

class ProjectSaveStateStore {
    db: Promise<IDBDatabase>;

    constructor() {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(PROJECT_STORE)) {
                db.createObjectStore(PROJECT_STORE, { keyPath: 'projectId' });
            }
            if (!db.objectStoreNames.contains(LINK_STORE)) {
                db.createObjectStore(LINK_STORE, { keyPath: 'fingerprint' });
            }
        };
        this.db = wrap(request);
    }

    async save(record: WorkingProjectRecord) {
        const db = await this.db;
        const tx = db.transaction([PROJECT_STORE], 'readwrite');
        await wrap(tx.objectStore(PROJECT_STORE).put(record));
    }

    async load(projectId: string | null | undefined): Promise<WorkingProjectRecord | null> {
        if (!projectId) {
            return null;
        }
        const db = await this.db;
        const tx = db.transaction([PROJECT_STORE], 'readonly');
        return (await wrap(tx.objectStore(PROJECT_STORE).get(projectId))) ?? null;
    }

    async clear(projectId: string | null | undefined) {
        if (!projectId) {
            return;
        }
        const db = await this.db;
        const tx = db.transaction([PROJECT_STORE], 'readwrite');
        await wrap(tx.objectStore(PROJECT_STORE).delete(projectId));
    }

    async setProjectLink(fingerprint: string | null | undefined, projectId: string | null | undefined) {
        if (!fingerprint || !projectId) {
            return;
        }
        const db = await this.db;
        const tx = db.transaction([LINK_STORE], 'readwrite');
        const record: ProjectLinkRecord = {
            fingerprint,
            projectId,
            updatedAt: Date.now()
        };
        await wrap(tx.objectStore(LINK_STORE).put(record));
    }

    async loadByFingerprint(fingerprint: string | null | undefined): Promise<WorkingProjectRecord | null> {
        if (!fingerprint) {
            return null;
        }
        const db = await this.db;
        const tx = db.transaction([LINK_STORE], 'readonly');
        const link = await wrap(tx.objectStore(LINK_STORE).get(fingerprint)) as ProjectLinkRecord | undefined;
        if (!link?.projectId) {
            return null;
        }
        return await this.load(link.projectId);
    }
}

const projectSaveStateStore = new ProjectSaveStateStore();

export { projectSaveStateStore };
export type {
    WorkingAssetKind,
    WorkingAssetRecord,
    WorkingReferenceImageAssetRecord,
    WorkingProjectRecord
};
