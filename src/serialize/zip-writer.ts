import { Crc } from './crc';
import { Writer } from './writer';

type ZipWriterOptions = {
    zip64?: boolean;
};

type ZipEntry = {
    nameBytes: Uint8Array;
    crc: Crc;
    compressedSize: bigint;
    uncompressedSize: bigint;
    offset: bigint;
    useZip64: boolean;
};

const UINT32_MAX = 0xffffffffn;

class ZipWriter implements Writer {
    start: (filename: string) => Promise<void>;
    write: (data: Uint8Array) => Promise<void>;
    close: () => Promise<void>;

    private writer: Writer;
    private entries: ZipEntry[] = [];
    private compressor: CompressionStream | null = null;
    private compressorWriter: WritableStreamDefaultWriter<BufferSource> | null = null;
    private compressorReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private pumpPromise: Promise<void> | null = null;
    private activeEntry: ZipEntry | null = null;
    private offset = 0n;
    private readonly opts: ZipWriterOptions;
    private readonly dosTime: number;
    private readonly dosDate: number;
    private closed = false;
    private readonly textEncoder = new TextEncoder();

    constructor(writer: Writer, options?: ZipWriterOptions) {
        this.writer = writer;
        this.opts = options ?? {};

        const date = new Date();
        this.dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
        this.dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

        this.start = this.startImpl.bind(this);
        this.write = this.writeImpl.bind(this);
        this.close = this.closeImpl.bind(this);
    }

    async file(filename: string, content: string | Uint8Array | Uint8Array[]) {
        await this.start(filename);

        if (typeof content === 'string') {
            await this.write(this.textEncoder.encode(content));
        } else if (content instanceof Uint8Array) {
            await this.write(content);
        } else {
            for (let i = 0; i < content.length; i++) {
                await this.write(content[i]);
            }
        }
    }

    private async startImpl(filename: string) {
        if (this.closed) {
            throw new Error('ZipWriter is already closed');
        }

        await this.finalizeEntry();

        const nameBytes = this.textEncoder.encode(filename);
        const useZip64Header = this.opts.zip64 ?? false;
        const extra = useZip64Header ? this.createZip64ExtraField(0n, 0n) : new Uint8Array(0);

        const header = new Uint8Array(30 + nameBytes.length + extra.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, useZip64Header ? 45 : 20, true);
        view.setUint16(6, 0x8 | 0x800, true); // data descriptor + UTF-8
        view.setUint16(8, 8, true);           // deflate
        view.setUint16(10, this.dosTime, true);
        view.setUint16(12, this.dosDate, true);
        view.setUint32(14, 0, true);          // crc placeholder
        view.setUint32(18, useZip64Header ? 0xffffffff : 0, true);
        view.setUint32(22, useZip64Header ? 0xffffffff : 0, true);
        view.setUint16(26, nameBytes.length, true);
        view.setUint16(28, extra.length, true);
        header.set(nameBytes, 30);
        header.set(extra, 30 + nameBytes.length);

        await this.writer.write(header);
        this.offset += BigInt(header.byteLength);

        const entry: ZipEntry = {
            nameBytes,
            crc: new Crc(),
            compressedSize: 0n,
            uncompressedSize: 0n,
            offset: this.offset - BigInt(header.byteLength),
            useZip64: useZip64Header
        };

        this.activeEntry = entry;
        this.compressor = new CompressionStream('deflate-raw');
        this.compressorWriter = this.compressor.writable.getWriter();
        this.compressorReader = this.compressor.readable.getReader();
        this.startPump(entry);
    }

    private async writeImpl(data: Uint8Array) {
        if (!this.activeEntry || !this.compressorWriter) {
            throw new Error('ZipWriter.write called before start');
        }
        this.activeEntry.uncompressedSize += BigInt(data.byteLength);
        this.activeEntry.crc.update(data);
        await this.compressorWriter.write(data as unknown as BufferSource);
    }

