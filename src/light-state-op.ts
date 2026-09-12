import type { LightRig } from './light-rig';

export class LightStateOp {
    name = 'modelLight';
    light: LightRig;
    prevEnabled: boolean;
    prevIntensity: number;
    nextEnabled: boolean;
    nextIntensity: number;
    constructor(options: { light: LightRig; prevEnabled: boolean; prevIntensity: number; nextEnabled: boolean; nextIntensity: number }) {
        Object.assign(this, options);
    }
    do() {
        this.light.applyStateDirect(this.nextEnabled, this.nextIntensity);
    }
    undo() {
        this.light.applyStateDirect(this.prevEnabled, this.prevIntensity);
    }
}
