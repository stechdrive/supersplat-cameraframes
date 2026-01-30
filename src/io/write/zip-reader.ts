// ZipReader: random-access ZIP reader (ZIP64/streaming).
// Parses the Central Directory and exposes entries as ReadableStream/Blob/Text.

type ZipEntry = {
    filename: string;
    offset: bigint;
    compressedSize: bigint;
    uncompressedSize: bigint;
    compression: number;
    flags: number;
};

const EOCD_SIG = 0x06054b50;
const EOCD64_SIG = 0x06064b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;
const UINT32_MAX = 0xffffffffn;

class ZipReader {
    private source: Blob;
    private entries = new Map<string, ZipEntry>();

    private constructor(source: Blob) {
        this.source = source;
    }

    static async from(source: Blob | ArrayBuffer) {
        const blob = source instanceof Blob ? source : new Blob([source]);
        const reader = new ZipReader(blob);
        await reader.readCentralDirectory();
        return reader;
    }

    listFilenames() {
        return Array.from(this.entries.keys());
    }

    getEntry(name: string) {
        return this.entries.get(name);
    }

    async stream(name: string): Promise<ReadableStream<Uint8Array>> {
        const entry = this.entries.get(name);
        if (!entry) {
            throw new Error(`Missing ${name} in archive`);
        }

        if (entry.offset > BigInt(Number.MAX_SAFE_INTEGER) || entry.compressedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error(`Entry ${name} is too large to stream in this environment`);
        }

        const header = await this.readRange(Number(entry.offset), Number(entry.offset + 30n));
        const headerView = new DataView(header);
        if (headerView.getUint32(0, true) !== LOCAL_HEADER_SIG) {
            throw new Error(`Invalid local file header for ${name}`);
        }

        const nameLength = headerView.getUint16(26, true);
        const extraLength = headerView.getUint16(28, true);
        const dataStart = entry.offset + BigInt(30 + nameLength + extraLength);
        const dataEnd = dataStart + entry.compressedSize;

        if (dataEnd > BigInt(this.source.size)) {
            throw new Error(`Corrupted entry ${name}: data extends past archive end`);
        }

        const dataStream = this.source.slice(Number(dataStart), Number(dataEnd)).stream();

        if (entry.compression === 0) {
            return dataStream;
        }

        if (entry.compression === 8) {
            const inflate = new DecompressionStream('deflate-raw');
            return dataStream.pipeThrough(inflate);
        }

        throw new Error(`Unsupported compression method ${entry.compression} for ${name}`);
    }

    async blob(name: string) {
        const stream = await this.stream(name);
        return await new Response(stream).blob();
    }

