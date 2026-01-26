import { Color, createGraphicsDevice } from 'playcanvas';

import { registerCameraFrames } from './camera-frames';
import { CameraFramesHistory } from './camera-frames-history';
import { registerCameraHistory } from './camera-history';
import { registerCameraPosesEvents } from './camera-poses';
import { registerCameraSave } from './camera-save';
import { registerDocEvents } from './doc';
import { EditHistory } from './edit-history';
import { registerEditorEvents } from './editor';
import { Events } from './events';
import { initFileHandler } from './file-handler';
import { registerIframeApi } from './iframe-api';
import { MeshManager } from './mesh-manager';
import { registerPlySequenceEvents } from './ply-sequence';
import { registerPublishEvents } from './publish';
import { registerReferenceImages } from './reference-images-controller';
import { ReferenceImagesHistory } from './reference-images-history';
import { registerRenderEvents } from './render';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { registerSelectionEvents } from './selection';
import { ShortcutManager } from './shortcut-manager';
import { registerTimelineEvents } from './timeline';
import { BoxSelection } from './tools/box-selection';
import { BrushSelection } from './tools/brush-selection';
import { EyedropperSelection } from './tools/eyedropper-selection';
import { FloodSelection } from './tools/flood-selection';
import { LassoSelection } from './tools/lasso-selection';
import { MeasureTool } from './tools/measure-tool';
import { MoveTool } from './tools/move-tool';
import { PolygonSelection } from './tools/polygon-selection';
import { RectSelection } from './tools/rect-selection';
import { RotateTool } from './tools/rotate-tool';
import { ScaleTool } from './tools/scale-tool';
import { SphereSelection } from './tools/sphere-selection';
import { ToolManager } from './tools/tool-manager';
import { registerTransformHandlerEvents } from './transform-handler';
import { EditorUI } from './ui/editor';
import { localizeInit } from './ui/localization';

declare global {
    interface LaunchParams {
        readonly files: FileSystemFileHandle[];
    }

    interface Window {
        launchQueue: {
            setConsumer: (callback: (launchParams: LaunchParams) => void) => void;
        };
        scene: Scene;
    }
}

const getURLArgs = () => {
    // extract settings from command line in non-prod builds only
    const config = {};

    const apply = (key: string, value: string) => {
        let obj: any = config;
        key.split('.').forEach((k, i, a) => {
            if (i === a.length - 1) {
                obj[k] = value;
            } else {
                if (!obj.hasOwnProperty(k)) {
                    obj[k] = {};
                }
                obj = obj[k];
            }
        });
    };

    const params = new URLSearchParams(window.location.search.slice(1));
    params.forEach((value: string, key: string) => {
        apply(key, value);
    });

    return config;
};

const registerServiceWorkerUpdateBanner = (events: Events) => {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    let activeRegistration: ServiceWorkerRegistration | null = null;
    let lastNotifiedScript: string | null = null;

    const reloadForUpdate = () => {
        const waiting = activeRegistration?.waiting ?? null;
        if (waiting) {
            waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        window.location.reload();
    };

    const showBanner = (scriptUrl?: string) => {
        if (scriptUrl && scriptUrl === lastNotifiedScript) {
            return;
        }
        if (scriptUrl) {
            lastNotifiedScript = scriptUrl;
        }
        events.invoke('updateBanner.show', {
            onReload: reloadForUpdate,
            onDismiss: () => {
                events.invoke('updateBanner.hide');
            }
        });
    };

    const attachToRegistration = (registration: ServiceWorkerRegistration | null) => {
        if (!registration) {
            return;
        }
        activeRegistration = registration;

        if (registration.waiting && navigator.serviceWorker.controller) {
            showBanner(registration.waiting.scriptURL);
        }

        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) {
                return;
            }
            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                    showBanner(installing.scriptURL);
                }
            });
        });
    };

    navigator.serviceWorker.ready
    .then(registration => attachToRegistration(registration))
    .catch(() => {});

    navigator.serviceWorker.getRegistration()
    .then(registration => attachToRegistration(registration ?? null))
    .catch(() => {});

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            activeRegistration?.update().catch(() => {});
        }
    });
};

