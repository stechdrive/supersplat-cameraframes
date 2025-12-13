const DEFAULT_REFERENCE_IMAGE_FILENAME = 'reference-image';

const stripControlChars = (value: string) => {
    let result = '';
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 32 || code === 127) {
            continue;
        }
        result += value[i];
    }
    return result;
};

const normalizeReferenceImageFilename = (filename?: string) => {
    if (typeof filename !== 'string') {
        return DEFAULT_REFERENCE_IMAGE_FILENAME;
    }
    const base = filename.split(/[\\/]/).pop() ?? '';
    const trimmed = base.trim();
    const safe = stripControlChars(trimmed);
    if (!safe || safe === '.' || safe === '..') {
        return DEFAULT_REFERENCE_IMAGE_FILENAME;
    }
    return safe;
};

export { DEFAULT_REFERENCE_IMAGE_FILENAME, normalizeReferenceImageFilename };
