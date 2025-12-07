// ZipReader: ランダムアクセス可能な ZIP リーダー (ストリーミング対応)
// Central Directory を解析し、個別ファイルを ReadableStream/Blob/Text として取得する。

type ZipEntry = {
    filename: string;
    offset: number;
    compressedSize: number;
    uncompressedSize: number;
    compression: number;
    flags: number;
};

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

        const { offset, compressedSize, compression } = entry;

        // ローカルヘッダを読んでデータ開始位置を求める
        const header = await this.readRange(offset, offset + 30);
        const headerView = new DataView(header);
        if (headerView.getUint32(0, true) !== 0x04034b50) {
            throw new Error(`Invalid local file header for ${name}`);
        }

        const nameLength = headerView.getUint16(26, true);
        const extraLength = headerView.getUint16(28, true);
        const dataStart = offset + 30 + nameLength + extraLength;
        const dataEnd = dataStart + compressedSize;

        const dataStream = this.source.slice(dataStart, dataEnd).stream();

        if (compression === 0) {
            return dataStream;
        }

        if (compression === 8) {
            const inflate = new DecompressionStream('deflate-raw');
            return dataStream.pipeThrough(inflate);
        }

        throw new Error(`Unsupported compression method ${compression} for ${name}`);
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
            if (tailView.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }

        if (eocdOffset < 0) {
            throw new Error('End of central directory not found');
        }

        const centralDirSize = tailView.getUint32(eocdOffset + 12, true);
        const centralDirOffset = tailView.getUint32(eocdOffset + 16, true);

        const cdBuffer = await this.readRange(centralDirOffset, centralDirOffset + centralDirSize);
        const cdView = new DataView(cdBuffer);
        const decoder = new TextDecoder();

        let cursor = 0;
        while (cursor + 46 <= cdBuffer.byteLength) {
            if (cdView.getUint32(cursor, true) !== 0x02014b50) {
                break;
            }

            const flags = cdView.getUint16(cursor + 8, true);
            const compression = cdView.getUint16(cursor + 10, true);
            const compressedSize = cdView.getUint32(cursor + 20, true);
            const uncompressedSize = cdView.getUint32(cursor + 24, true);
            const filenameLength = cdView.getUint16(cursor + 28, true);
            const extraLength = cdView.getUint16(cursor + 30, true);
            const commentLength = cdView.getUint16(cursor + 32, true);
            const localHeaderOffset = cdView.getUint32(cursor + 42, true);

            const nameBytes = new Uint8Array(cdBuffer, cursor + 46, filenameLength);
            const filename = decoder.decode(nameBytes);

            this.entries.set(filename, {
                filename,
                offset: localHeaderOffset,
                compressedSize,
                uncompressedSize,
                compression,
                flags
            });

            cursor += 46 + filenameLength + extraLength + commentLength;
        }
    }
}

export { ZipReader };
