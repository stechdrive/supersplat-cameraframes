// 本体はRollupが生成する。生成前のlintと型検査にはこの契約を使用する。
declare const buildInfo: {
    cameraFramesVersion: string;
    timestamp: number;
    version: string;
};

export { buildInfo };