const main = async () => {
    // root events object
    const events = new Events();

    // url
    const url = new URL(window.location.href);

    // edit history
    const editHistory = new EditHistory(events);

    // init localization
    await localizeInit();

    // register events that only need the events object (before UI is created)
    registerTimelineEvents(events);
    registerCameraPosesEvents(events);
    registerTransformHandlerEvents(events);
    registerPlySequenceEvents(events);
    registerPublishEvents(events);
    registerIframeApi(events);

    // initialize shortcuts
    const shortcutManager = new ShortcutManager(events);
    events.function('shortcutManager', () => shortcutManager);

    // editor ui
    const editorUI = new EditorUI(events);
    registerServiceWorkerUpdateBanner(events);

    // create the graphics device
    const graphicsDevice = await createGraphicsDevice(editorUI.canvas, {
        deviceTypes: ['webgl2'],
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: false,
        powerPreference: 'high-performance'
    });

    const overrides = [
        getURLArgs()
    ];

    // resolve scene config
    const sceneConfig = getSceneConfig(overrides);

    // construct the manager
    const scene = new Scene(
        events,
        sceneConfig,
        editorUI.canvas,
        graphicsDevice
    );
    const meshManager = new MeshManager(events, scene);
    events.function('mesh.manager', () => meshManager);

    // colors
    const bgClr = new Color();
    const selectedClr = new Color();
    const unselectedClr = new Color();
    const lockedClr = new Color();

    const setClr = (target: Color, value: Color, event: string) => {
        if (!target.equals(value)) {
            target.copy(value);
            events.fire(event, target);
        }
    };

    const setBgClr = (clr: Color) => {
        setClr(bgClr, clr, 'bgClr');
    };
    const setSelectedClr = (clr: Color) => {
        setClr(selectedClr, clr, 'selectedClr');
    };
    const setUnselectedClr = (clr: Color) => {
        setClr(unselectedClr, clr, 'unselectedClr');
    };
    const setLockedClr = (clr: Color) => {
        setClr(lockedClr, clr, 'lockedClr');
    };

    events.on('setBgClr', (clr: Color) => {
        setBgClr(clr);
    });
    events.on('setSelectedClr', (clr: Color) => {
        setSelectedClr(clr);
    });
    events.on('setUnselectedClr', (clr: Color) => {
        setUnselectedClr(clr);
    });
    events.on('setLockedClr', (clr: Color) => {
        setLockedClr(clr);
    });

    events.function('bgClr', () => {
        return bgClr;
    });
    events.function('selectedClr', () => {
        return selectedClr;
    });
    events.function('unselectedClr', () => {
        return unselectedClr;
    });
    events.function('lockedClr', () => {
        return lockedClr;
    });

    events.on('bgClr', (clr: Color) => {
        const cnv = (v: number) => `${Math.max(0, Math.min(255, (v * 255))).toFixed(0)}`;
        document.body.style.backgroundColor = `rgba(${cnv(clr.r)},${cnv(clr.g)},${cnv(clr.b)},1)`;
    });
    events.on('selectedClr', (clr: Color) => {
        scene.forceRender = true;
    });
    events.on('unselectedClr', (clr: Color) => {
        scene.forceRender = true;
    });
    events.on('lockedClr', (clr: Color) => {
        scene.forceRender = true;
    });

    // initialize colors from application config
    const toColor = (value: { r: number, g: number, b: number, a: number }) => {
        return new Color(value.r, value.g, value.b, value.a);
    };
    setBgClr(toColor(sceneConfig.bgClr));
    setSelectedClr(toColor(sceneConfig.selectedClr));
    setUnselectedClr(toColor(sceneConfig.unselectedClr));
    setLockedClr(toColor(sceneConfig.lockedClr));

    // create the mask selection canvas
    const maskCanvas = document.createElement('canvas');
    const maskContext = maskCanvas.getContext('2d');
    maskCanvas.setAttribute('id', 'mask-canvas');
    maskContext.globalCompositeOperation = 'copy';

    const mask = {
        canvas: maskCanvas,
        context: maskContext
    };

    // tool manager
    const toolManager = new ToolManager(events);
    toolManager.register('rectSelection', new RectSelection(events, editorUI.toolsContainer.dom));
    toolManager.register('brushSelection', new BrushSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('floodSelection', new FloodSelection(events, editorUI.toolsContainer.dom, mask, editorUI.canvasContainer));
    toolManager.register('polygonSelection', new PolygonSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('lassoSelection', new LassoSelection(events, editorUI.toolsContainer.dom, mask));
    toolManager.register('sphereSelection', new SphereSelection(events, scene, editorUI.canvasContainer));
    toolManager.register('boxSelection', new BoxSelection(events, scene, editorUI.canvasContainer));
    toolManager.register('eyedropperSelection', new EyedropperSelection(events, editorUI.toolsContainer.dom, editorUI.canvasContainer));
    toolManager.register('move', new MoveTool(events, scene));
    toolManager.register('rotate', new RotateTool(events, scene));
    toolManager.register('scale', new ScaleTool(events, scene));
    toolManager.register('measure', new MeasureTool(events, scene, editorUI.toolsContainer.dom, editorUI.canvasContainer));

    editorUI.toolsContainer.dom.appendChild(maskCanvas);

    window.scene = scene;

    registerCameraHistory(events, scene.camera);

    registerEditorEvents(events, editHistory, scene);
    registerSelectionEvents(events, scene);
    const cameraFramesController = registerCameraFrames(events, scene, editorUI.canvasContainer.dom);
    const cameraFramesHistory = new CameraFramesHistory(
        events,
        () => cameraFramesController.snapshot(),
        snapshot => cameraFramesController.applySnapshot(snapshot)
    );
    cameraFramesController.setHistory(cameraFramesHistory);
    registerCameraSave(events, scene, cameraFramesController, cameraFramesHistory);
    const referenceImagesController = registerReferenceImages(events, scene);
    const referenceImagesHistory = new ReferenceImagesHistory(
        events,
        () => referenceImagesController.snapshotFull(),
        snapshot => referenceImagesController.applySnapshotFull(snapshot)
    );
    referenceImagesController.setHistory(referenceImagesHistory);
    registerDocEvents(scene, events);
    registerRenderEvents(scene, events);
    initFileHandler(scene, events, editorUI.appContainer.dom);

    events.fire('app.ready');

    // wait until the first safe render before forcing FPV navigation and camera frames
    const fpvReadyHandle = events.on('postrender', () => {
        fpvReadyHandle.off();
        if (events.functions.has('cameraHistory.suppress')) {
            events.invoke('cameraHistory.suppress', () => {
                events.fire('camera.setNavMode', 'fpv');
            });
        } else {
            events.fire('camera.setNavMode', 'fpv');
        }
        events.fire('cameraFrames.setEnabled', true);
    });

    // load async models
    scene.start();

    // handle load params
    const loadList = url.searchParams.getAll('load');
    const filenameList = url.searchParams.getAll('filename');
    for (const [i, value] of loadList.entries()) {
        const decoded = decodeURIComponent(value);
        const filename = i < filenameList.length ?
            decodeURIComponent(filenameList[i]) :
            decoded.split('/').pop();

        await events.invoke('import', [{
            filename,
            url: decoded
        }]);
    }


    // handle OS-based file association in PWA mode
    if ('launchQueue' in window) {
        window.launchQueue.setConsumer(async (launchParams: LaunchParams) => {
            for (const file of launchParams.files) {
                await events.invoke('import', [{
                    filename: file.name,
                    contents: await file.getFile()
                }]);
            }
        });
    }
};

export { main };
