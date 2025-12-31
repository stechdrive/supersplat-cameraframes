import { Element, ElementType } from './element';
import { Events } from './events';
import { LightRig } from './light-rig';
import { Model } from './model';
import { Scene } from './scene';
import { Splat } from './splat';

const registerSelectionEvents = (events: Events, scene: Scene) => {
    type Selectable = Splat | Model | LightRig;
    let selection: Selectable = null;
    let selectionList: Selectable[] = [];

    const isSelectable = (element: Element | null): element is Selectable => {
        return element instanceof Splat || element instanceof Model || element instanceof LightRig;
    };

    const isVisible = (element: Selectable) => {
        return (element as any).visible !== false;
    };

    const listEquals = (left: Selectable[], right: Selectable[]) => {
        if (left.length !== right.length) {
            return false;
        }
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) {
                return false;
            }
        }
        return true;
    };

    const sanitizeList = (list: Selectable[]) => {
        const next: Selectable[] = [];
        const seen = new Set<Selectable>();
        for (const element of list) {
            if (!element || !isSelectable(element) || !isVisible(element)) {
                continue;
            }
            if (seen.has(element)) {
                continue;
            }
            seen.add(element);
            next.push(element);
        }
        return next;
    };

    const normalizeSelection = (list: Selectable[], active: Selectable | null) => {
        const nextList = sanitizeList(list);
        let nextActive = active && isSelectable(active) && isVisible(active) ? active : null;

        const lightRig = nextActive instanceof LightRig ? nextActive : nextList.find(item => item instanceof LightRig);
        if (lightRig) {
            return { list: [lightRig], active: lightRig };
        }

        if (nextList.length === 0) {
            return { list: [], active: null };
        }

        if (nextActive) {
            if (!nextList.includes(nextActive)) {
                nextList.push(nextActive);
            }
        } else {
            nextActive = nextList[nextList.length - 1];
        }

        return { list: nextList, active: nextActive };
    };

    const applySelection = (list: Selectable[], active: Selectable | null) => {
        const normalized = normalizeSelection(list, active);
        const prev = selection;
        const prevList = selectionList.slice();

        if (prev === normalized.active && listEquals(prevList, normalized.list)) {
            return;
        }

        selection = normalized.active;
        selectionList = normalized.list;
        events.fire('selection.changed', selection, prev, selectionList.slice(), prevList);
    };

    const setSelection = (elements: Element[] | Element | null, active?: Element | null) => {
        const list = Array.isArray(elements) ? elements : (elements ? [elements] : []);
        const nextList = list.filter(element => isSelectable(element)) as Selectable[];
        const nextActive = active && isSelectable(active) ? active as Selectable : null;
        applySelection(nextList, nextActive);
    };

    const addSelection = (element: Element | null, makeActive = true) => {
        if (!element || !isSelectable(element)) {
            return;
        }

        const nextList = selectionList.slice();
        if (!nextList.includes(element)) {
            nextList.push(element);
        }
        const nextActive = makeActive ? element : selection;
        applySelection(nextList, nextActive);
    };

    const removeSelection = (element: Element | null, nextActive?: Element | null) => {
        if (!element || !isSelectable(element)) {
            return;
        }

        const nextList = selectionList.filter(item => item !== element);
        let active = selection;
        if (nextActive && isSelectable(nextActive)) {
            active = nextActive as Selectable;
        } else if (selection === element) {
            active = nextList[nextList.length - 1] ?? null;
        }
        applySelection(nextList, active);
    };

    const toggleSelection = (element: Element | null, makeActive = true) => {
        if (!element || !isSelectable(element)) {
            return;
        }

        if (selectionList.includes(element)) {
            removeSelection(element);
        } else {
            addSelection(element, makeActive);
        }
    };

    const clearSelection = () => {
        applySelection([], null);
    };

    const removeFromSelection = (element: Selectable) => {
        if (!selectionList.includes(element)) {
            return;
        }
        const nextList = selectionList.filter(item => item !== element);
        const nextActive = selection === element ? (nextList[nextList.length - 1] ?? null) : selection;
        applySelection(nextList, nextActive);
    };

    events.on('selection', (element: Element) => {
        setSelection(element, element);
    });

    events.function('selection', () => {
        return selection;
    });

    events.function('selection.list', () => {
        return selectionList.slice();
    });

    events.function('selection.size', () => {
        return selectionList.length;
    });

    events.function('selection.has', (element: Element | null) => {
        return !!element && selectionList.includes(element as Selectable);
    });

    events.on('selection.set', (list: Element[] | Element | null, active?: Element | null) => {
        setSelection(list, active);
    });

    events.on('selection.add', (element: Element, makeActive = true) => {
        addSelection(element, makeActive);
    });

    events.on('selection.remove', (element: Element, nextActive?: Element | null) => {
        removeSelection(element, nextActive);
    });

    events.on('selection.toggle', (element: Element, makeActive = true) => {
        toggleSelection(element, makeActive);
    });

    events.on('selection.clear', () => {
        clearSelection();
    });

    events.on('selection.next', () => {
        const splats = scene.getElementsByType(ElementType.splat) as Splat[];
        const models = scene.getElementsByType(ElementType.model) as Model[];
        const lights = scene.getElementsByType(ElementType.other).filter(e => e instanceof LightRig) as LightRig[];
        const elements: Selectable[] = [...splats, ...models, ...lights].filter(isVisible);
        if (elements.length > 1) {
            const idx = elements.indexOf(selection);
            const next = elements[(idx + 1) % elements.length];
            setSelection(next, next);
        }
    });

    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat || element.type === ElementType.model) {
            setSelection(element as Element);
        }
    });

    events.on('scene.elementRemoved', (element: Element) => {
        if (isSelectable(element)) {
            removeFromSelection(element);
        }
    });

    events.on('splat.visibility', (splat: Splat) => {
        if (!splat.visible) {
            removeFromSelection(splat);
        }
    });

    events.on('model.visibility', (model: Model) => {
        if (!model.visible) {
            removeFromSelection(model);
        }
    });

    events.on('camera.focalPointPicked', (details: { splat?: Splat, model?: Model, element?: Element }) => {
        setSelection((details?.element as Element) ?? details?.model ?? details?.splat ?? null);
    });
};

export { registerSelectionEvents };
