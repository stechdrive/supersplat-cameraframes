import {
    BLEND_NORMAL,
    BUFFER_STATIC,
    PRIMITIVE_POINTS,
    SEMANTIC_POSITION,
    ShaderMaterial,
    Mesh,
    MeshInstance,
    TYPE_UINT32,
    VertexBuffer,
    VertexFormat,
    WebglGraphicsDevice
} from 'playcanvas';

import { ElementType, Element } from './element';
import { vertexShader, fragmentShader } from './shaders/splat-overlay-shader';
import { Splat } from './splat';

class SplatOverlay extends Element {
    meshInstance: MeshInstance;
    splat: Splat;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const scene = this.scene;
        const device = scene.graphicsDevice;

        const material = new ShaderMaterial({
            uniqueName: 'splatOverlayMaterial',
            attributes: { vertex_id: SEMANTIC_POSITION },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });
        material.blendType = BLEND_NORMAL;

        const mesh = new Mesh(device);

        const meshInstance = new MeshInstance(mesh, material, null);

        const events = this.scene.events;

        const update = (splat: Splat) => {
            if (!splat) {
                meshInstance.node = null;
                return;
            }

            const renderSystem = this.scene.renderSystem;

            if (!renderSystem.mergedResource) {
                meshInstance.node = null;
                return;
            }

            const splatData = splat.splatData;
            const offset = renderSystem.offsets.get(splat) ?? 0;
            const count = renderSystem.counts.get(splat) ?? splatData.numSplats;

            const vertexFormat = new VertexFormat(device, [{
                semantic: SEMANTIC_POSITION,
                components: 1,
                type: TYPE_UINT32,
                asInt: true
            }]);

            // TODO: make use of Splat's mapping instead of rendering all splats
            const vertexData = new Uint32Array(count);
            for (let i = 0; i < count; ++i) {
                vertexData[i] = i;
            }

            const vertexBuffer = new VertexBuffer(device, vertexFormat, count, {
                usage: BUFFER_STATIC,
                data: vertexData.buffer
            });

            if (mesh.vertexBuffer) {
                mesh.vertexBuffer.destroy();
                mesh.vertexBuffer = null;
            }

            mesh.vertexBuffer = vertexBuffer;
            mesh.primitive[0] = {
                type: PRIMITIVE_POINTS,
                base: 0,
                baseVertex: 0,
                count
            };

            material.setParameter('splatState', renderSystem.stateTexture);
            material.setParameter('splatPosition', renderSystem.mergedResource.transformATexture);
            material.setParameter('splatTransform', renderSystem.transformTexture);
            material.setParameter('transformPalette', renderSystem.transformPalette.texture);
            const tex = renderSystem.mergedResource.transformATexture;
            material.setParameter('globalParams', [tex.width, tex.width * tex.height]);
            material.setParameter('splatOffset', offset);
            material.setParameter('splatCount', count);
            material.update();

            // ノード行列をそのまま使用（transformPalette のローカル変換と組み合わせる）
            meshInstance.node = renderSystem.mergedEntity;
            this.splat = splat;
        };

        events.on('selection.changed', (selection: Splat) => {
            update(selection);
        });

        this.meshInstance = meshInstance;
    }

    destroy() {
        this.meshInstance.material.destroy();
        this.meshInstance.destroy();
    }

    onPreRender() {
        // no-op: 描画は onPostRender で行う
    }

    onPostRender() {
        const events = this.scene.events;
        const splatSize = events.invoke('camera.splatSize');

        if (!(this.meshInstance.node &&
            this.scene.camera.renderOverlays &&
            splatSize > 0 &&
            events.invoke('camera.overlay') &&
            events.invoke('camera.mode') === 'centers')) {
            return;
        }

        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const devW = device.width;
        const devH = device.height;
        const aspect = this.scene.aspectViewport;
        const useAspect = aspect.enabled && aspect.width > 0 && aspect.height > 0;

        // カメラの最終 blit と同じ矩形に合わせてバックバッファへ描画し、レターボックス時のズレを防ぐ
        device.setRenderTarget(null);
        if (useAspect) {
            device.setViewport(aspect.offsetX, aspect.offsetY, aspect.width, aspect.height);
            device.setScissor(aspect.offsetX, aspect.offsetY, aspect.width, aspect.height);
        } else {
            device.setViewport(0, 0, devW, devH);
            device.setScissor(0, 0, devW, devH);
        }

        const selectedClr = events.invoke('selectedClr');
        const unselectedClr = events.invoke('unselectedClr');
        const { material } = this.meshInstance;
        material.setParameter('splatSize', splatSize * window.devicePixelRatio);
        material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a]);
        material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
        material.setParameter('transformPalette', this.scene.renderSystem.transformPalette.texture);
        this.scene.app.drawMeshInstance(this.meshInstance);

        // 後続描画のためにリセット
        device.setViewport(0, 0, devW, devH);
        device.setScissor(0, 0, devW, devH);
    }
}

export { SplatOverlay };
