const DB_NAME = 'supersplat-project-state';
const DB_VERSION = 1;
const PROJECT_STORE = 'working-projects';
const LINK_STORE = 'project-links';
const MAX_WORKING_PROJECTS = 16;
const MAX_WORKING_STATE_BYTES = 512 * 1024 * 1024;

type WorkingAssetKind = 'splat' | 'model';
type WorkingAssetStorage = 'source' | 'snapshot';

type WorkingAssetRecord = {
    id: string;
    kind: WorkingAssetKind;
    blob: Blob;
    storage?: WorkingAssetStorage;
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

type WorkingStateStats = {
    projectCount: number;
    linkCount: number;
    totalBytes: number;
};

type WorkingStateCleanupResult = WorkingStateStats & {
    removedProjects: number;
    removedLinks: number;
    freedBytes: number;
};

type WorkingStateCleanupOptions = {
    keepProjectIds?: string[];
    maxProjects?: number;
    maxBytes?: number;
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

const waitForTransaction = (tx: IDBTransaction) => {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => {
            console.error('IndexedDB transaction aborted', tx.error);
            reject(tx.error);
        };
        tx.onerror = () => {
            console.error('IndexedDB transaction error', tx.error);
            reject(tx.error);
        };
    });
};

const getAll = async <T>(store: IDBObjectStore) => {
    return (await wrap(store.getAll())) as T[];
};

const textEncoder = new TextEncoder();

const estimateRecordBytes = (record: WorkingProjectRecord) => {
    let total = 512;
    total += textEncoder.encode(JSON.stringify(record.snapshot ?? null)).length;
    total += textEncoder.encode(record.projectId ?? '').length;

    record.assets?.forEach((asset) => {
        total += 128;
        total += textEncoder.encode(asset.id ?? '').length;
        total += textEncoder.encode(asset.kind ?? '').length;
        total += asset.blob?.size ?? 0;
    });

    record.referenceImageAssets?.forEach((asset) => {
        total += 128;
        total += textEncoder.encode(asset.path ?? '').length;
        total += asset.blob?.size ?? 0;
    });

    return total;
};

