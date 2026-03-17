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
    WebglGraphicsDevice,
    BlendState,
    DepthState,
    CULLFACE_NONE,
    Mat4
} from 'playcanvas';

import {
    buildCameraProjectionData,
    createCameraProjectionData,
    type CameraProjectionData
} from './camera-matrices';
import { ElementType, Element } from './element';
import { vertexShader, fragmentShader } from './shaders/splat-overlay-shader';
import { Splat } from './splat';
import type { SplatRenderOverlayBinding } from './splat-render-backend';

class SplatOverlay extends Element {
    meshInstance: MeshInstance;
    splat: Splat;
    overlayBinding: SplatRenderOverlayBinding | null = null;
    cameraMatrices: CameraProjectionData = createCameraProjectionData();

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const scene = this.scene;
        const device = scene.graphicsDevice;

        // NOTE:
        // upstream #833 rewrites this overlay for the standard GSplat path as a performance tweak.
        // CAMERA_FRAMES uses a merged splat renderer + custom frustum alignment, so that change must
        // not be applied here verbatim without re-validating positioning.

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

            const renderSystem = this.scene.splatRenderOverlay;
            const binding = renderSystem.getOverlayBinding(splat);

            if (!binding) {
                meshInstance.node = null;
                this.overlayBinding = null;
                return;
            }

            const { positionTexture, stateTexture, transformTexture, transformPaletteTexture, offset, count, globalParams } = binding;

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

            material.setParameter('splatState', stateTexture);
            material.setParameter('splatPosition', positionTexture);
            material.setParameter('splatTransform', transformTexture);
            material.setParameter('transformPalette', transformPaletteTexture);
            material.setParameter('globalParams', globalParams);
            material.setParameter('splatOffset', offset);
            material.setParameter('splatCount', count);
            material.update();

            // ノード行列をそのまま使用（transformPalette のローカル変換と組み合わせる）
            meshInstance.node = binding.node;
            this.overlayBinding = binding;
            this.splat = splat;
        };

        events.on('selection.changed', (selection: Element) => {
            update(selection instanceof Splat ? selection : null);
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

        // カメラの最終 blit と同じ矩形に合わせてバックバッファへ描画し、レターボックス時のズレを防ぐ
        // 修正: 統合レンダラーおよび CAMERA FRAMES v6 は全画面ビューポート + 非対称フラスタムで位置合わせを行うため
        // ここで aspectViewport に合わせてビューポートを絞ると座標がずれてゴースト化する。常に全画面を使用する。
        // 修正: Outlineクラスと同様に、updateBegin/End を使用してGPUステートを確実にリセットする。
        // これにより、Outline非表示時でも正しいビューポートとシザーが適用されるようになる。
        device.setRenderTarget(this.scene.camera.camera.renderTarget);
        device.updateBegin();

        // 修正: Outline非表示時に描画ステート（深度など）が不定になりズレや消失の原因となるため、
        // Outlineクラスと同様に明示的にメインカメラと同じステートを設定して環境を統一する。
        device.setDepthState(DepthState.NODEPTH);
        device.setCullMode(CULLFACE_NONE);
        device.setBlendState(BlendState.ALPHABLEND);
        device.setStencilState(null, null);

        const selectedClr = events.invoke('selectedClr');
        const unselectedClr = events.invoke('unselectedClr');
        const { material } = this.meshInstance;
        const binding = this.overlayBinding;
        if (!binding) {
            return;
        }
        material.setParameter('splatSize', splatSize * window.devicePixelRatio);
        material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a]);
        material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
        material.setParameter('transformPalette', binding.transformPaletteTexture);

        // 修正: シェーダ側の自動ユニフォーム依存を廃止し、明示的にメインカメラの行列を渡す。
        // これにより、postrender 時に他のカメラ（ピッカー等）の行列が残っている可能性やタイミングのズレを排除する。
        const cameraComponent = this.scene.camera.camera;
        if (!buildCameraProjectionData(cameraComponent, this.cameraMatrices)) {
            this.cameraMatrices.view.copy(cameraComponent.viewMatrix);
            this.cameraMatrices.projection.copy(cameraComponent.projectionMatrix);
        }
        material.setParameter('view_matrix', this.cameraMatrices.view.data);
        material.setParameter('projection_matrix', this.cameraMatrices.projection.data);

        this.scene.app.drawMeshInstance(this.meshInstance);

        device.updateEnd();
    }
}

export { SplatOverlay };
