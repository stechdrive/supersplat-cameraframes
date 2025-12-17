import { Events } from './events';
import { SnapshotOp } from './history-ops';
import type { ReferenceImagesState } from './reference-images-types';

const cloneState = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const isEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

class ReferenceImagesHistory {
    private events: Events;
    private getSnapshot: () => ReferenceImagesState;
    private applySnapshot: (snapshot: ReferenceImagesState) => void;
    private applying = false;
    private activeLabel: string | null = null;
    private before: ReferenceImagesState | null = null;

    constructor(events: Events, getSnapshot: () => ReferenceImagesState, applySnapshot: (snapshot: ReferenceImagesState) => void) {
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
        const name = label ?? this.activeLabel ?? 'referenceImages';
        this.reset();
        if (isEqual(before, after)) {
            return;
        }
        const op = new SnapshotOp<ReferenceImagesState>({
            name,
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

    private applyWithGuard(snapshot: ReferenceImagesState) {
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

export { ReferenceImagesHistory };
