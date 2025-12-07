import { Element, ElementType } from './element';
import { Events } from './events';
import { LightRig } from './light-rig';
import { Model } from './model';
import { Scene } from './scene';
import { Splat } from './splat';

const registerSelectionEvents = (events: Events, scene: Scene) => {
    type Selectable = Splat | Model | LightRig;
    let selection: Selectable = null;

    const isSelectable = (element: Element | null): element is Selectable => {
        return element instanceof Splat || element instanceof Model || element instanceof LightRig;
    };

    const setSelection = (element: Element | null) => {
        if (element && !isSelectable(element)) {
            return;
        }

        const next = element as Selectable;

        if (next !== selection && (!next || next.visible)) {
            const prev = selection;
            selection = next ?? null;
            events.fire('selection.changed', selection, prev);
        }
    };

    events.on('selection', (element: Element) => {
        setSelection(element);
    });

    events.function('selection', () => {
        return selection;
    });

    events.on('selection.next', () => {
        const splats = scene.getElementsByType(ElementType.splat) as Splat[];
        const models = scene.getElementsByType(ElementType.model) as Model[];
        const lights = scene.getElementsByType(ElementType.other).filter(e => e instanceof LightRig) as LightRig[];
        const elements: Selectable[] = [...splats, ...models, ...lights].filter(e => (e as any).visible !== false);
        if (elements.length > 1) {
            const idx = elements.indexOf(selection);
            setSelection(elements[(idx + 1) % elements.length]);
        }
    });

    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat || element.type === ElementType.model) {
            setSelection(element as Element);
        }
    });

    events.on('scene.elementRemoved', (element: Element) => {
        if (element === selection) {
            const splats = scene.getElementsByType(ElementType.splat) as Splat[];
            const models = scene.getElementsByType(ElementType.model) as Model[];
            const lights = scene.getElementsByType(ElementType.other).filter(e => e instanceof LightRig) as LightRig[];
            const next: Selectable[] = [...splats, ...models, ...lights].filter(v => v !== element && (v as any).visible !== false);
            setSelection(next.length > 0 ? next[0] : null);
        }
    });

    events.on('splat.visibility', (splat: Splat) => {
        if (splat === selection && !splat.visible) {
            setSelection(null);
        }
    });

    events.on('model.visibility', (model: Model) => {
        if (model === selection && !model.visible) {
            setSelection(null);
        }
    });

    events.on('camera.focalPointPicked', (details: { splat?: Splat, model?: Model, element?: Element }) => {
        setSelection((details?.element as Element) ?? details?.model ?? details?.splat ?? null);
    });
};

export { registerSelectionEvents };
