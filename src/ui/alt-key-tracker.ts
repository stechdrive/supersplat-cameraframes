type AltKeyListener = (pressed: boolean) => void;

const listeners = new Set<AltKeyListener>();
let initialized = false;
let altPressed = false;

const notify = (pressed: boolean) => {
    if (altPressed === pressed) {
        return;
    }
    altPressed = pressed;
    listeners.forEach(listener => listener(altPressed));
};

const ensureInit = () => {
    if (initialized) {
        return;
    }
    initialized = true;
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Alt') {
            notify(true);
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') {
            notify(false);
        }
    });
    window.addEventListener('blur', () => {
        notify(false);
    });
};

const subscribeAltKey = (listener: AltKeyListener) => {
    ensureInit();
    listeners.add(listener);
    listener(altPressed);
    return () => {
        listeners.delete(listener);
    };
};

export { subscribeAltKey };
