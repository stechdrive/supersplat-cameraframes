import { GraphNode } from 'playcanvas';

import { Element, ElementType } from './element';
import { Events } from './events';
import { Model } from './model';
import { Scene } from './scene';

class MeshManager {
    private events: Events;
    private models = new Set<Model>();
    private nodeToModel = new Map<GraphNode, Model>();
    private modelNodes = new Map<Model, Set<GraphNode>>();
    private modelLightingLayerId: number | null;
    private worldLayerId: number | null;

    constructor(events: Events, scene: Scene) {
        this.events = events;
        const worldLayer = scene.app.scene.layers.getLayerByName('World');
        this.worldLayerId = worldLayer ? worldLayer.id : null;
        this.modelLightingLayerId = scene.modelLightingLayer?.id ?? null;

        events.on('scene.elementAdded', (element: Element) => {
            if (element.type === ElementType.model) {
                this.register(element as Model);
            }
        });

        events.on('scene.elementRemoved', (element: Element) => {
            if (element.type === ElementType.model) {
                this.unregister(element as Model);
            }
        });

        events.on('mesh.select', (model: Model | null) => {
            if (model && !this.models.has(model)) {
                return;
            }
            events.fire('selection', model);
        });

        events.on('mesh.rename', (model: Model, name: string) => {
            if (this.models.has(model)) {
                model.name = name;
            }
        });

        events.on('mesh.setVisible', (model: Model, visible: boolean) => {
            if (this.models.has(model)) {
                model.visible = visible;
            }
        });

        events.on('mesh.remove', (model: Model) => {
            if (this.models.has(model)) {
                model.destroy();
            }
        });

        events.function('mesh.list', () => {
            return Array.from(this.models);
        });

        events.function('mesh.fromGraphNode', (node: GraphNode | null) => {
            return this.findFromGraphNode(node);
        });

        // 既存シーンにモデルが後から追加される場合も拾う
        scene.getElementsByType(ElementType.model).forEach((element) => {
            this.register(element as Model);
        });
    }

    private register(model: Model) {
        if (this.models.has(model)) {
            return;
        }

        this.models.add(model);
        this.applyLayers(model);
        const nodes = new Set<GraphNode>();
        const collect = (node: GraphNode) => {
            nodes.add(node);
            this.nodeToModel.set(node, model);
            node?.children?.forEach((child: GraphNode) => collect(child));
        };
        collect(model.entity);
        this.modelNodes.set(model, nodes);
    }

    private applyLayers(model: Model) {
        if (!this.modelLightingLayerId) {
            return;
        }
        const layers: number[] = [];
        if (Array.isArray((model.entity as any)?.render?.layers)) {
            layers.push(...(model.entity as any).render.layers);
        } else if (this.worldLayerId !== null) {
            layers.push(this.worldLayerId);
        }
        if (!layers.includes(this.modelLightingLayerId)) {
            layers.push(this.modelLightingLayerId);
        }
        model.setLayers(layers);
    }

    private unregister(model: Model) {
        if (!this.models.has(model)) {
            return;
        }

        this.models.delete(model);
        const nodes = this.modelNodes.get(model);
        if (nodes) {
            nodes.forEach((node) => {
                if (this.nodeToModel.get(node) === model) {
                    this.nodeToModel.delete(node);
                }
            });
        }
        this.modelNodes.delete(model);
    }

    private findFromGraphNode(node: GraphNode | null): Model | null {
        let current: GraphNode | null = node;
        while (current) {
            const model = this.nodeToModel.get(current);
            if (model) {
                return model;
            }
            current = current.parent;
        }
        return null;
    }
}

export { MeshManager };
