import type { Camera } from '../camera';
import { ElementType, type Element } from '../element';
import type { Scene } from '../scene';

// Own per-view pass resources and remove their listeners with the view. Static
// shaders and scene data can be shared; mutable quad/pass state cannot.
type ReleaseView = () => void;
type BindView = (camera: Camera) => ReleaseView;

export const bindViews = (scene: Scene, bind: BindView) => {
    const bindings = new Map<Camera, ReleaseView>();
    const add = (element: Element) => {
        if (element.type !== ElementType.camera) return;
        const camera = element as Camera;
        if (!bindings.has(camera)) bindings.set(camera, bind(camera));
    };
    const remove = (element: Element) => {
        const camera = element as Camera;
        bindings.get(camera)?.();
        bindings.delete(camera);
    };
    add(scene.camera);
    scene.getElementsByType(ElementType.camera).forEach(add);
    const added = scene.events.on('scene.elementAdded', add);
    const removed = scene.events.on('scene.elementRemoved', remove);
    return () => {
        added.off();
        removed.off();
        bindings.forEach(dispose => dispose());
        bindings.clear();
    };
};
