import { Camera } from './camera';
import { Events } from './events';
import { SnapshotOp } from './history-ops';

type CameraSnapshot = {
    focalPoint: number[];
    azim: number;
    elev: number;
    distance: number;
    roll: number;
    navMode: 'orbit' | 'fpv';
    fov: number;
    ortho: boolean;
    fpvPosition?: number[];
    renderOverlays?: boolean;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const pickSnapshot = (camera: Camera): CameraSnapshot => {
    const doc = camera.docSerialize();
    return {
        focalPoint: doc.focalPoint,
        azim: doc.azim,
        elev: doc.elev,
        distance: doc.distance,
        roll: doc.roll ?? 0,
        navMode: doc.navMode ?? 'orbit',
        fov: doc.fov,
        ortho: !!doc.ortho,
        fpvPosition: doc.fpvPosition,
        renderOverlays: doc.renderOverlays
    };
};

const isEqual = (a: CameraSnapshot, b: CameraSnapshot) => JSON.stringify(a) === JSON.stringify(b);

class CameraHistory {
    private events: Events;
    private camera: Camera;
    private before: CameraSnapshot | null = null;
    private timer: number | null = null;
    private applying = false;
    private suppressDepth = 0;
    private debounceMs = 250;

    constructor(events: Events, camera: Camera) {
        this.events = events;
        this.camera = camera;
    }

    isApplying() {
        return this.applying;
    }

    attach() {
        this.events.on('camera.transform', () => this.schedule('camera.transform'));
        this.events.on('camera.fov', () => this.schedule('camera.fov'));
        this.events.on('camera.navMode', (_mode?: 'orbit' | 'fpv', meta?: { source?: string }) => {
            if (this.shouldIgnore(meta)) {
                return;
            }
            this.schedule('camera.navMode');
        });
        this.events.on('camera.ortho', (_value?: boolean, meta?: { source?: string }) => {
            if (this.shouldIgnore(meta)) {
                return;
            }
            this.schedule('camera.ortho');
        });
        this.events.on('scene.clear', () => this.reset());
    }

    private schedule(label: string) {
        if (this.applying || this.suppressDepth > 0) {
            return;
        }
        if (!this.before) {
            this.before = clone(pickSnapshot(this.camera));
        }
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
        }
        this.timer = window.setTimeout(() => this.commit(label), this.debounceMs);
    }

    private commit(label: string) {
        if (this.applying || this.suppressDepth > 0) {
            return;
        }
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        if (!this.before) {
            return;
        }
        const before = this.before;
        const after = clone(pickSnapshot(this.camera));
        this.before = null;

        if (isEqual(before, after)) {
            return;
        }

        const op = new SnapshotOp<CameraSnapshot>({
            name: label ?? 'camera.transform',
            before,
            after,
            apply: snapshot => this.applyWithGuard(snapshot)
        });

        // すでに適用済みの状態を履歴へ積むため suppressOp = true
        this.events.fire('edit.add', op, true);
    }

    private applyWithGuard(snapshot: CameraSnapshot) {
        this.applying = true;
        try {
            this.camera.docDeserialize(clone(snapshot) as any);
        } finally {
            this.applying = false;
        }
    }

    suppress<T>(fn: () => T) {
        const isRoot = this.suppressDepth === 0;
        if (isRoot) {
            this.reset();
        }
        this.suppressDepth++;
        try {
            return fn();
        } finally {
            this.suppressDepth = Math.max(0, this.suppressDepth - 1);
            if (this.suppressDepth === 0) {
                this.reset();
            }
        }
    }

    private shouldIgnore(meta?: { source?: string }) {
        if (this.applying || this.suppressDepth > 0) {
            return true;
        }
        return meta?.source === 'ui-sync';
    }

    private reset() {
        this.before = null;
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

const registerCameraHistory = (events: Events, camera: Camera) => {
    const history = new CameraHistory(events, camera);
    history.attach();
    events.function('cameraHistory.suppress', (fn: () => void) => history.suppress(fn));
    return history;
};

export { CameraHistory, registerCameraHistory, CameraSnapshot };
