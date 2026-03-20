import { type FileSystem, type Writer } from '@playcanvas/splat-transform';

type ZipEntryRecord = {
    filename: Uint8Array;
    method: number;
    crc32: number;
    compressedSize: number;
    uncompressedSize: number;
    offset: number;
};

const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

const updateCrc32 = (crc32: number, data: Uint8Array) => {
    let crc = crc32 ^ 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const createDataDescriptor = (entry: ZipEntryRecord) => {
    const data = new Uint8Array(16);
    const view = new DataView(data.buffer);
    view.setUint32(0, 0x08074b50, true);
    view.setUint32(4, entry.crc32, true);
    view.setUint32(8, entry.compressedSize, true);
    view.setUint32(12, entry.uncompressedSize, true);
    return data;
};

const yieldToBrowser = async () => {
    await new Promise<void>((resolve) => {
        setTimeout(resolve);
    });
};

const createCooperativeYield = (budgetMs = 16) => {
    let lastYieldAt = performance.now();
    return async (force = false) => {
        const now = performance.now();
        if (force || now - lastYieldAt >= budgetMs) {
            await yieldToBrowser();
            lastYieldAt = performance.now();
        }
    };
};

class DeflateZipEntryWriter implements Writer {
    private readonly writeChunk: (data: Uint8Array) => Promise<void>;
    private readonly cooperativeYield: (force?: boolean) => Promise<void>;
    private readonly entry: ZipEntryRecord;
    private readonly useCompression: boolean;
    private readonly compressionWriter: any;
    private readonly pumpPromise: Promise<void> | null;
    private closed = false;

    constructor(
        writeChunk: (data: Uint8Array) => Promise<void>,
        entry: ZipEntryRecord,
        useCompression: boolean,
        cooperativeYield: (force?: boolean) => Promise<void>
    ) {
        this.writeChunk = writeChunk;
        this.cooperativeYield = cooperativeYield;
        this.entry = entry;
        this.useCompression = useCompression;

        if (useCompression) {
            const compressionStream = new CompressionStream('deflate-raw' as any);
            this.compressionWriter = compressionStream.writable.getWriter();
            const reader = compressionStream.readable.getReader();
            this.pumpPromise = (async () => {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        break;
                    }
                    if (!value || value.byteLength === 0) {
                        continue;
                    }
                    this.entry.compressedSize += value.byteLength;
                    await this.writeChunk(value);
                    await this.cooperativeYield();
                }
            })();
        } else {
            this.compressionWriter = null;
            this.pumpPromise = null;
        }
    }

    async write(data: Uint8Array): Promise<void> {
        if (this.closed) {
            throw new Error('Cannot write to a closed zip entry');
        }

        this.entry.crc32 = updateCrc32(this.entry.crc32, data);
        this.entry.uncompressedSize += data.byteLength;

        if (this.useCompression) {
            await this.compressionWriter!.write(data);
            await this.cooperativeYield();
            return;
        }

        this.entry.compressedSize += data.byteLength;
        await this.writeChunk(data);
        await this.cooperativeYield();
    }

    async close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;

        if (this.useCompression) {
            await this.compressionWriter!.close();
            await this.pumpPromise;
        }

        await this.writeChunk(createDataDescriptor(this.entry));
    }
}

class DeflateZipFileSystem implements FileSystem {
    private readonly writer: Writer;
    private readonly entries: ZipEntryRecord[] = [];
    private readonly textEncoder = new TextEncoder();
    private readonly dosTime: number;
    private readonly dosDate: number;
    private readonly useCompression: boolean;
    private activeEntry: DeflateZipEntryWriter | null = null;
    private bytesWritten = 0;
    private writeQueue = Promise.resolve();
    private readonly cooperativeYield = createCooperativeYield();

    constructor(writer: Writer) {
        this.writer = writer;

        const date = new Date();
        this.dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
        this.dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
        this.useCompression = typeof CompressionStream === 'function';
    }

    private enqueueWrite(data: Uint8Array) {
        this.writeQueue = this.writeQueue.then(async () => {
            await this.writer.write(data);
            this.bytesWritten += data.byteLength;
        });
        return this.writeQueue;
    }

    private createLocalHeader(entry: ZipEntryRecord) {
        const header = new Uint8Array(30 + entry.filename.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x8 | 0x800, true);
        view.setUint16(8, entry.method, true);
        view.setUint16(10, this.dosTime, true);
        view.setUint16(12, this.dosDate, true);
        view.setUint16(26, entry.filename.length, true);
        header.set(entry.filename, 30);
        return header;
    }

    async createWriter(filename: string): Promise<Writer> {
        if (this.activeEntry) {
            await this.activeEntry.close();
            this.activeEntry = null;
        }

        const entry: ZipEntryRecord = {
            filename: this.textEncoder.encode(filename),
            method: this.useCompression ? 8 : 0,
            crc32: 0,
            compressedSize: 0,
            uncompressedSize: 0,
            offset: this.bytesWritten
        };

        this.entries.push(entry);
        await this.enqueueWrite(this.createLocalHeader(entry));
        this.activeEntry = new DeflateZipEntryWriter(
            data => this.enqueueWrite(data),
            entry,
            this.useCompression,
            this.cooperativeYield
        );
        return this.activeEntry;
    }

    mkdir(_path: string): Promise<void> {
        return Promise.resolve();
    }

    async close(): Promise<void> {
        if (this.activeEntry) {
            await this.activeEntry.close();
            this.activeEntry = null;
        }

        const centralDirectoryOffset = this.bytesWritten;
        for (const entry of this.entries) {
            const cdr = new Uint8Array(46 + entry.filename.length);
            const view = new DataView(cdr.buffer);
            view.setUint32(0, 0x02014b50, true);
            view.setUint16(4, 20, true);
            view.setUint16(6, 20, true);
            view.setUint16(8, 0x8 | 0x800, true);
            view.setUint16(10, entry.method, true);
            view.setUint16(12, this.dosTime, true);
            view.setUint16(14, this.dosDate, true);
            view.setUint32(16, entry.crc32, true);
            view.setUint32(20, entry.compressedSize, true);
            view.setUint32(24, entry.uncompressedSize, true);
            view.setUint16(28, entry.filename.length, true);
            view.setUint32(42, entry.offset, true);
            cdr.set(entry.filename, 46);
            await this.enqueueWrite(cdr);
            await this.cooperativeYield();
        }

        const centralDirectorySize = this.bytesWritten - centralDirectoryOffset;
        const eocd = new Uint8Array(22);
        const eocdView = new DataView(eocd.buffer);
        eocdView.setUint32(0, 0x06054b50, true);
        eocdView.setUint16(8, this.entries.length, true);
        eocdView.setUint16(10, this.entries.length, true);
        eocdView.setUint32(12, centralDirectorySize, true);
        eocdView.setUint32(16, centralDirectoryOffset, true);
        await this.enqueueWrite(eocd);

        await this.writeQueue;
        await this.cooperativeYield(true);
        await this.writer.close();
    }
}

export { DeflateZipFileSystem };
