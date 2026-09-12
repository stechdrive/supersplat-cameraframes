export type ShotCamera = {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number, number];
    projection: 'perspective' | 'ortho';
    fovY: number;
    orthoHalfHeight: number;
    near: number;
    far: number;
};

export type FrameComposition = {
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    anchorX: number;
    anchorY: number;
};

export type Frustum = { left: number; right: number; bottom: number; top: number; near: number; far: number };
export type Gate = { x: number; y: number; width: number; height: number };
export type Preview = { width: number; height: number; gate: Gate };
export type RenderView = ReturnType<typeof resolveView>;

const positive = (value: number, name: string) => {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} は正の有限値が必要です`);
};

export const resolveView = (camera: ShotCamera, frame: FrameComposition, preview?: Preview) => {
    const shot = structuredClone(camera);
    const composition = structuredClone(frame);
    if (shot.position.length !== 3 || shot.rotation.length !== 4 ||
        ![...shot.position, ...shot.rotation].every(Number.isFinite)) throw new Error('撮影姿勢が不正です');
    const length = Math.hypot(...shot.rotation);
    positive(length, 'Quaternion');
    shot.rotation = shot.rotation.map(value => value / length) as ShotCamera['rotation'];
    if (!['perspective', 'ortho'].includes(shot.projection)) throw new Error('投影方式が不正です');
    positive(shot.near, 'near');
    positive(shot.far - shot.near, 'far - near');
    positive(shot.orthoHalfHeight, 'orthoHalfHeight');
    if (!(shot.fovY > 0 && shot.fovY < 180)) throw new Error('fovY が不正です');
    for (const key of ['width', 'height', 'scaleX', 'scaleY'] as const) positive(frame[key], key);
    for (const key of ['anchorX', 'anchorY'] as const) {
        if (!(frame[key] >= 0 && frame[key] <= 1)) throw new Error(`${key} が不正です`);
    }
    const baseHeight = 2 * (shot.projection === 'ortho' ? shot.orthoHalfHeight : shot.near * Math.tan(shot.fovY * Math.PI / 360));
    const baseWidth = baseHeight * frame.width / frame.height;
    const fw = baseWidth * frame.scaleX;
    const fh = baseHeight * frame.scaleY;
    const left = -baseWidth / 2 + frame.anchorX * (baseWidth - fw);
    const top = baseHeight / 2 - frame.anchorY * (baseHeight - fh);
    const outputFrustum: Frustum = { left, right: left + fw, bottom: top - fh, top, near: shot.near, far: shot.far };
    const outputSize = { width: Math.round(frame.width * frame.scaleX), height: Math.round(frame.height * frame.scaleY) };
    positive(outputSize.width, 'output width');
    positive(outputSize.height, 'output height');
    const size = preview ? { width: preview.width, height: preview.height } : outputSize;
    const gate = preview ? { ...preview.gate } : { x: 0, y: 0, ...outputSize };
    positive(size.width, 'viewport width');
    positive(size.height, 'viewport height');
    positive(gate.width, 'gate width');
    positive(gate.height, 'gate height');
    if (![gate.x, gate.y].every(Number.isFinite)) throw new Error('gate の位置が不正です');
    const px = fw / gate.width;
    const py = fh / gate.height;
    const viewLeft = left - gate.x * px;
    const viewTop = top + gate.y * py;
    const frustum: Frustum = {
        ...outputFrustum,
        left: viewLeft,
        right: viewLeft + size.width * px,
        top: viewTop,
        bottom: viewTop - size.height * py
    };
    const width = frustum.right - frustum.left;
    const height = frustum.top - frustum.bottom;
    const lens = {
        aspect: width / height,
        fovY: 2 * Math.atan(height / (2 * shot.near)) * 180 / Math.PI,
        orthoHalfHeight: height / 2,
        offsetX: (frustum.right + frustum.left) / width,
        offsetY: (frustum.top + frustum.bottom) / height
    };
    // raw な主点。出力枠外も位置を保ち、pick の clamp を流用しない。
    const opticalAxis = { x: (1 - lens.offsetX) * size.width / 2, y: (1 + lens.offsetY) * size.height / 2 };
    Object.freeze(shot.position);
    Object.freeze(shot.rotation);
    return Object.freeze({
        shot: Object.freeze(shot),
        composition: Object.freeze(composition),
        outputSize: Object.freeze(outputSize),
        size: Object.freeze(size),
        gate: Object.freeze(gate),
        frustum: Object.freeze(frustum),
        outputFrustum: Object.freeze(outputFrustum),
        lens: Object.freeze(lens),
        opticalAxis: Object.freeze(opticalAxis)
    });
};
