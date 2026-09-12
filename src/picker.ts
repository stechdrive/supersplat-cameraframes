import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ZERO,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BlendState,
    Color,
    GraphicsDevice,
    RenderPassPicker,
    RenderTarget
} from 'playcanvas';

import type { Camera } from './camera';
import { Scene } from './scene';
import { Splat } from './splat';

const idClearColor = new Color(1, 1, 1, 1);
const depthClearColor = new Color(0, 0, 0, 1);

// Shared buffer for half-to-float conversion
const float32 = new Float32Array(1);
const uint32 = new Uint32Array(float32.buffer);

// Convert 16-bit half-float to 32-bit float using bit manipulation
const half2Float = (h: number): number => {
    const sign = (h & 0x8000) << 16;           // Move sign to bit 31
    const exponent = (h & 0x7C00) >> 10;       // Extract 5-bit exponent
    const mantissa = h & 0x03FF;               // Extract 10-bit mantissa

    if (exponent === 0) {
        if (mantissa === 0) {
            // Zero
            uint32[0] = sign;
        } else {
            // Denormalized: convert to normalized float32
            let e = -1;
            let m = mantissa;
            do {
                e++;
                m <<= 1;
            } while ((m & 0x0400) === 0);
            uint32[0] = sign | ((127 - 15 - e) << 23) | ((m & 0x03FF) << 13);
        }
    } else if (exponent === 31) {
        // Infinity or NaN
        uint32[0] = sign | 0x7F800000 | (mantissa << 13);
    } else {
        // Normalized: adjust exponent bias from 15 to 127
        uint32[0] = sign | ((exponent + 127 - 15) << 23) | (mantissa << 13);
    }

    return float32[0];
};

class Picker {
    private device: GraphicsDevice;
    private scene: Scene;

    // Render targets (provided by camera)
    private depthRenderTarget: RenderTarget | null = null;
    private idRenderTarget: RenderTarget | null = null;

    // Render pass (shared for depth and ID picking)
    private renderPass: RenderPassPicker;
    private worldPass: RenderPassPicker;

    // Blend state for depth accumulation
    private depthBlendState: BlendState;

