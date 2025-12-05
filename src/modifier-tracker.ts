type ModifierSource = Pick<KeyboardEvent | PointerEvent | WheelEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'> & {
    getModifierState?: (key: string) => boolean;
};

export type ModifierState = {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
};

const DEFAULT_STATE: ModifierState = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false
};

class ModifierTracker {
    private state: ModifierState = { ...DEFAULT_STATE };

    constructor() {
        const sync = (event: KeyboardEvent) => {
            this.state = this.fromSource(event);
        };

        document.addEventListener('keydown', sync);
        document.addEventListener('keyup', sync);
        window.addEventListener('blur', () => this.reset());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') {
                this.reset();
            }
        });
    }

    private readKey(source: ModifierSource, key: 'Control' | 'Shift' | 'Alt' | 'Meta', fallback: boolean) {
        if (typeof source.getModifierState === 'function') {
            try {
                const value = source.getModifierState(key);
                if (typeof value === 'boolean') {
                    return value;
                }
            } catch (err) {
                // ignore
            }
        }

        switch (key) {
            case 'Control': return source.ctrlKey ?? fallback;
            case 'Shift': return source.shiftKey ?? fallback;
            case 'Alt': return source.altKey ?? fallback;
            case 'Meta': return source.metaKey ?? fallback;
            default: return fallback;
        }
    }

    private fromSource(source?: ModifierSource): ModifierState {
        const prev = this.state;
        const src = source ?? {} as ModifierSource;
        return {
            ctrl: !!this.readKey(src, 'Control', prev.ctrl),
            shift: !!this.readKey(src, 'Shift', prev.shift),
            alt: !!this.readKey(src, 'Alt', prev.alt),
            meta: !!this.readKey(src, 'Meta', prev.meta)
        };
    }

    read(source?: ModifierSource): ModifierState {
        const next = this.fromSource(source);
        if (source) {
            this.state = next;
        }
        return { ...next };
    }

    reset() {
        this.state = { ...DEFAULT_STATE };
    }
}

const modifiers = new ModifierTracker();

const isCtrlLike = (state: ModifierState) => state.ctrl || state.meta;

export {
    modifiers,
    isCtrlLike
};
