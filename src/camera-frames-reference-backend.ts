import type { Events } from './events';

type CameraFramesReferenceBackend = {
    canSetActivePreset: () => boolean;
    setActivePreset: (presetId: string) => Promise<void>;
    setActivePresetSafe: (presetId: string) => void;
};

type CreateReferenceBackendParams = {
    events: Events;
};

const createSupersplatCameraFramesReferenceBackend = ({
    events
}: CreateReferenceBackendParams): CameraFramesReferenceBackend => {
    const canSetActivePreset = () => events.functions.has('referenceImages.setActivePreset');

    const setActivePreset = async (presetId: string) => {
        await events.invoke('referenceImages.setActivePreset', presetId);
    };

    const setActivePresetSafe = (presetId: string) => {
        setActivePreset(presetId).catch((): void => undefined);
    };

    return {
        canSetActivePreset,
        setActivePreset,
        setActivePresetSafe
    };
};

export { createSupersplatCameraFramesReferenceBackend };
export type { CameraFramesReferenceBackend };
