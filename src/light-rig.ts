import { Color, Entity, Quat, Vec3 } from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';

class LightRig extends Element {
    entity: Entity;
    light: Entity;
    intensity = 0.8;
    layers: number[] = [];

    constructor(lightingLayers: number[]) {
        super(ElementType.other);
        this.layers = lightingLayers.slice();

        this.entity = new Entity('modelLightRig');
        this.light = new Entity('modelLight');
        this.light.addComponent('light', {
            type: 'directional',
            castShadows: false,
            color: new Color(1, 1, 1),
            intensity: this.intensity
        });
        this.entity.addChild(this.light);

        // 初期方向: やや斜め上
        this.entity.setEulerAngles(-30, 45, 0);
    }

    add() {
        this.scene.contentRoot.addChild(this.entity);
        this.applyLayers();

        const events = this.scene.events;
        events.on('modelLight.toggle', this.toggle, this);
        events.on('modelLight.on', () => this.setEnabled(true), this);
        events.on('modelLight.off', () => this.setEnabled(false), this);
        events.on('modelLight.setIntensity', (value: number) => this.setIntensity(value), this);
        events.on('modelLight.resetDirection', () => this.resetDirection(), this);
        events.on('modelLight.selectRig', () => events.fire('selection', this), this);
    }

    remove() {
        this.scene.contentRoot.removeChild(this.entity);
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.light = null;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.intensity);
        serializer.pack(this.light.light.enabled);
    }

    move(position?: Vec3, rotation?: Quat) {
        if (position) {
            this.entity.setLocalPosition(position);
        }
        if (rotation) {
            this.entity.setLocalRotation(rotation);
        }
        this.scene.forceRender = true;
    }

    setIntensity(value: number) {
        const next = Math.max(0, value);
        if (next !== this.intensity) {
            this.intensity = next;
            this.light.light.intensity = this.intensity;
            this.scene.forceRender = true;
        }
    }

    setEnabled(value: boolean) {
        if (this.light.light.enabled !== value) {
            this.light.light.enabled = value;
            this.scene.forceRender = true;
        }
    }

    toggle = () => {
        this.setEnabled(!this.light.light.enabled);
    };

    resetDirection() {
        this.entity.setEulerAngles(-30, 45, 0);
        this.scene.forceRender = true;
    }

    getPivot(_mode: 'center' | 'boundCenter', _selection: boolean, result: any) {
        result.set(this.entity.getLocalPosition(), this.entity.getLocalRotation(), this.entity.getLocalScale());
    }

    get worldBound() {
        return null;
    }

    private applyLayers() {
        const targetLayers = this.layers.slice();
        this.light.light.layers = targetLayers;
    }
}

export { LightRig };
