import type { CameraFramesState } from './camera-frames-types';
import { Events } from './events';
import { SnapshotOp } from './history-ops';

const cloneState = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const isEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

class CameraFramesHistory {
    private events: Events;
    private getSnapshot: () => CameraFramesState;
    private applySnapshot: (snapshot: CameraFramesState) => void;
    private applying = false;
    private activeLabel: string | null = null;
    private before: CameraFramesState | null = null;
    private pending = new Map<string, { before: CameraFramesState; timer: number | null; }>();
    private debounceMs = 250;

    constructor(events: Events, getSnapshot: () => CameraFramesState, applySnapshot: (snapshot: CameraFramesState) => void) {
        this.events = events;
        this.getSnapshot = getSnapshot;
        this.applySnapshot = applySnapshot;
    }

    isApplying() {
        return this.applying;
    }

    begin(label: string) {
        if (this.applying || this.activeLabel) {
            return;
        }
        this.activeLabel = label;
        this.before = cloneState(this.getSnapshot());
    }

    commit(label?: string) {
        if (this.applying || !this.activeLabel || !this.before) {
            this.reset();
            return;
        }
        const before = this.before;
        const after = cloneState(this.getSnapshot());
        const name = label ?? this.activeLabel ?? 'cameraFrames';
        this.reset();
        if (isEqual(before, after)) {
            return;
        }
        const op = new SnapshotOp<CameraFramesState>({
            name,
            before,
            after,
            apply: snapshot => this.applyWithGuard(snapshot)
        });
        // 既に反映済みの状態を履歴に積むため suppressOp = true
        this.events.fire('edit.add', op, true);
    }

    debounced(label: string, fn: () => void) {
        if (this.applying || this.activeLabel) {
            fn();
            return;
        }

        let pending = this.pending.get(label);
        if (!pending) {
            pending = { before: cloneState(this.getSnapshot()), timer: null };
            this.pending.set(label, pending);
        }

        fn();

        if (pending.timer !== null) {
            window.clearTimeout(pending.timer);
        }
        pending.timer = window.setTimeout(() => {
            this.commitDebounced(label);
        }, this.debounceMs);
    }

    private commitDebounced(label: string) {
        const pending = this.pending.get(label);
        if (!pending) return;
        if (pending.timer !== null) {
            window.clearTimeout(pending.timer);
        }
        this.pending.delete(label);

        const before = pending.before;
        const after = cloneState(this.getSnapshot());
        if (isEqual(before, after)) {
            return;
        }
        const op = new SnapshotOp<CameraFramesState>({
            name: label,
            before,
            after,
            apply: snapshot => this.applyWithGuard(snapshot)
        });
        this.events.fire('edit.add', op, true);
    }

    record(label: string, fn: () => void) {
        if (this.applying) {
            fn();
            return;
        }
        const shouldBegin = !this.activeLabel;
        if (shouldBegin) {
            this.begin(label);
        }
        try {
            fn();
        } finally {
            if (shouldBegin) {
                this.commit(label);
            }
        }
    }

    private applyWithGuard(snapshot: CameraFramesState) {
        this.applying = true;
        try {
            this.applySnapshot(cloneState(snapshot));
        } finally {
            this.applying = false;
        }
    }

    private reset() {
        this.activeLabel = null;
        this.before = null;
    }
}

export { CameraFramesHistory };
