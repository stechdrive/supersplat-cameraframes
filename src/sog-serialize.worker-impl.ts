import {
    Column,
    DataTable,
    logger as splatTransformLogger,
    MemoryFileSystem,
    WebPCodec,
    writeSog as writeSogInternal,
    type Logger,
    type ProgressNode
} from '@playcanvas/splat-transform';
import {
    PIXELFORMAT_BGRA8,
    Texture,
    WebgpuGraphicsDevice
} from 'playcanvas';

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

type SerializeMessage = {
    type: 'serialize';
    token: number;
    filename: string;
    iterations: number;
    columns: WorkerColumn[];
};

type WorkerRequest = SerializeMessage;

type WorkerScope = {
    postMessage: (message: unknown, transfer?: readonly unknown[]) => void;
    addEventListener: typeof globalThis.addEventListener;
};

const workerContext = globalThis as unknown as WorkerScope;

let cachedGpuDevice: WebgpuGraphicsDevice | null = null;
let cachedBackbuffer: Texture | null = null;
WebPCodec.wasmUrl ??= new URL('./static/lib/webp/webp.wasm', import.meta.url).toString();

const createGpuDevice = async (): Promise<WebgpuGraphicsDevice> => {
    if (cachedGpuDevice) {
        return cachedGpuDevice;
    }

    if (!navigator.gpu) {
        throw new Error('WebGPU is not available in this worker');
    }

    const canvas = new OffscreenCanvas(1024, 512);
    const graphicsDevice = new WebgpuGraphicsDevice(canvas as any, {
        antialias: false,
        depth: false,
        stencil: false
    });

    await graphicsDevice.createDevice();

    cachedBackbuffer = new Texture(graphicsDevice, {
        width: 1024,
        height: 512,
        name: 'SogComputeBackbufferWorker',
        mipmaps: false,
        format: PIXELFORMAT_BGRA8
    });

    // @ts-ignore - externalBackbuffer is internal
    graphicsDevice.externalBackbuffer = cachedBackbuffer;
    cachedGpuDevice = graphicsDevice;
    return graphicsDevice;
};

const createProgressLogger = (token: number): Logger => ({
    log: () => {},
    warn: console.warn,
    error: console.error,
    debug: () => {},
    output: () => {},
    onProgress: (node: ProgressNode) => {
        if (node.depth === 0) {
            if (node.step > 0) {
                workerContext.postMessage({
                    type: 'progress',
                    token,
                    text: `Step ${node.step} of ${node.totalSteps}: ${node.stepName ?? ''}`,
                    progress: 0
                });
            }
        } else {
            workerContext.postMessage({
                type: 'progress',
                token,
                text: `Step ${node.parent?.step ?? node.step} of ${node.parent?.totalSteps ?? node.totalSteps}: ${node.parent?.stepName ?? node.stepName ?? ''}`,
                progress: 100 * node.step / node.totalSteps
            });
        }
    }
});

const serialize = async (message: SerializeMessage) => {
    const dataTable = new DataTable(message.columns.map(column => new Column(column.name, column.data)));
    const fs = new MemoryFileSystem();

    splatTransformLogger.setLogger(createProgressLogger(message.token));

    await writeSogInternal({
        filename: message.filename,
        dataTable,
        bundle: true,
        iterations: message.iterations,
        createDevice: createGpuDevice
    }, fs);

    const data = fs.results.get(message.filename);
    if (!data) {
        throw new Error(`Failed to serialize '${message.filename}' as SOG`);
    }

    const copy = new Uint8Array(data.byteLength);
    copy.set(data);

    workerContext.postMessage({
        type: 'done',
        token: message.token,
        data: copy.buffer
    }, [copy.buffer]);
};

workerContext.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
    const message = event.data;

    if (message.type !== 'serialize') {
        return;
    }

    try {
        await serialize(message);
    } catch (error) {
        workerContext.postMessage({
            type: 'error',
            token: message.token,
            error: `${(error as Error)?.message ?? error}`
        });
    }
});

workerContext.postMessage({ type: 'ready' });
