import { Asset, BoundingBox, ContainerResource, Entity, GraphNode, Quat, Vec3 } from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { Transform } from './transform';

class Model extends Element {
    asset: Asset;
    container: ContainerResource;
    entity: Entity;

    private worldBoundStorage = new BoundingBox();
    private boundDirty = true;
    private _name: string;
    private _visible = true;

    private computeWorldBound(target: BoundingBox) {
        let hasBound = false;
        const tmp = new BoundingBox();

        const add = (aabb: BoundingBox) => {
            if (!hasBound) {
                target.copy(aabb);
                hasBound = true;
            } else {
                target.add(aabb);
            }
        };

        this.nodes.forEach((node) => {
            const entity = node as Entity;
            const meshInstances = (entity as any)?.render?.meshInstances as any[] | undefined;
            if (meshInstances && meshInstances.length > 0) {
                meshInstances.forEach((mi) => {
                    const aabb = mi?.aabb as BoundingBox | undefined;
                    if (aabb) {
                        tmp.copy(aabb);
                        add(tmp);
                    }
                });
            }
        });

        if (!hasBound) {
            target.center.set(0, 0, 0);
            target.halfExtents.set(0, 0, 0);
        }
    }

    constructor(asset: Asset) {
        super(ElementType.model);
        this.asset = asset;
        this.container = asset.resource as ContainerResource;
        this.entity = this.container.instantiateRenderEntity();
        this._name = (asset.file as any)?.filename ?? asset.name ?? 'Model';
        this.entity.name = this._name;
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    add() {
        this.scene.contentRoot.addChild(this.entity);
        this.entity.enabled = this._visible;
        this.scene.boundDirty = true;
        this.scene.forceRender = true;
    }

    remove() {
        this.scene.contentRoot.removeChild(this.entity);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this._visible);
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        if (position) {
            this.entity.setLocalPosition(position);
        }
        if (rotation) {
            this.entity.setLocalRotation(rotation);
        }
        if (scale) {
            this.entity.setLocalScale(scale);
        }

        this.markBoundDirty();
        this.scene.events.fire('model.moved', this);
    }

    get worldBound() {
        if (!this.scene || !this._visible) {
            return null;
        }

        if (this.boundDirty) {
            this.computeWorldBound(this.worldBoundStorage);
            this.boundDirty = false;
        }

        return this.worldBoundStorage;
    }

    set name(value: string) {
        if (value && value !== this._name) {
            this._name = value;
            this.entity.name = value;
            this.scene?.events.fire('model.name', this);
        }
    }

    get name() {
        return this._name;
    }

    setLayers(layers: number[]) {
        const visit = (node: GraphNode) => {
            const entity = node as Entity;
            if (entity.render) {
                entity.render.layers = layers.slice();
            }
            node?.children?.forEach((child: GraphNode) => visit(child));
        };
        visit(this.entity);
        this.markBoundDirty();
    }

    set visible(value: boolean) {
        const next = !!value;
        if (next !== this._visible) {
            this._visible = next;
            this.entity.enabled = next;
            this.markBoundDirty();
            this.scene?.events.fire('model.visibility', this);
            if (this.scene) {
                this.scene.forceRender = true;
            }
        }
    }

    get visible() {
        return this._visible;
    }

    get nodes(): GraphNode[] {
        const result: GraphNode[] = [];
        const collect = (node: GraphNode) => {
            result.push(node);
            node?.children?.forEach((child: GraphNode) => collect(child));
        };
        collect(this.entity);
        return result;
    }

    getPivot(mode: 'center' | 'boundCenter', _selection: boolean, result: Transform) {
        const bound = this.worldBound;
        const position = (mode === 'boundCenter' && bound) ? bound.center : this.entity.getPosition();
        result.set(position, this.entity.getRotation(), this.entity.getLocalScale());
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];
        const pack4 = (q: Quat) => [q.x, q.y, q.z, q.w];

        return {
            filename: (this.asset?.file as any)?.filename ?? this.name ?? 'model.glb',
            name: this.name,
            visible: this.visible,
            transform: {
                position: pack3(this.entity.getLocalPosition()),
                rotation: pack4(this.entity.getLocalRotation()),
                scale: pack3(this.entity.getLocalScale())
            }
        };
    }

    docDeserialize(doc: any) {
        if (!doc) {
            return;
        }

        const { name, visible = true } = doc;
        const transform = doc.transform ?? {};
        const position = Array.isArray(transform.position) ? new Vec3(transform.position) : this.entity.getLocalPosition().clone();
        const rotation = Array.isArray(transform.rotation) ? new Quat(transform.rotation) : this.entity.getLocalRotation().clone();
        const scale = Array.isArray(transform.scale) ? new Vec3(transform.scale) : this.entity.getLocalScale().clone();

        if (name) {
            this.name = name;
        }
        this.move(position, rotation, scale);
        this.visible = visible;
    }

    private markBoundDirty() {
        this.boundDirty = true;
        if (this.scene) {
            this.scene.boundDirty = true;
        }
    }
}

export { Model };
