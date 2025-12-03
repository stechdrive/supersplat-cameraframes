import { EditOp } from './edit-ops';

// 汎用スナップショット型の Undo / Redo オペレーション
class SnapshotOp<T> implements EditOp {
    name: string;
    private before: T;
    private after: T;
    private applySnapshot: (snapshot: T) => void;

    constructor(options: { name: string; before: T; after: T; apply: (snapshot: T) => void; }) {
        this.name = options.name;
        this.before = options.before;
        this.after = options.after;
        this.applySnapshot = options.apply;
    }

    do() {
        this.applySnapshot(this.after);
    }

    undo() {
        this.applySnapshot(this.before);
    }

    destroy() {
        this.before = null;
        this.after = null;
        this.applySnapshot = null;
    }
}

export { SnapshotOp };
