// 私的な撮影素材を使わず、深度と編集結果が判定できる合成 fixture を生成する。
export const makePly = (side: 'red' | 'blue') => {
    const names = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
    const colors = side === 'red' ? [0.9, 0.06, 0.03] : [0.02, 0.2, 0.95];
    const sh = colors.map(value => (value - 0.5) / 0.28209479177387814);
    const rows = [-1, 1].map((sign) => {
        const z = (side === 'red' ? -sign : sign);
        // 同じ画面位置になるよう深度に応じて x/y/scale を調整。
        const depth = 5 - z;
        return [sign * 0.13 * depth, 0.055 * depth, z, ...sh, Math.log(0.65 / 0.35),
            Math.log(0.065 * depth), Math.log(0.065 * depth), Math.log(0.015), 1, 0, 0, 0];
    });
    const binary = new Uint8Array(rows.length * names.length * 4);
    const view = new DataView(binary.buffer);
    rows.flat().forEach((value, index) => view.setFloat32(index * 4, value, true));
    const header = ['ply', 'format binary_little_endian 1.0', 'element vertex 2', ...names.map(name => `property float ${name}`), 'end_header', ''].join('\n');
    return new File([header, binary], `${side}.ply`);
};

export const makeGlb = () => {
    const positions = new Float32Array([-1.45, -1.05, 0, 1.45, -1.05, 0, 1.45, 1.05, 0, -1.45, 1.05, 0]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const binary = new Uint8Array(positions.byteLength + indices.byteLength);
    binary.set(new Uint8Array(positions.buffer));
    binary.set(new Uint8Array(indices.buffer), positions.byteLength);
    const doc = {
        asset: { version: '2.0', generator: 'Camera Frames v3 proof' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
        materials: [{ doubleSided: true, extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorFactor: [0.2, 0.75, 0.12, 1] } }],
        extensionsUsed: ['KHR_materials_unlit'],
        buffers: [{ byteLength: binary.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-1.45, -1.05, 0], max: [1.45, 1.05, 0] },
            { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' }
        ]
    };
    const json = new TextEncoder().encode(JSON.stringify(doc));
    const padded = Math.ceil(json.length / 4) * 4;
    const result = new Uint8Array(12 + 8 + padded + 8 + binary.length);
    const view = new DataView(result.buffer);
    [0x46546c67, 2, result.length, padded, 0x4e4f534a].forEach((v, i) => view.setUint32(i * 4, v, true));
    result.fill(32, 20, 20 + padded);
    result.set(json, 20);
    view.setUint32(20 + padded, binary.length, true);
    view.setUint32(24 + padded, 0x004e4942, true);
    result.set(binary, 28 + padded);
    return new File([result], 'plane.glb', { type: 'model/gltf-binary' });
};