    async text(name: string) {
        const stream = await this.stream(name);
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let result = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            if (value) {
                result += decoder.decode(value, { stream: true });
            }
        }
        result += decoder.decode();
        return result;
    }

    private async readRange(start: number, end: number) {
        return await this.source.slice(start, end).arrayBuffer();
    }

    private async readCentralDirectory() {
        const searchWindow = Math.min(this.source.size, 0xffff + 22);
        const tail = await this.readRange(this.source.size - searchWindow, this.source.size);
        const tailView = new DataView(tail);

        let eocdOffset = -1;
        for (let i = searchWindow - 22; i >= 0; --i) {
            if (tailView.getUint32(i, true) === EOCD_SIG) {
                eocdOffset = i;
                break;
            }
        }

        if (eocdOffset < 0) {
            throw new Error('End of central directory not found');
        }

        const eocdAbsOffset = this.source.size - searchWindow + eocdOffset;
        const centralDirSize32 = tailView.getUint32(eocdOffset + 12, true);
        const centralDirOffset32 = tailView.getUint32(eocdOffset + 16, true);
        const entryCount32 = tailView.getUint16(eocdOffset + 10, true);
        const needsZip64 = centralDirSize32 === 0xffffffff || centralDirOffset32 === 0xffffffff || entryCount32 === 0xffff;

        let centralDirSize = BigInt(centralDirSize32);
        let centralDirOffset = BigInt(centralDirOffset32);
        let entryCount = BigInt(entryCount32);

        if (needsZip64) {
            const locatorOffset = eocdAbsOffset - 20;
            if (locatorOffset < 0) {
                throw new Error('ZIP64 locator not found');
            }

            const locatorBuf = await this.readRange(locatorOffset, locatorOffset + 20);
            const locatorView = new DataView(locatorBuf);
            if (locatorView.getUint32(0, true) !== EOCD64_LOCATOR_SIG) {
                throw new Error('ZIP64 locator signature mismatch');
            }

            const eocd64Offset = Number(locatorView.getBigUint64(8, true));
            const eocd64Buf = await this.readRange(eocd64Offset, eocd64Offset + 56);
            const eocd64View = new DataView(eocd64Buf);
            if (eocd64View.getUint32(0, true) !== EOCD64_SIG) {
                throw new Error('ZIP64 end of central directory not found');
            }

            entryCount = eocd64View.getBigUint64(32, true);
            centralDirSize = eocd64View.getBigUint64(40, true);
            centralDirOffset = eocd64View.getBigUint64(48, true);
        }

        if (centralDirOffset > BigInt(Number.MAX_SAFE_INTEGER) || centralDirSize > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error('Central directory is too large to parse in this environment');
        }

        const cdBuffer = await this.readRange(Number(centralDirOffset), Number(centralDirOffset + centralDirSize));
        const cdView = new DataView(cdBuffer);
        const decoder = new TextDecoder();

        let cursor = 0;
        let parsedEntries = 0n;
        while (cursor + 46 <= cdBuffer.byteLength) {
            if (cdView.getUint32(cursor, true) !== CENTRAL_HEADER_SIG) {
                throw new Error('Invalid central directory signature');
            }

            const flags = cdView.getUint16(cursor + 8, true);
            const compression = cdView.getUint16(cursor + 10, true);
            const compressedSize32 = cdView.getUint32(cursor + 20, true);
            const uncompressedSize32 = cdView.getUint32(cursor + 24, true);
            const filenameLength = cdView.getUint16(cursor + 28, true);
            const extraLength = cdView.getUint16(cursor + 30, true);
            const commentLength = cdView.getUint16(cursor + 32, true);
            const localHeaderOffset32 = cdView.getUint32(cursor + 42, true);

            const nameBytes = new Uint8Array(cdBuffer, cursor + 46, filenameLength);
            const filename = decoder.decode(nameBytes);

            let compressedSize = BigInt(compressedSize32);
            let uncompressedSize = BigInt(uncompressedSize32);
            let localHeaderOffset = BigInt(localHeaderOffset32);

            const extraStart = cursor + 46 + filenameLength;
            const extraEnd = extraStart + extraLength;
            let extraCursor = extraStart;
            while (extraCursor + 4 <= extraEnd) {
                const headerId = cdView.getUint16(extraCursor, true);
                const dataSize = cdView.getUint16(extraCursor + 2, true);
                const dataStart = extraCursor + 4;
                extraCursor += 4 + dataSize;

                if (headerId === 0x0001) {
                    let offset = dataStart;
                    if (uncompressedSize32 === 0xffffffff) {
                        uncompressedSize = cdView.getBigUint64(offset, true);
                        offset += 8;
                    }
                    if (compressedSize32 === 0xffffffff) {
                        compressedSize = cdView.getBigUint64(offset, true);
                        offset += 8;
                    }
                    if (localHeaderOffset32 === 0xffffffff) {
                        localHeaderOffset = cdView.getBigUint64(offset, true);
                    }
                }
            }

            if (compression !== 0 && compression !== 8) {
                throw new Error(`Unsupported compression method ${compression} for ${filename}`);
            }

            this.entries.set(filename, {
                filename,
                offset: localHeaderOffset,
                compressedSize,
                uncompressedSize,
                compression,
                flags
            });

            cursor += 46 + filenameLength + extraLength + commentLength;
            parsedEntries++;
        }

        if (parsedEntries !== entryCount) {
            throw new Error('Central directory entry count mismatch');
        }
    }
}

export { ZipReader };
