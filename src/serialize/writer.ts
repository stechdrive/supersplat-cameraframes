// defines the interface for a stream writer class. all functions are async.
interface Writer {
    // write data to the stream
    write(data: Uint8Array): void | Promise<void>;

    // close the writing stream. return value depends on writer implementation.
    close(): any | Promise<any>;
}

// write data to a file stream
class FileStreamWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => void;

    constructor(stream: FileSystemWritableFileStream) {
        let cursor = 0n;
        const ready = stream.seek(0);

        this.write = async (data: Uint8Array) => {
            await ready;
            cursor += BigInt(data.byteLength);
            await stream.write(data as unknown as ArrayBuffer);
        };

        this.close = async () => {
            await ready;
            await stream.truncate(Number(cursor));
            await stream.close();
            return cursor;
        };
    }
}

// write data to a memory buffer
class BufferWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => Uint8Array[];

    constructor() {
        const buffers: Uint8Array[] = [];
        let buffer: Uint8Array;
        let cursor = 0;

        this.write = (data: Uint8Array) => {
            let readcursor = 0;

            while (readcursor < data.byteLength) {
                const readSize = data.byteLength - readcursor;

                // allocate buffer
                if (!buffer) {
                    buffer = new Uint8Array(Math.max(5 * 1024 * 1024, readSize));
                }

                const writeSize = buffer.byteLength - cursor;
                const copySize = Math.min(readSize, writeSize);

                buffer.set(data.subarray(readcursor, readcursor + copySize), cursor);

                readcursor += copySize;
                cursor += copySize;

                if (cursor === buffer.byteLength) {
                    buffers.push(buffer);
                    buffer = null;
                    cursor = 0;
                }
            }
        };

        this.close = () => {
            if (buffer) {
                buffers.push(new Uint8Array(buffer.buffer, 0, cursor));
                buffer = null;
                cursor = 0;
            }
            return buffers;
        };
    }
}

// write to a memory download buffer and trigger a browser download when closed
class DownloadWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => void;

    constructor(filename: string) {
        const triggerDownload = (url: string) => {
            const lnk = document.createElement('a');
            lnk.download = filename;
            lnk.href = url;

            if (document.createEvent) {
                const e = document.createEvent('MouseEvents');
                e.initMouseEvent('click', true, true, window,
                    0, 0, 0, 0, 0, false, false, false,
                    false, 0, null);
                lnk.dispatchEvent(e);
            } else {
                // @ts-ignore
                lnk.fireEvent?.('onclick');
            }
        };

        if (typeof TransformStream !== 'undefined') {
            const { readable, writable } = new TransformStream<Uint8Array>();
            const streamWriter = writable.getWriter();
            let closed = false;

            this.write = async (data: Uint8Array) => {
                await streamWriter.ready;
                await streamWriter.write(data);
            };

            this.close = async () => {
                if (closed) {
                    return;
                }
                closed = true;
                let url: string | null = null;
                try {
                    await streamWriter.close();
                    const response = new Response(readable, { headers: { 'Content-Type': 'application/octet-stream' } });
                    url = window.URL.createObjectURL(await response.blob());
                    triggerDownload(url);
                } finally {
                    if (url) {
                        window.URL.revokeObjectURL(url);
                    }
                }
            };
        } else {
            console.warn('DownloadWriter: TransformStream not supported, falling back to memory buffering');
            const bufferWriter = new BufferWriter();
            this.write = (data: Uint8Array) => {
                bufferWriter.write(data);
            };

            this.close = () => {
                const buffers = bufferWriter.close();
                const url = window.URL.createObjectURL(new Blob(buffers as unknown as ArrayBuffer[], { type: 'application/octet-stream' }));
                triggerDownload(url);
                window.URL.revokeObjectURL(url);
            };
        }
    }
}

// compress the incoming stream with gzip
class GZipWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => any | Promise<any>;

    constructor(writer: Writer) {
        const stream = new CompressionStream('gzip');
        const streamWriter = stream.writable.getWriter();
        const streamReader = stream.readable.getReader();

        // hook up the reader side of the compressed stream
        const reader = (async () => {
            while (true) {
                const { done, value } = await streamReader.read();
                if (done) break;
                await writer.write(value);
            }
        })();

        this.write = async (data: Uint8Array) => {
            await streamWriter.ready;
            await streamWriter.write(data as unknown as ArrayBuffer);
        };

        this.close = async () => {
            // close the writer, we're done
            await streamWriter.close();

            // wait for the reader to finish sending data
            await reader;
        };
    }
}

class ProgressWriter implements Writer {
    write: (data: Uint8Array) => void;
    close: () => any;

    constructor(writer: Writer, totalBytes: number | bigint, progress?: (progress: number, total: number) => void, strict = false) {
        const total = typeof totalBytes === 'bigint' ? totalBytes : BigInt(totalBytes);
        let cursor = 0n;

        this.write = async (data: Uint8Array) => {
            cursor += BigInt(data.byteLength);
            await writer.write(data);
            progress?.(Number(cursor), Number(total));
        };

        this.close = () => {
            if (strict && cursor !== total) {
                throw new Error(`ProgressWriter: expected ${total} bytes, but wrote ${cursor} bytes`);
            }
            progress?.(Number(cursor), Number(total));
            return cursor;
        };
    }
}

export { Writer, FileStreamWriter, BufferWriter, DownloadWriter, GZipWriter, ProgressWriter };
