import { readPsd, writePsd } from 'ag-psd';

import { imageData, straightPixels } from './capture';

export const exportMaskPsd = (source: Uint8Array, front: Uint8Array, composite: Uint8Array, width: number, height: number) => {
    const raw = straightPixels(source);
    const mask = new Uint8ClampedArray(source.length);
    const masked = new Uint8ClampedArray(raw);
    for (let i = 0; i < mask.length; i += 4) {
        const transmittance = 255 - front[i + 3];
        mask.set([transmittance, transmittance, transmittance, 255], i);
        // source alpha は layer 側にだけ残す。マスクに二重に掛けない。
        masked[i + 3] = Math.round(raw[i + 3] * transmittance / 255);
    }
    // 初回は GLB 一層のマスク付き素材。全シーンの汎用レイヤー分解はここでは行わない。
    const bytes = new Uint8Array(writePsd({
        width,
        height,
        imageData: imageData(masked, width, height),
        children: [
            { name: '全体合成（比較用）', hidden: true, imageData: imageData(straightPixels(composite), width, height) },
            {
                name: 'GLB 元画像',
                imageData: imageData(raw, width, height),
                mask: { top: 0, left: 0, bottom: height, right: width, defaultColor: 255, imageData: imageData(mask, width, height) }
            }
        ]
    }, { compress: false }));
    const decoded = readPsd(bytes, { useImageData: true });
    const layer = decoded.children![1];
    const sourceData = layer.imageData!.data;
    const maskData = layer.mask!.imageData!.data;
    let maxSourceError = 0;
    let maxMaskError = 0;
    for (let i = 0; i < raw.length; i++) maxSourceError = Math.max(maxSourceError, Math.abs(raw[i] - sourceData[i]));
    for (let i = 0; i < mask.length; i += 4) maxMaskError = Math.max(maxMaskError, Math.abs(mask[i] - maskData[i]));
    return { bytes, raw, mask, masked, maxSourceError, maxMaskError };
};
