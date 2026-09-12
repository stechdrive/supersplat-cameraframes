import type { EditHistory } from '../edit-history';
import type { Events } from '../events';
import type { Scene } from '../scene';
import { CameraStore, normalizeDocument, type CameraDocument } from './camera-store';

type DocumentEdit = { name: string; before: CameraDocument; after: CameraDocument; do: () => void; undo: () => void };
type Group = { edit?: DocumentEdit };

// A numeric field or pointer gesture can amend only its own latest history
// entry. If another tool edits meanwhile, start a new entry instead of undoing
// unrelated work. Every mutation runs in the same queue as GPU selection.
export class CameraHistory {
    private group: Group | null = null;
    constructor(private store: CameraStore, private history: EditHistory, private scene: Scene, private events: Events) {}
    begin() {
        this.group = {};
    }
    end() {
        this.group = null;
    }
    change(change: (draft: CameraDocument) => void) {
        const group = this.group;
        return this.scene.commandQueue.enqueue(async () => {
            const before = this.store.state;
            const draft = structuredClone(before);
            change(draft);
            const after = normalizeDocument(draft);
            if (JSON.stringify(before) === JSON.stringify(after)) return;
            const previous = this.history.history[this.history.cursor - 1];
            if (group?.edit && previous === group.edit && this.history.cursor === this.history.history.length) {
                this.store.replace(after);
                group.edit.after = after;
                this.events.fire('edit.apply', group.edit);
            } else {
                const edit: DocumentEdit = {
                    name: 'camera',
                    before,
                    after,
                    do: () => this.store.replace(edit.after),
                    undo: () => this.store.replace(edit.before)
                };
                await this.history.addInQueue(edit);
                if (group) group.edit = edit;
            }
        });
    }
}
