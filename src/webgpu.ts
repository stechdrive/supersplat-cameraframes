let cachedAvailability: boolean | null = null;
let pendingAvailability: Promise<boolean> | null = null;

const canUseWebGPU = async (): Promise<boolean> => {
    if (cachedAvailability !== null) {
        return cachedAvailability;
    }

    if (!navigator.gpu?.requestAdapter) {
        cachedAvailability = false;
        return cachedAvailability;
    }

    if (!pendingAvailability) {
        pendingAvailability = navigator.gpu.requestAdapter()
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
