import { Color, Entity, Layer, RenderPass, RenderPassForward } from 'playcanvas';

import { Camera } from '../camera';
import { ElementType } from '../element';
import { LightRig } from '../light-rig';
import type { Model } from '../model';
import { ProjectedSplatRenderer } from '../projected-splat-renderer';
import type { Scene } from '../scene';
import type { Splat } from '../splat';
import type { RenderView } from './render-view';

const nextFrame = (scene: Scene) => new Promise<void>((resolve, reject) => {
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};
    const handle = scene.events.on('postrender', () => {
        handle.off(); clearTimeout(pending.timer); resolve();
    });
    pending.timer = setTimeout(() => {
        handle.off(); reject(new Error('撮影画像の描画が完了しませんでした'));
    }, 15000);
    scene.lockedRender = true;
    scene.forceRender = true;
});

// Output owns its projection, sort, targets, uniforms and layer membership.
// Only source Gaussian data and ordinary mesh instances are shared. Call from
// the scene command queue so a readback cannot race an editing command.
export class ShotRenderer {
    readonly camera = new Camera(false);
    private world = new Layer({ name: 'OutputModels' });
    private splatLayer = new Layer({ name: 'OutputSplats' });
    private occluderLayer = new Layer({ name: 'OutputOccluders' });
    private occluderPass: RenderPassForward;
    private colorClear: RenderPass;
    private projectors: Splat[] = [];
    private disposed = false;

    private constructor(private scene: Scene) {}

    static async create(scene: Scene) {
        const output = new ShotRenderer(scene);
        const { camera, world, splatLayer } = output;
        scene.app.scene.layers.push(world);
        scene.app.scene.layers.push(splatLayer);
        scene.app.scene.layers.push(output.occluderLayer);
        camera.worldLayer = world;
        camera.splatLayer = splatLayer;
        camera.projector = new ProjectedSplatRenderer(scene, splatLayer, false);
        scene.splatRenderers.add(camera.projector);
        camera.active = false;
        camera.renderOverlays = false;
        camera.inputEnabled = false;
        await scene.add(camera);
        camera.camera.layers = [...camera.camera.layers, output.occluderLayer.id];
        camera.tonemapping = scene.camera.tonemapping;
        output.colorClear = new RenderPass(scene.graphicsDevice);
        return output;
    }

    async capture(view: RenderView, options: { mode?: 'composite' | 'front-alpha'; models?: Model[]; occluders?: Model[]; splats?: Splat[]; grid?: boolean } = {}) {
        if (this.disposed) throw new Error('出力カメラは破棄済みです');
        const { scene, camera } = this;
        const splats = options.splats ?? scene.getElementsByType(ElementType.splat) as Splat[];
        const models = options.models ?? scene.getElementsByType(ElementType.model) as Model[];
        this.projectors.forEach(splat => camera.projector.remove(splat));
        this.projectors = splats.filter(splat => splat.visible);
        this.projectors.forEach(splat => camera.projector.add(splat));
        this.world.clearMeshInstances();
        this.occluderLayer.clearMeshInstances();
        const addModels = (layer: Layer, values: Model[]) => {
            for (const model of values.filter(model => model.visible)) {
                for (const node of model.nodes) {
                    const render = (node as Entity).render;
                    if (render && node.enabled) layer.addMeshInstances([...render.meshInstances]);
                }
            }
        };
        addModels(this.world, models);
        addModels(this.occluderLayer, options.occluders ?? []);
        for (const element of scene.elements) {
            if (element instanceof LightRig) this.world.addLight(element.light.light);
        }
        const locked = scene.lockedRenderMode;
        try {
            scene.lockedRenderMode = true;
            camera.active = true;
            camera.setView(view);
            camera.startOffscreenMode(view.size.width, view.size.height);
            camera.exportGrid = !!options.grid;
            this.colorClear.init(camera.splatTarget);
            this.colorClear.setClearColor(new Color(0, 0, 0, 0));
            if (!this.occluderPass) {
                this.occluderPass = new RenderPassForward(scene.graphicsDevice, scene.app.scene.layers, scene.app.scene, scene.app.renderer);
                // addLayer snapshots the target: initialize it before registering
                // the steps, as the native camera's own forward passes do.
                this.occluderPass.init(camera.mainTarget);
                this.occluderPass.addLayer(camera.camera, this.occluderLayer, false, false);
                this.occluderPass.addLayer(camera.camera, this.occluderLayer, true, false);
            }
            camera.camera.framePasses = [camera.clearPass, camera.mainPass,
                ...(options.mode === 'front-alpha' ? [this.colorClear, this.occluderPass] : []), camera.splatPass];
            await nextFrame(scene);
            const { width, height } = view.size;
            const data = new Uint8Array(width * height * 4);
            scene.dataProcessor.copyRt(camera.mainTarget, camera.workTarget);
            await camera.workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: camera.workTarget, data, immediate: true });
            return data;
        } finally {
            camera.active = false;
            camera.camera.enabled = false;
            camera.exportGrid = false;
            scene.lockedRenderMode = locked;
            scene.forceRender = true;
        }
    }

    destroy() {
        if (this.disposed) return;
        this.disposed = true;
        const projector = this.camera.projector;
        this.scene.remove(this.camera);
        this.scene.splatRenderers.delete(projector);
        projector.destroy();
        this.colorClear?.destroy();
        this.occluderPass?.destroy();
        this.scene.app.scene.layers.remove(this.world);
        this.scene.app.scene.layers.remove(this.splatLayer);
        this.scene.app.scene.layers.remove(this.occluderLayer);
        this.world.clearMeshInstances();
        this.occluderLayer.clearMeshInstances();
    }
}
