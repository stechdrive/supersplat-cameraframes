import { NumericInput } from '@playcanvas/pcui';

import { Events } from '../events';

type RegisterNumericInputHistoryOptions = {
    events: Events;
    input: NumericInput;
    label: string;
    canBegin?: () => boolean;
    historyBeginEvent?: string | null;
    historyCommitEvent?: string | null;
    beginOnFocus?: boolean;
    beginOnPointer?: boolean;
    beginOnSliderDrag?: boolean;
    onBegin?: () => void;
    onCommit?: () => void;
    flushCameraHistory?: boolean;
};

const isUndoShortcut = (event: KeyboardEvent) => {
    return (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'z';
};

const isRedoShortcut = (event: KeyboardEvent) => {
    return (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'z';
};

const registerNumericInputHistory = ({
    events,
    input,
    label,
    canBegin,
    historyBeginEvent = 'cameraFrames.historyBegin',
    historyCommitEvent = 'cameraFrames.historyCommit',
    beginOnFocus = true,
    beginOnPointer = true,
    beginOnSliderDrag = true,
    onBegin,
    onCommit,
    flushCameraHistory = true
}: RegisterNumericInputHistoryOptions) => {
    let active = false;
    let pointerDown = false;
    let pointerReleaseHandler: (() => void) | null = null;
    let beginText = input.input?.value ?? '';

    const getInputText = () => input.input?.value ?? '';

    const canStart = () => {
        return !!label && (!canBegin || canBegin());
    };

    const releasePointerListener = () => {
        if (!pointerReleaseHandler) {
            return;
        }
        window.removeEventListener('pointerup', pointerReleaseHandler, true);
        window.removeEventListener('pointercancel', pointerReleaseHandler, true);
        pointerReleaseHandler = null;
    };

    const begin = () => {
        if (active || !canStart()) {
            return;
        }
        active = true;
        beginText = getInputText();
        onBegin?.();
        if (historyBeginEvent) {
            events.fire(historyBeginEvent, label);
        }
    };

    const commit = () => {
        if (!active) {
            beginText = getInputText();
            return;
        }
        active = false;
        if (historyCommitEvent) {
            events.fire(historyCommitEvent, label);
        }
        onCommit?.();
        beginText = getInputText();
    };

    const flushPending = () => {
        commit();
        if (flushCameraHistory && events.functions.has('cameraHistory.commitPending')) {
            events.invoke('cameraHistory.commitPending');
        }
    };

    const handlePointerRelease = () => {
        pointerDown = false;
        if (active) {
            commit();
        }
        releasePointerListener();
    };

    const ensurePointerRelease = () => {
        if (pointerReleaseHandler) {
            return;
        }
        pointerReleaseHandler = handlePointerRelease;
        window.addEventListener('pointerup', pointerReleaseHandler, true);
        window.addEventListener('pointercancel', pointerReleaseHandler, true);
    };

    const beginFromPointer = (event: PointerEvent) => {
        if (event.button !== 0) {
            return;
        }
        pointerDown = true;
        ensurePointerRelease();
        if (event.target === input.input) {
            return;
        }
        begin();
    };

    const beginFromChange = () => {
        begin();
    };

    const commitFromBlur = () => {
        if (pointerDown) {
            return;
        }
        commit();
    };

    const triggerUndoRedo = (event: KeyboardEvent, action: 'edit.undo' | 'edit.redo') => {
        if (document.activeElement !== input.input) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        input.input?.blur();
        window.setTimeout(() => {
            flushPending();
            events.fire(action);
        }, 0);
    };

    if (beginOnFocus) {
        input.dom.addEventListener('focusin', begin, true);
    }
    if (beginOnPointer) {
        input.dom.addEventListener('pointerdown', beginFromPointer, true);
    }
    if (beginOnSliderDrag) {
        input.on('slider:mousedown', begin);
        input.on('slider:mouseup', commit);
    }
    input.on('change', beginFromChange);
    input.on('blur', commitFromBlur);

    input.input?.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            begin();
            return;
        }
        if (event.key === 'Enter') {
            window.setTimeout(() => input.input?.blur(), 0);
            return;
        }
        if (isRedoShortcut(event)) {
            triggerUndoRedo(event, 'edit.redo');
            return;
        }
        if (isUndoShortcut(event)) {
            triggerUndoRedo(event, 'edit.undo');
        }
    }, true);

    input.input?.addEventListener('keyup', (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            commit();
        }
    }, true);
};

export { registerNumericInputHistory };
