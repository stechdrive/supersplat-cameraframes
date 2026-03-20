import { preferredGpuPowerPreference } from './gpu-preference';

let cachedAvailability: boolean | null = null;
let pendingAvailability: Promise<boolean> | null = null;

const canUseWebGPU = (): Promise<boolean> => {
    if (cachedAvailability !== null) {
        return Promise.resolve(cachedAvailability);
    }

    if (!navigator.gpu?.requestAdapter) {
        cachedAvailability = false;
        return Promise.resolve(cachedAvailability);
    }

    if (!pendingAvailability) {
        pendingAvailability = navigator.gpu.requestAdapter({
            powerPreference: preferredGpuPowerPreference
        })
        .then((adapter) => {
            cachedAvailability = !!adapter;
            return cachedAvailability;
        })
        .catch(() => {
            cachedAvailability = false;
            return cachedAvailability;
        })
        .finally(() => {
            pendingAvailability = null;
        });
    }

    return pendingAvailability;
};

export { canUseWebGPU };
