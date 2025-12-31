import { EntityTransformHandler } from './entity-transform-handler';
import { Events } from './events';
import { LightRig } from './light-rig';
import { Model } from './model';
import { MultiEntityTransformHandler } from './multi-entity-transform-handler';
import { registerPivotEvents } from './pivot';
import { Splat } from './splat';
import { SplatsTransformHandler } from './splats-transform-handler';

interface TransformHandler {
    activate: () => void;
    deactivate: () => void;
}

const registerTransformHandlerEvents = (events: Events) => {
    const transformHandlers: TransformHandler[] = [];

    const push = (handler: TransformHandler) => {
        if (transformHandlers.length > 0) {
            const transformHandler = transformHandlers[transformHandlers.length - 1];
            transformHandler.deactivate();
        }
        transformHandlers.push(handler);
        handler.activate();
    };

    const pop = () => {
        if (transformHandlers.length > 0) {
            const transformHandler = transformHandlers.pop();
            transformHandler.deactivate();
        }
        if (transformHandlers.length > 0) {
            const transformHandler = transformHandlers[transformHandlers.length - 1];
            transformHandler.activate();
        }
    };

    // bind transform target when selection changes
    const entityTransformHandler = new EntityTransformHandler(events);
    const splatsTransformHandler = new SplatsTransformHandler(events);
    const multiEntityTransformHandler = new MultiEntityTransformHandler(events);

    const update = () => {
        pop();
        const selection = events.invoke('selection') as Splat | Model | LightRig;
        const selectionSize = events.invoke('selection.size') as number;
        if (selectionSize >= 2) {
            push(multiEntityTransformHandler);
        } else if (selectionSize === 1 && selection instanceof Splat) {
            if (selection.numSelected > 0) {
                push(splatsTransformHandler);
            } else {
                push(entityTransformHandler);
            }
        } else if (selectionSize === 1 && selection instanceof Model) {
            push(entityTransformHandler);
        } else if (selectionSize === 1 && selection instanceof LightRig) {
            push(entityTransformHandler);
        }
    };

    events.on('selection.changed', update);
    events.on('splat.stateChanged', update);

    events.on('transformHandler.push', (handler: TransformHandler) => {
        push(handler);
    });

    events.on('transformHandler.pop', () => {
        pop();
    });

    registerPivotEvents(events);
};

export { registerTransformHandlerEvents, TransformHandler };
