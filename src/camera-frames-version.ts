import pkg from '../package.json';

// CAMERA FRAMES 固有のバージョンを package.json から公開する。
// フォーク側でのみ管理する値のため、Supersplat本体の version とは分離している。
export const cameraFramesVersion: string = (pkg as any)?.cameraFramesVersion ?? 'v2.21.12';