    private async closeImpl() {
        if (this.closed) {
            return;
        }
        await this.finalizeEntry();

        const centralDirOffset = this.offset;
        let centralDirSize = 0n;

        for (const entry of this.entries) {
            const record = this.createCentralDirectoryRecord(entry);
            centralDirSize += BigInt(record.byteLength);
            await this.writer.write(record);
            this.offset += BigInt(record.byteLength);
        }

        const needsZip64 =
            (this.opts.zip64 ?? false) ||
            centralDirOffset > UINT32_MAX ||
            centralDirSize > UINT32_MAX ||
            this.entries.some(e => e.useZip64);

        let zip64EocdOffset = centralDirOffset + centralDirSize;
        if (needsZip64) {
            const zip64Eocd = this.createZip64Eocd(centralDirSize, centralDirOffset);
            await this.writer.write(zip64Eocd);
            this.offset += BigInt(zip64Eocd.byteLength);
            zip64EocdOffset = centralDirOffset + centralDirSize;

            const locator = this.createZip64Locator(zip64EocdOffset);
            await this.writer.write(locator);
            this.offset += BigInt(locator.byteLength);
        }

        const eocd = this.createEocd(centralDirSize, centralDirOffset, needsZip64);
        await this.writer.write(eocd);
        this.offset += BigInt(eocd.byteLength);

        this.closed = true;
    }

    private startPump(entry: ZipEntry) {
        if (!this.compressorReader) {
            return;
        }
        this.pumpPromise = (async () => {
            while (this.compressorReader) {
                const { value, done } = await this.compressorReader.read();
                if (value && value.byteLength > 0) {
                    entry.compressedSize += BigInt(value.byteLength);
                    this.offset += BigInt(value.byteLength);
                    await this.writer.write(value);
                }
                if (done) {
                    break;
                }
            }
        })();
    }

    private async flushCompressor() {
        if (!this.compressorWriter) {
            return;
        }

        try {
            await this.compressorWriter.close();
        } finally {
            if (this.pumpPromise) {
                await this.pumpPromise;
                this.pumpPromise = null;
            }
            this.compressor = null;
            this.compressorWriter = null;
            this.compressorReader = null;
        }
    }

    private async finalizeEntry() {
        if (!this.activeEntry) {
            return;
        }

        await this.flushCompressor();

        const entry = this.activeEntry;
        const needsZip64 = entry.useZip64 ||
            entry.compressedSize > UINT32_MAX ||
            entry.uncompressedSize > UINT32_MAX ||
            entry.offset > UINT32_MAX;

        if (needsZip64 && !(this.opts.zip64 ?? false)) {
            throw new Error('ZipWriter: entry exceeds ZIP32 limits but zip64 is disabled');
        }

        entry.useZip64 = needsZip64;

        const descriptor = new Uint8Array(needsZip64 ? 24 : 16);
        const view = new DataView(descriptor.buffer);
        view.setUint32(0, 0x08074b50, true);
        view.setUint32(4, entry.crc.value(), true);
        if (needsZip64) {
            view.setBigUint64(8, entry.compressedSize, true);
            view.setBigUint64(16, entry.uncompressedSize, true);
        } else {
            view.setUint32(8, Number(entry.compressedSize), true);
            view.setUint32(12, Number(entry.uncompressedSize), true);
        }

        await this.writer.write(descriptor);
        this.offset += BigInt(descriptor.byteLength);

        this.entries.push(entry);
        this.activeEntry = null;
    }

    private createZip64ExtraField(compressed: bigint, uncompressed: bigint) {
        const extra = new Uint8Array(4 + 16);
        const view = new DataView(extra.buffer);
        view.setUint16(0, 0x0001, true);
        view.setUint16(2, 16, true);
        view.setBigUint64(4, uncompressed, true);
        view.setBigUint64(12, compressed, true);
        return extra;
    }

