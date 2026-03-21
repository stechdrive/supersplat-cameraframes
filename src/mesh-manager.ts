import { GraphNode, Material } from 'playcanvas';

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
            return scene.getElementsByType(ElementType.model)
            .filter((element): element is Model => element instanceof Model && this.models.has(element));
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
        this.applyDepthWriteFix(model);
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
        const layers: number[] = [];

        // モデル描画はライト付き1パスに統一し、上書き・二重描画を防ぐ
        if (this.modelLightingLayerId !== null) {
            layers.push(this.modelLightingLayerId);
        } else {
            if (Array.isArray((model.entity as any)?.render?.layers)) {
                layers.push(...(model.entity as any).render.layers);
            } else if (this.worldLayerId !== null) {
                layers.push(this.worldLayerId);
            }
        }

        model.setLayers(layers);
    }

    private applyDepthWriteFix(model: Model) {
        // GLB が透明マテリアルの場合、depthWrite が無効だと gsplat(PLY) が常に上に重なり
        // 「PLYを非表示にしないとGLBが見えない」状態になりやすい。
        // ここでは透明マテリアルに限り depthWrite を有効化し、深度統合を安定させる。
        const changed = new Set<Material>();

        const visit = (node: GraphNode) => {
            const entity = node as any;
            const meshInstances = entity?.render?.meshInstances as { material?: Material }[] | undefined;
            if (meshInstances && meshInstances.length > 0) {
                meshInstances.forEach((meshInstance) => {
                    const material = meshInstance.material;
                    if (!material) {
                        return;
                    }
                    if (material.transparent && !material.depthWrite) {
                        material.depthTest = true;
                        material.depthWrite = true;
                        changed.add(material);
                    }
                });
            }
            node?.children?.forEach((child: GraphNode) => visit(child));
        };

        visit(model.entity);

        changed.forEach((material) => {
            material.update();
        });
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