const summarizeProjects = (projects: WorkingProjectRecord[]) => {
    return projects.reduce((total, record) => total + estimateRecordBytes(record), 0);
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
        const done = waitForTransaction(tx);
        await wrap(tx.objectStore(PROJECT_STORE).put(record));
        await done;
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
            return {
                projectCount: 0,
                linkCount: 0,
                totalBytes: 0,
                removedProjects: 0,
                removedLinks: 0,
                freedBytes: 0
            } satisfies WorkingStateCleanupResult;
        }
        const db = await this.db;
        const tx = db.transaction([PROJECT_STORE, LINK_STORE], 'readwrite');
        const done = waitForTransaction(tx);
        const projectStore = tx.objectStore(PROJECT_STORE);
        const linkStore = tx.objectStore(LINK_STORE);
        const projects = await getAll<WorkingProjectRecord>(projectStore);
        const links = await getAll<ProjectLinkRecord>(linkStore);
        const target = projects.find(record => record.projectId === projectId) ?? null;
        const removedProject = target ? 1 : 0;
        const removedLinks = links.filter(link => link.projectId === projectId);

        if (removedProject) {
            await wrap(projectStore.delete(projectId));
        }
        for (const link of removedLinks) {
            await wrap(linkStore.delete(link.fingerprint));
        }

        await done;

        const remainingProjects = projects.filter(record => record.projectId !== projectId);
        return {
            projectCount: remainingProjects.length,
            linkCount: links.length - removedLinks.length,
            totalBytes: summarizeProjects(remainingProjects),
            removedProjects: removedProject,
            removedLinks: removedLinks.length,
            freedBytes: target ? estimateRecordBytes(target) : 0
        } satisfies WorkingStateCleanupResult;
    }

    async setProjectLink(fingerprint: string | null | undefined, projectId: string | null | undefined) {
        if (!fingerprint || !projectId) {
            return;
        }
        const db = await this.db;
        const tx = db.transaction([LINK_STORE], 'readwrite');
        const done = waitForTransaction(tx);
        const record: ProjectLinkRecord = {
            fingerprint,
            projectId,
            updatedAt: Date.now()
        };
        await wrap(tx.objectStore(LINK_STORE).put(record));
        await done;
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
        const record = await this.load(link.projectId);
        if (!record) {
            const cleanupTx = db.transaction([LINK_STORE], 'readwrite');
            const done = waitForTransaction(cleanupTx);
            await wrap(cleanupTx.objectStore(LINK_STORE).delete(fingerprint));
            await done;
        }
        return record;
    }

    async getStats(): Promise<WorkingStateStats> {
        const db = await this.db;
        const tx = db.transaction([PROJECT_STORE, LINK_STORE], 'readonly');
        const projectStore = tx.objectStore(PROJECT_STORE);
        const linkStore = tx.objectStore(LINK_STORE);
        const projects = await getAll<WorkingProjectRecord>(projectStore);
        const links = await getAll<ProjectLinkRecord>(linkStore);
        return {
            projectCount: projects.length,
            linkCount: links.length,
            totalBytes: summarizeProjects(projects)
        };
    }

    async clearAll(): Promise<WorkingStateCleanupResult> {
        const db = await this.db;
        const tx = db.transaction([PROJECT_STORE, LINK_STORE], 'readwrite');
        const done = waitForTransaction(tx);
        const projectStore = tx.objectStore(PROJECT_STORE);
        const linkStore = tx.objectStore(LINK_STORE);
        const projects = await getAll<WorkingProjectRecord>(projectStore);
        const links = await getAll<ProjectLinkRecord>(linkStore);
        const freedBytes = summarizeProjects(projects);

        await wrap(projectStore.clear());
        await wrap(linkStore.clear());
        await done;

        return {
            projectCount: 0,
            linkCount: 0,
            totalBytes: 0,
            removedProjects: projects.length,
            removedLinks: links.length,
            freedBytes
        };
    }

    async cleanup(options: WorkingStateCleanupOptions = {}): Promise<WorkingStateCleanupResult> {
        const keepProjectIds = new Set((options.keepProjectIds ?? []).filter(Boolean));
        const maxProjects = Math.max(0, options.maxProjects ?? MAX_WORKING_PROJECTS);
        const maxBytes = Math.max(0, options.maxBytes ?? MAX_WORKING_STATE_BYTES);

        const db = await this.db;
        const tx = db.transaction([PROJECT_STORE, LINK_STORE], 'readwrite');
        const done = waitForTransaction(tx);
        const projectStore = tx.objectStore(PROJECT_STORE);
        const linkStore = tx.objectStore(LINK_STORE);
        const projects = await getAll<WorkingProjectRecord>(projectStore);
        const links = await getAll<ProjectLinkRecord>(linkStore);
        const projectIds = new Set(projects.map(record => record.projectId));
        const removedLinkFingerprints = new Set<string>();

        let projectCount = projects.length;
        let totalBytes = summarizeProjects(projects);
        let removedProjects = 0;
        let removedLinks = 0;
        let freedBytes = 0;

        const deleteProjectLinks = async (projectId: string) => {
            for (const link of links) {
                if (link.projectId !== projectId || removedLinkFingerprints.has(link.fingerprint)) {
                    continue;
                }
                removedLinkFingerprints.add(link.fingerprint);
                removedLinks++;
                await wrap(linkStore.delete(link.fingerprint));
            }
        };

        for (const link of links) {
            if (projectIds.has(link.projectId) || removedLinkFingerprints.has(link.fingerprint)) {
                continue;
            }
            removedLinkFingerprints.add(link.fingerprint);
            removedLinks++;
            await wrap(linkStore.delete(link.fingerprint));
        }

        const removableProjects = projects.filter(
            record => !keepProjectIds.has(record.projectId)
        ).sort((lhs, rhs) => lhs.savedAt - rhs.savedAt);

        for (const record of removableProjects) {
            if (projectCount <= maxProjects && totalBytes <= maxBytes) {
                break;
            }
            await wrap(projectStore.delete(record.projectId));
            projectIds.delete(record.projectId);
            projectCount--;
            removedProjects++;
            const recordBytes = estimateRecordBytes(record);
            totalBytes -= recordBytes;
            freedBytes += recordBytes;
            await deleteProjectLinks(record.projectId);
        }

        await done;

        return {
            projectCount,
            linkCount: links.length - removedLinks,
            totalBytes: Math.max(0, totalBytes),
            removedProjects,
            removedLinks,
            freedBytes
        };
    }
}

const projectSaveStateStore = new ProjectSaveStateStore();

export { projectSaveStateStore };
export type {
    WorkingAssetKind,
    WorkingAssetStorage,
    WorkingAssetRecord,
    WorkingReferenceImageAssetRecord,
    WorkingProjectRecord,
    WorkingStateCleanupResult,
    WorkingStateStats
};