    private createCentralDirectoryRecord(entry: ZipEntry) {
        const { nameBytes, crc, compressedSize, uncompressedSize, offset } = entry;
        const needsZip64 = entry.useZip64 ||
            compressedSize > UINT32_MAX ||
            uncompressedSize > UINT32_MAX ||
            offset > UINT32_MAX;

        const zip64Extra = needsZip64 ? (() => {
            const extra = new Uint8Array(4 + 24);
            const view = new DataView(extra.buffer);
            view.setUint16(0, 0x0001, true);
            view.setUint16(2, 24, true);
            view.setBigUint64(4, uncompressedSize, true);
            view.setBigUint64(12, compressedSize, true);
            view.setBigUint64(20, offset, true);
            return extra;
        })() : new Uint8Array(0);

        const record = new Uint8Array(46 + nameBytes.length + zip64Extra.length);
        const view = new DataView(record.buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, needsZip64 ? 45 : 20, true);   // version made by
        view.setUint16(6, needsZip64 ? 45 : 20, true);   // version needed to extract
        view.setUint16(8, 0x8 | 0x800, true);            // flags
        view.setUint16(10, 8, true);                     // deflate
        view.setUint16(12, this.dosTime, true);
        view.setUint16(14, this.dosDate, true);
        view.setUint32(16, crc.value(), true);
        view.setUint32(20, needsZip64 ? 0xffffffff : Number(compressedSize), true);
        view.setUint32(24, needsZip64 ? 0xffffffff : Number(uncompressedSize), true);
        view.setUint16(28, nameBytes.length, true);
        view.setUint16(30, zip64Extra.length, true);
        view.setUint16(32, 0, true);                     // comment length
        view.setUint16(34, 0, true);                     // disk number start
        view.setUint16(36, 0, true);                     // internal file attrs
        view.setUint32(38, 0, true);                     // external file attrs
        view.setUint32(42, needsZip64 ? 0xffffffff : Number(offset), true);

        record.set(nameBytes, 46);
        record.set(zip64Extra, 46 + nameBytes.length);
        return record;
    }

    private createZip64Eocd(centralDirSize: bigint, centralDirOffset: bigint) {
        const record = new Uint8Array(56);
        const view = new DataView(record.buffer);
        view.setUint32(0, 0x06064b50, true);
        view.setBigUint64(4, BigInt(record.byteLength - 12), true);
        view.setUint16(12, 45, true);
        view.setUint16(14, 45, true);
        view.setUint32(16, 0, true); // disk number
        view.setUint32(20, 0, true); // start disk
        view.setBigUint64(24, BigInt(this.entries.length), true);
        view.setBigUint64(32, BigInt(this.entries.length), true);
        view.setBigUint64(40, centralDirSize, true);
        view.setBigUint64(48, centralDirOffset, true);
        return record;
    }

    private createZip64Locator(zip64EocdOffset: bigint) {
        const locator = new Uint8Array(20);
        const view = new DataView(locator.buffer);
        view.setUint32(0, 0x07064b50, true);
        view.setUint32(4, 0, true); // disk with zip64 eocd
        view.setBigUint64(8, zip64EocdOffset, true);
        view.setUint32(16, 1, true); // total disks
        return locator;
    }

    private createEocd(centralDirSize: bigint, centralDirOffset: bigint, useZip64: boolean) {
        const eocd = new Uint8Array(22);
        const view = new DataView(eocd.buffer);
        view.setUint32(0, 0x06054b50, true);
        view.setUint16(4, useZip64 ? 0xffff : 0, true);
        view.setUint16(6, useZip64 ? 0xffff : 0, true);
        view.setUint16(8, useZip64 ? 0xffff : this.entries.length, true);
        view.setUint16(10, useZip64 ? 0xffff : this.entries.length, true);
        view.setUint32(12, useZip64 ? 0xffffffff : Number(centralDirSize), true);
        view.setUint32(16, useZip64 ? 0xffffffff : Number(centralDirOffset), true);
        view.setUint16(20, 0, true); // comment length
        return eocd;
    }
}

export { ZipWriter };
