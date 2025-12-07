import { ReadSource } from '../serialize/read-source';

interface AssetSource {
    filename?: string;
    url?: string;
    contents?: Blob | File | Response;
    animationFrame?: boolean;                                   // animations disable morton re-ordering at load time for faster loading
    mapUrl?: (name: string) => string;                          // function to map texture names to URLs
    mapFile?: (name: string) => AssetSource | null;             // function to map names to files
}

// create a read source, optionally as a range request (on either URL or File)
const createReadSource = async (assetSource: AssetSource, start?: number, end?: number) => {
    let source;
    const hasRange = start !== undefined && end !== undefined;

    if (assetSource.contents) {
        if (assetSource.contents instanceof Response) {
            source = assetSource.contents.clone();
        } else if (hasRange) {
            source = assetSource.contents.slice(start, end);
        } else {
            source = assetSource.contents;
        }
    } else if (!hasRange) {
        source = assetSource.url ?? assetSource.filename;
    } else {
        source = await fetch(assetSource.url ?? assetSource.filename, { headers: { 'Range': `bytes=${start}-${end - 1}` } });
    }
    return new ReadSource(source);
};

export type { AssetSource };

export { createReadSource };
