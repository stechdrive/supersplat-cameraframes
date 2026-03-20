const workerGlobal = globalThis as any;

workerGlobal.window ??= workerGlobal;
workerGlobal.self ??= workerGlobal;
workerGlobal.devicePixelRatio ??= 1;
workerGlobal.matchMedia ??= (query: string) => ({
    matches: false,
    media: query,
    onchange: null as ((...args: any[]) => unknown) | null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
});

import('./sog-serialize.worker-impl').catch((error) => {
    setTimeout(() => {
        throw error;
    });
});

export { };
