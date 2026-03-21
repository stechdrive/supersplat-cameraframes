import { Color, Entity, Quat, Vec3 } from 'playcanvas';

import { EntityTransformOp, LightStateOp } from './edit-ops';
import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { Transform } from './transform';

class LightRig extends Element {
    entity: Entity;
    light: Entity;
    intensity = 1.2;
    layers: number[] = [];
    private pendingIntensityOp: LightStateOp | null = null;
    private pendingIntensityFresh = false;
    private pendingIntensityTimer: number | null = null;
    private historyCoalesceMs = 400;

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
        events.function('modelLight.state', () => this.getState());
        events.on('modelLight.toggle', () => this.setEnabled(!this.light.light.enabled, true), this);
        events.on('modelLight.on', () => this.setEnabled(true, true), this);
        events.on('modelLight.off', () => this.setEnabled(false, true), this);
        events.on('modelLight.setIntensity', (value: number) => this.setIntensity(value, true), this);
        events.on('modelLight.resetDirection', () => this.resetDirection(true), this);
        events.on('modelLight.selectRig', () => events.fire('selection', this), this);
        events.function('modelLight.commitPending', () => this.commitPendingIntensity());
        events.on('edit.apply', this.onEditApplied, this);

        this.notifyState();
    }

    remove() {
        this.scene.contentRoot.removeChild(this.entity);
    }

    destroy() {
        super.destroy();
        this.scene?.events.off('edit.apply', this.onEditApplied, this);
        this.clearPendingIntensityOp();
        this.entity.destroy();
        this.light = null;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.intensity);
        serializer.pack(this.light.light.enabled);
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
        this.scene.forceRender = true;
    }

    setIntensity(value: number, recordHistory = false) {
        const next = Math.max(0, value);
        if (recordHistory) {
            this.recordStateChange({ intensity: next });
        } else {
            this.applyStateDirect(this.light.light.enabled, next);
        }
    }

    setEnabled(value: boolean, recordHistory = false) {
        const next = !!value;
        if (recordHistory) {
            this.recordStateChange({ enabled: next });
        } else {
            this.applyStateDirect(next, this.intensity);
        }
    }

    toggle = () => {
        this.setEnabled(!this.light.light.enabled, true);
    };

    resetDirection(recordHistory = false) {
        const oldt = new Transform(
            this.entity.getLocalPosition().clone(),
            this.entity.getLocalRotation().clone(),
            this.entity.getLocalScale().clone()
        );
        const newRot = new Quat();
        newRot.setFromEulerAngles(-30, 45, 0);
        const newt = new Transform(oldt.position.clone(), newRot, oldt.scale.clone());

        if (oldt.equals(newt)) {
            return;
        }

        if (recordHistory) {
            this.scene.events.fire('edit.add', new EntityTransformOp({
                splat: this,
                oldt,
                newt
            }));
        } else {
            this.move(newt.position, newt.rotation, newt.scale);
        }
    }

    set visible(value: boolean) {
        this.setEnabled(!!value);
    }

    get visible() {
        return this.light?.light?.enabled ?? true;
    }

    getPivot(_mode: 'center' | 'boundCenter', _selection: boolean, result: any) {
        result.set(this.entity.getLocalPosition(), this.entity.getLocalRotation(), this.entity.getLocalScale());
    }

    get worldBound(): null {
        return null;
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];
        const pack4 = (q: Quat) => [q.x, q.y, q.z, q.w];

        return {
            type: 'directional',
            enabled: this.light?.light?.enabled ?? true,
            intensity: this.intensity,
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

        const enabled = doc.hasOwnProperty('enabled') ? !!doc.enabled : (this.light?.light?.enabled ?? true);
        const intensity = typeof doc.intensity === 'number' ? doc.intensity : this.intensity;
        const transform = doc.transform ?? {};

        const position = Array.isArray(transform.position) ? new Vec3(transform.position) : this.entity.getLocalPosition().clone();
        const rotation = Array.isArray(transform.rotation) ? new Quat(transform.rotation) : this.entity.getLocalRotation().clone();
        const scale = Array.isArray(transform.scale) ? new Vec3(transform.scale) : this.entity.getLocalScale().clone();

        this.move(position, rotation, scale);
        this.applyStateDirect(enabled, intensity);
    }

    private applyLayers() {
        const targetLayers = this.layers.slice();
        this.light.light.layers = targetLayers;
    }

    private getState() {
        return {
            enabled: this.light?.light?.enabled ?? false,
            intensity: this.intensity
        };
    }

    private recordStateChange(state: { enabled?: boolean; intensity?: number; }) {
        const prev = this.getState();
        const next = {
            enabled: state.enabled ?? prev.enabled,
            intensity: state.intensity ?? prev.intensity
        };

        if (prev.enabled === next.enabled && prev.intensity === next.intensity) {
            return;
        }

        const enabledChanged = prev.enabled !== next.enabled;
        const intensityChanged = prev.intensity !== next.intensity;

        if (enabledChanged) {
            this.clearPendingIntensityOp();
            this.scene?.events.fire('edit.add', new LightStateOp({
                light: this,
                prevEnabled: prev.enabled,
                prevIntensity: prev.intensity,
                nextEnabled: next.enabled,
                nextIntensity: next.intensity
            }));
            return;
        }

        if (intensityChanged) {
            this.recordIntensityChange(prev, next);
        }
    }

    applyStateDirect(enabled: boolean, intensity: number) {
        if (!this.light || !this.light.light) {
            return;
        }

        const nextIntensity = Math.max(0, intensity);
        const enabledChanged = this.light.light.enabled !== enabled;
        const intensityChanged = this.intensity !== nextIntensity;

        if (!enabledChanged && !intensityChanged) {
            return;
        }

        this.light.light.enabled = enabled;
        this.intensity = nextIntensity;
        this.light.light.intensity = nextIntensity;
        this.scene.forceRender = true;
        this.notifyState();
    }

    private notifyState() {
        this.scene?.events.fire('modelLight.state', this.getState());
    }

    private recordIntensityChange(prev: { enabled: boolean; intensity: number; }, next: { enabled: boolean; intensity: number; }) {
        if (!this.pendingIntensityOp) {
            const op = new LightStateOp({
                light: this,
                prevEnabled: prev.enabled,
                prevIntensity: prev.intensity,
                nextEnabled: next.enabled,
                nextIntensity: next.intensity
            });
            this.pendingIntensityOp = op;
            this.pendingIntensityFresh = true;
            this.scene?.events.fire('edit.add', op);
        } else {
            this.pendingIntensityOp.nextEnabled = next.enabled;
            this.pendingIntensityOp.nextIntensity = next.intensity;
            this.applyStateDirect(next.enabled, next.intensity);
        }
        this.scheduleIntensityReset();
    }

    private scheduleIntensityReset() {
        if (this.pendingIntensityTimer !== null) {
            window.clearTimeout(this.pendingIntensityTimer);
        }
        this.pendingIntensityTimer = window.setTimeout(() => {
            this.clearPendingIntensityOp();
        }, this.historyCoalesceMs);
    }

    private clearPendingIntensityOp() {
        if (this.pendingIntensityTimer !== null) {
            window.clearTimeout(this.pendingIntensityTimer);
            this.pendingIntensityTimer = null;
        }
        this.pendingIntensityOp = null;
        this.pendingIntensityFresh = false;
    }

    private commitPendingIntensity() {
        this.clearPendingIntensityOp();
    }

    private onEditApplied(op: any) {
        if (!this.pendingIntensityOp) {
            return;
        }
        if (op === this.pendingIntensityOp) {
            if (this.pendingIntensityFresh) {
                this.pendingIntensityFresh = false;
                return;
            }
        }
        this.clearPendingIntensityOp();
    }
}

export { LightRig };