    constructor(scene: Scene, private camera: Camera) {
        this.scene = scene;
        this.device = scene.graphicsDevice;

        // Create shared render pass for picking
        this.renderPass = new RenderPassPicker(this.device, this.scene.app.renderer);
        this.worldPass = new RenderPassPicker(this.device, this.scene.app.renderer);

        // Blend state for depth accumulation:
        // RGB: additive depth accumulation (ONE, ONE_MINUS_SRC_ALPHA)
        // Alpha: multiplicative transmittance (ZERO, ONE_MINUS_SRC_ALPHA) -> T = T * (1 - alpha)
        this.depthBlendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA,           // RGB blend
            BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE_MINUS_SRC_ALPHA           // Alpha blend (transmittance)
        );
    }

    // Set render targets from camera
    setRenderTargets(depthRT: RenderTarget, idRT: RenderTarget) {
        this.depthRenderTarget = depthRT;
        this.idRenderTarget = idRT;
    }

    private prepareWorldDepth(target: RenderTarget) {
        // Use Engine's standard mesh picker to seed mesh depth, then clear only
        // color for Gaussian IDs/transmittance. No material or engine patches.
        this.worldPass.init(target);
        this.worldPass.setClearDepth(1);
        this.worldPass.setClearColor(idClearColor);
        const mapping = new Map();
        this.worldPass.update(this.camera.camera, this.scene.app.scene, [this.scene.worldLayer], mapping, false);
        this.worldPass.render();
        this.renderPass.depthStencilOps.clearDepth = false;
        return mapping;
    }

    async readMesh(x: number, y: number) {
        const mapping = this.prepareWorldDepth(this.idRenderTarget);
        const encoded = await this.readId(x, y);
        // Engine's mesh IDs use A:R:G:B; Gaussian IDs use little endian RGBA.
        const id = (((encoded >>> 24) << 24) | ((encoded & 255) << 16) | (encoded & 0xff00) | ((encoded >>> 16) & 255)) >>> 0;
        return { mesh: mapping.get(id) ?? null, id, count: mapping.size };
    }

    // Prepare for ID picking by rendering the specified splat
    prepareId(splat: Splat, mode: 'add' | 'remove' | 'set' | 'intersect') {
        if (!this.idRenderTarget) {
            return;
        }

        // the id pass draws the compact list through the sort, so it needs a
        // current sorted projection: a stochastic frame leaves sortedIndices
        // stale (old camera, old survivor set)
        this.camera.projector.renderSortedForPick(this.camera);

        const { splatLayer } = this.camera;

        // 'intersect' picks against the currently-selected set (same render as
        // 'remove') so unselected splats can't occlude selected ones and skew it.
        const pickOp = mode === 'intersect' ? 'remove' : mode;
        const pickOpIndex = ['add', 'remove', 'set'].indexOf(pickOp);

        // Set picker uniforms
        this.device.scope.resolve('pickOp').setValue(pickOpIndex);
        this.device.scope.resolve('pickMode').setValue(0);
        this.camera.projector.preparePick(splat, pickOpIndex, false);

        // Render ID picking pass
        const emptyMap = new Map();
        this.renderPass.blendState = BlendState.NOBLEND;
        this.renderPass.init(this.idRenderTarget);
        this.prepareWorldDepth(this.idRenderTarget);
        this.renderPass.setClearColor(idClearColor);
        this.renderPass.update(this.camera.camera, this.scene.app.scene, [splatLayer], emptyMap, false);
        try {
            this.renderPass.render();
        } finally {
            this.camera.projector.finishPick();
        }
    }

    // Read single splat ID at normalized screen position (after prepareId)
    async readId(x: number, y: number): Promise<number> {
        if (!this.idRenderTarget) {
            return -1;
        }
        // For single pixel read, use a minimal normalized size
        const rt = this.idRenderTarget;
        const ids = await this.readIds(x, y, 1 / rt.width, 1 / rt.height);
        return ids[0];
    }

    // Read rectangle of splat IDs using normalized coordinates (0-1 range) (after prepareId)
    async readIds(x: number, y: number, width: number, height: number): Promise<number[]> {
        if (!this.idRenderTarget) {
            return [];
        }

        const rt = this.idRenderTarget;
        const colorBuffer = rt.colorBuffer;

        // Convert normalized coordinates to render target pixels
        const px = Math.floor(x * rt.width);
        const py = Math.floor(y * rt.height);
        const pw = Math.max(1, Math.ceil((x + width) * rt.width) - px);
        const ph = Math.max(1, Math.ceil((y + height) * rt.height) - py);
        const result: number[] = new Array(pw * ph).fill(0xffffffff);
        const x0 = Math.max(0, px);
        const y0 = Math.max(0, py);
        const readWidth = Math.min(rt.width, px + pw) - x0;
        const readHeight = Math.min(rt.height, py + ph) - y0;
        if (readWidth <= 0 || readHeight <= 0) return result;

        // Read pixels using texture.read() API. The read must be immediate: the
        // id pass is rendered synchronously by prepareId and nothing submits the
        // shared command encoder before the caller awaits us, so a deferred read
        // maps the staging buffer before the copy has run and returns zeros.
        const pixels = await colorBuffer.read(x0, y0, readWidth, readHeight, {
            renderTarget: rt,
            immediate: true
        });

        // Row 0 of the result is the top row of the requested rectangle.
        for (let row = 0; row < readHeight; ++row) {
            const src = row * readWidth;
            for (let col = 0; col < readWidth; ++col) {
                const i = (src + col) * 4;
                // Use >>> 0 to convert signed 32-bit to unsigned (so 0xffffffff instead of -1)
                result[(row + y0 - py) * pw + col + x0 - px] = (
                    (pixels[i] |
                    (pixels[i + 1] << 8) |
                    (pixels[i + 2] << 16) |
                    (pixels[i + 3] << 24)) >>> 0
                );
            }
        }

        return result;
    }

    // Prepare for depth picking by rendering the specified splat
    prepareDepth(splat: Splat) {
        if (!this.depthRenderTarget) {
            return;
        }

        const { scene } = this;
        const { app } = scene;
        const { camera } = this;
        const { splatLayer } = camera;
        camera.projector.renderSortedForPick(camera);
        const emptyMap = new Map();

        // Set depth estimation mode uniform
        this.device.scope.resolve('pickOp').setValue(2); // 'set' mode - don't skip any visible splats
        this.device.scope.resolve('pickMode').setValue(1);
        camera.projector.preparePick(splat, 2, true);

        // Render scene with depth pass
        this.renderPass.blendState = this.depthBlendState;
        this.renderPass.init(this.depthRenderTarget);
        this.prepareWorldDepth(this.depthRenderTarget);
        this.renderPass.setClearColor(depthClearColor);
        this.renderPass.update(camera.camera, app.scene, [splatLayer], emptyMap, false);
        try {
            this.renderPass.render();
        } finally {
            camera.projector.finishPick();
        }
    }

    // Read normalized depth (0-1) at normalized screen position (0-1 range) (after prepareDepth)
    async readDepth(x: number, y: number): Promise<number | null> {
        if (!this.depthRenderTarget) {
            return null;
        }

        const rt = this.depthRenderTarget;
        const colorBuffer = rt.colorBuffer;

        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1 || rt.width < 1 || rt.height < 1) {
            return null;
        }

        // Convert normalized coordinates to render target pixels
        const px = Math.min(Math.floor(x * rt.width), rt.width - 1);
        const py = Math.min(Math.floor(y * rt.height), rt.height - 1);

        // Read the pixel using Texture.read() which handles RGBA16F format
        const pixels = await colorBuffer.read(px, py, 1, 1, {
            renderTarget: rt,
            immediate: true
        });

        return this.decodeDepth(pixels, 0);
    }

    // Read normalized depth at scattered screen positions. Points are grouped
    // into small tiles so a brush stroke needs a handful of readbacks instead
    // of one readback per sample or one large read of its whole screen bound.
    async readDepths(points: { x: number, y: number }[]): Promise<(number | null)[]> {
        if (!this.depthRenderTarget) {
            return new Array(points.length).fill(null);
        }

        const rt = this.depthRenderTarget;
        const pixelsX = new Int32Array(points.length);
        const pixelsY = new Int32Array(points.length);
        const result: (number | null)[] = new Array(points.length).fill(null);
        const tiles = new Map<string, { indices: number[], minX: number, minY: number, maxX: number, maxY: number }>();
        const tileSize = 64;

        for (let i = 0; i < points.length; ++i) {
            const { x, y } = points[i];
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1 || rt.width < 1 || rt.height < 1) {
                continue;
            }

            const px = Math.min(Math.floor(x * rt.width), rt.width - 1);
            const py = Math.min(Math.floor(y * rt.height), rt.height - 1);
            pixelsX[i] = px;
            pixelsY[i] = py;
            const key = `${Math.floor(px / tileSize)},${Math.floor(py / tileSize)}`;
            const tile = tiles.get(key);
            if (tile) {
                tile.indices.push(i);
                tile.minX = Math.min(tile.minX, px);
                tile.minY = Math.min(tile.minY, py);
                tile.maxX = Math.max(tile.maxX, px);
                tile.maxY = Math.max(tile.maxY, py);
            } else {
                tiles.set(key, { indices: [i], minX: px, minY: py, maxX: px, maxY: py });
            }
        }

        for (const tile of tiles.values()) {
            const width = tile.maxX - tile.minX + 1;
            const height = tile.maxY - tile.minY + 1;
            const pixels = await rt.colorBuffer.read(tile.minX, tile.minY, width, height, {
                renderTarget: rt,
                immediate: true
            });

            for (const index of tile.indices) {
                const offset = ((pixelsY[index] - tile.minY) * width + pixelsX[index] - tile.minX) * 4;
                result[index] = this.decodeDepth(pixels, offset);
            }
        }

        return result;
    }

    private decodeDepth(pixels: any, offset: number): number | null {
        // R channel: accumulated depth * alpha
        // A channel: transmittance (1 - alpha)
        const r = half2Float(pixels[offset]);
        const transmittance = half2Float(pixels[offset + 3]);
        const alpha = 1 - transmittance;

        // Check alpha (transmittance close to 1 means nothing visible)
        if (alpha < 1e-6) {
            return null;
        }

        // Return normalized depth (0-1 range)
        return r / alpha;
    }

    // Clean up resources
    destroy() {
        this.renderPass?.destroy();
        this.worldPass?.destroy();
    }
}

export { Picker };
