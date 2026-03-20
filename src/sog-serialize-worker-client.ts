import { DataTable } from '@playcanvas/splat-transform';

type TypedArray =
    Int8Array |
    Uint8Array |
    Int16Array |
    Uint16Array |
    Int32Array |
    Uint32Array |
    Float32Array |
    Float64Array;

type WorkerColumn = {
    name: string;
    data: TypedArray;
};

type ProgressUpdate = {
    text: string;
    progress: number;
};

type SerializeRequest = {
    filename: string;
    dataTable: DataTable;
    iterations: number;
    onProgress?: (update: ProgressUpdate) => void;
};

type PendingRequest = {
    resolve: (value: Uint8Array) => void;
    reject: (reason?: unknown) => void;
    onProgress?: (update: ProgressUpdate) => void;
};

type WorkerMessage =
    | { type: 'ready' }
    | { type: 'progress'; token: number; text: string; progress: number }
    | { type: 'done'; token: number; data: ArrayBuffer }
    | { type: 'error'; token: number; error: string };

class ExternalPromise<T> {
    promise: Promise<T>;
    resolve!: (value: T | PromiseLike<T>) => void;
    reject!: (reason?: unknown) => void;

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

class SogSerializeWorkerClient {
    private worker: Worker;
    private ready: ExternalPromise<void>;
    private pending = new Map<number, PendingRequest>();
    private token = 1;

    constructor() {
        this.ready = new ExternalPromise<void>();
        this.worker = new Worker(new URL('sog-serialize.worker.js', document.baseURI), { type: 'module' });

        this.worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
            const message = event.data;
            if (message.type === 'ready') {
                this.ready.resolve();
                return;
            }

            const pending = this.pending.get(message.token);
            if (!pending) {
                return;
            }

            if (message.type === 'progress') {
                pending.onProgress?.({
                    text: message.text,
                    progress: message.progress
                });
                return;
            }

            this.pending.delete(message.token);

            if (message.type === 'done') {
                pending.resolve(new Uint8Array(message.data));
                return;
            }

            pending.reject(new Error(message.error));
        });

        this.worker.addEventListener('error', (event) => {
            const error = event.error ?? new Error(event.message);
            this.ready.reject(error);
            this.rejectAll(error);
        });
    }

    private rejectAll(error: unknown) {
        const entries = Array.from(this.pending.values());
        this.pending.clear();
        entries.forEach(entry => entry.reject(error));
    }

    async serialize({ filename, dataTable, iterations, onProgress }: SerializeRequest) {
        await this.ready.promise;

        const token = this.token++;
        const columns = dataTable.columns.map(column => ({
            name: column.name,
            data: column.data
        })) as WorkerColumn[];

        const transfer = Array.from(new Set(columns.map(column => column.data.buffer)));
        const result = new ExternalPromise<Uint8Array>();
        this.pending.set(token, {
            resolve: result.resolve,
            reject: result.reject,
            onProgress
        });

        this.worker.postMessage({
            type: 'serialize',
            token,
            filename,
            iterations,
            columns
        }, transfer);

        return await result.promise;
    }
}

let client: SogSerializeWorkerClient | null = null;

const getSogSerializeWorkerClient = () => {
    client ??= new SogSerializeWorkerClient();
    return client;
};

const serializeSogInWorker = async (request: SerializeRequest) => {
    return await getSogSerializeWorkerClient().serialize(request);
};

export { serializeSogInWorker };
