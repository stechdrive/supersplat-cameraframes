import { GraphNode } from 'playcanvas';

import type { EditHistory } from './edit-history';
import { ElementType, type Element } from './element';
import type { Events } from './events';
import { LightRig } from './light-rig';
import { Model } from './model';
import type { Scene } from './scene';

export const registerModels = async (scene: Scene, events: Events, history: EditHistory) => {
    const models = () => scene.getElementsByType(ElementType.model) as Model[];
    const light = new LightRig([scene.worldLayer.id]);
    await scene.add(light);
    scene.app.scene.ambientLight.set(0.5, 0.5, 0.5);
    const applyAmbient = (value: number) => {
        scene.app.scene.ambientLight.set(value, value, value);
        scene.forceRender = true;
        events.fire('lighting.ambientChanged', value);
    };
    events.function('lighting.ambient', () => scene.app.scene.ambientLight.r);
    events.on('lighting.setAmbient', (value: number) => {
        if (!Number.isFinite(value)) return;
        const before = scene.app.scene.ambientLight.r;
        const after = Math.max(0, value);
        if (before !== after) history.add({ name: 'ambient', do: () => applyAmbient(after), undo: () => applyAmbient(before) });
    });
    events.function('docSerialize.lighting', () => ({ ambient: scene.app.scene.ambientLight.r, lights: [light.docSerialize()] }));
    events.function('docDeserialize.lighting', (state: { ambient?: number; lights?: any[] }) => {
        applyAmbient(state?.ambient ?? 0.5);
        light.docDeserialize(state?.lights?.[0] ?? { enabled: true, intensity: 1.2, transform: { rotation: [-0.2391176, 0.3696438, 0.0990458, 0.8923991] } });
    });
    events.on('app.ready', () => events.fire('lighting.ambientChanged', scene.app.scene.ambientLight.r));
    events.function('mesh.list', models);
    events.function('mesh.fromGraphNode', (node: GraphNode) => models().find(model => model.nodes.includes(node)) ?? null);
    events.on('mesh.select', (model: Model) => events.fire('selection', model));
    events.on('mesh.rename', (model: Model, value: string) => {
        const before = model.name;
        if (value.trim()) {
            history.add({ name: 'modelRename',
                do: () => {
                    model.name = value.trim();
                },
                undo: () => {
                    model.name = before;
                } });
        }
    });
    events.on('mesh.setVisible', (model: Model, value: boolean) => {
        const before = model.visible;
        history.add({ name: 'modelVisible',
            do: () => {
                model.visible = value;
            },
            undo: () => {
                model.visible = before;
            } });
    });
    events.on('mesh.remove', (model: Model) => {
        history.add({ name: 'modelRemove',
            do: () => {
                scene.remove(model);
            },
            undo: async () => {
                await scene.add(model);
            },
            destroy: () => {
                if (!model.scene) model.destroy();
            } });
    });
    events.on('scene.clear', () => models().forEach(model => model.destroy()));
    events.function('scene.reorderElement', (element: Element, direction: 'up' | 'down') => {
        const ordered = scene.elements.filter(item => item.type === element.type);
        const other = ordered[ordered.indexOf(element) + (direction === 'up' ? -1 : 1)];
        if (!other) return;
        const swap = () => {
            const a = scene.elements.indexOf(element);
            const b = scene.elements.indexOf(other);
            if (a < 0 || b < 0) return;
            [scene.elements[a], scene.elements[b]] = [scene.elements[b], scene.elements[a]];
            events.fire('scene.elementReordered', element);
            scene.forceRender = true;
        };
        return history.add({ name: 'reorder', do: swap, undo: swap });
    });
    return light;
};
