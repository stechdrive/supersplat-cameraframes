import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, MkvOutputFormat, MovOutputFormat, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat } from 'mediabunny';
import { Color, Layer, path, Vec3 } from 'playcanvas';

import { ElementType } from './element';
import { Events } from './events';
import { PngCompressor } from './png-compressor';
import { Scene } from './scene';
import { Splat } from './splat';
import { localize } from './ui/localization';

const nullClr = new Color(0, 0, 0, 0);

type ImageSettings = {
    width: number;
    height: number;
    transparentBg: boolean;
    showDebug: boolean;
    includeReferenceImage?: boolean;
};

type VideoSettings = {
    startFrame: number;
    endFrame: number;
    frameRate: number;
    width: number;
    height: number;
    bitrate: number;
    transparentBg: boolean;
    showDebug: boolean;
    format: 'mp4' | 'webm' | 'mov' | 'mkv';
    codec: 'h264' | 'h265' | 'vp9' | 'av1';
    includeReferenceImage?: boolean;
};

type OffscreenRenderOptions = {
    includeGrid?: boolean;
    includeEyeLevel?: boolean;
    overlaysOnly?: boolean;
    unpremultiplyAlpha?: boolean;
    includeReferenceImage?: boolean;
};

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
};

const downloadFile = (arrayBuffer: ArrayBuffer, filename: string) => {
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.download = filename;
    el.href = url;
    el.click();
    window.URL.revokeObjectURL(url);
};

const unpremultiplyAlpha = (pixels: Uint8Array) => {
    const data = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels.buffer);
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0 || a === 255) {
            continue;
        }
        const alpha = a / 255;
        data[i + 0] = Math.min(255, Math.round(data[i + 0] / alpha));
        data[i + 1] = Math.min(255, Math.round(data[i + 1] / alpha));
        data[i + 2] = Math.min(255, Math.round(data[i + 2] / alpha));
    }
};

const registerRenderEvents = (scene: Scene, events: Events) => {
    let compressor: PngCompressor;

    // wait for postrender to fire
    const postRender = () => {
        return new Promise<boolean>((resolve, reject) => {
            const handle = scene.events.on('postrender', () => {
                handle.off();
                try {
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            });
        });
    };

    events.function('render.offscreen', async (width: number, height: number, options?: OffscreenRenderOptions): Promise<Uint8Array> => {
        const includeGrid = !!options?.includeGrid;
        const includeEyeLevel = !!options?.includeEyeLevel;
        const overlaysOnly = !!options?.overlaysOnly;
        const applyUnpremultiply = !!options?.unpremultiplyAlpha;
        const includeReferenceImage = !!options?.includeReferenceImage && !overlaysOnly;

        const restoreLayers: Array<{ layer: Layer; enabled: boolean; }> = [];
        const rememberLayer = (layer?: Layer) => {
            if (!layer) return;
            restoreLayers.push({ layer, enabled: layer.enabled });
        };
        const referenceLayers = [scene.referenceBackLayer, scene.referenceFrontLayer];
        const disableReferenceLayers = () => {
            referenceLayers.forEach((layer) => {
                if (!layer) return;
                rememberLayer(layer);
                layer.enabled = false;
            });
        };

        const prevRenderOverlays = scene.camera.renderOverlays;
        const prevRenderFlags = { ...scene.renderFlags };
        const prevGridVisible = scene.grid.visible;
        const prevEyeVisible = scene.eyeLevel.visible;
        const prevHideBounds = scene.renderFlags.hideBounds;
        const prevOffscreenIncludeReferenceImage = scene.renderFlags.offscreenIncludeReferenceImage;

        try {
            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(width, height);
            scene.renderFlags.offscreenIncludeReferenceImage = includeReferenceImage;

            const worldLayer = scene.app.scene.layers.getLayerByName('World');

            if (overlaysOnly) {
                [scene.backgroundLayer, scene.shadowLayer, scene.overlayLayer, scene.gizmoLayer, scene.modelLightingLayer, worldLayer, scene.splatLayer, ...referenceLayers].forEach((layer) => {
                    if (!layer) return;
                    rememberLayer(layer);
                    layer.enabled = false;
                });
            } else {
                rememberLayer(scene.gizmoLayer);
                scene.gizmoLayer.enabled = false;
                if (!includeReferenceImage) {
                    disableReferenceLayers();
                }
            }

            scene.camera.renderOverlays = includeGrid || includeEyeLevel;

            scene.renderFlags.forceGridOverlay = includeGrid;
            scene.renderFlags.forceEyeLevelOverlay = includeEyeLevel;
            scene.renderFlags.eyeLevelLayerOverride = includeEyeLevel ? scene.debugLayer : null;
            scene.renderFlags.gridLayerOverride = includeGrid ? scene.debugLayer : null;
            scene.renderFlags.hideBounds = overlaysOnly;
            scene.grid.visible = includeGrid;
            scene.eyeLevel.visible = includeEyeLevel;

            scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);

            // render the next frame
            scene.forceRender = true;

            // for render to finish
            await postRender();

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(width * height * 4);

            const { mainTarget, workTarget } = scene.camera;

            scene.dataProcessor.copyRt(mainTarget, workTarget);

            // read the rendered frame
            await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data });

            if (applyUnpremultiply) {
                unpremultiplyAlpha(data);
            }

            // flip y positions to have 0,0 at the top
            let line = new Uint8Array(width * 4);
            for (let y = 0; y < height / 2; y++) {
                line = data.slice(y * width * 4, (y + 1) * width * 4);
                data.copyWithin(y * width * 4, (height - y - 1) * width * 4, (height - y) * width * 4);
                data.set(line, (height - y - 1) * width * 4);
            }

            return data;
        } finally {
            restoreLayers.forEach(({ layer, enabled }) => {
                if (layer) {
                    layer.enabled = enabled;
                }
            });
            scene.renderFlags.forceGridOverlay = prevRenderFlags.forceGridOverlay;
            scene.renderFlags.forceEyeLevelOverlay = prevRenderFlags.forceEyeLevelOverlay;
            scene.renderFlags.eyeLevelLayerOverride = prevRenderFlags.eyeLevelLayerOverride;
            scene.renderFlags.gridLayerOverride = prevRenderFlags.gridLayerOverride;
            scene.renderFlags.hideBounds = prevHideBounds;
            scene.renderFlags.offscreenIncludeReferenceImage = prevOffscreenIncludeReferenceImage;
            scene.grid.visible = prevGridVisible;
            scene.eyeLevel.visible = prevEyeVisible;
            scene.camera.endOffscreenMode();
            scene.camera.renderOverlays = prevRenderOverlays;
            scene.camera.camera.clearColor.set(0, 0, 0, 0);
        }
    });

    events.function('render.image', async (imageSettings: ImageSettings) => {
        events.fire('startSpinner');

        const restoreLayers: Array<{ layer: Layer; enabled: boolean; }> = [];
        const prevOffscreenIncludeReferenceImage = scene.renderFlags.offscreenIncludeReferenceImage;

        try {
            const { width, height, transparentBg, showDebug } = imageSettings;
            const includeReferenceImage = !!imageSettings.includeReferenceImage;
            const rememberLayer = (layer?: Layer) => {
                if (!layer) return;
                restoreLayers.push({ layer, enabled: layer.enabled });
            };
            if (!includeReferenceImage) {
                [scene.referenceBackLayer, scene.referenceFrontLayer].forEach((layer) => {
                    if (!layer) return;
                    rememberLayer(layer);
                    layer.enabled = false;
                });
            }
            const bgClr = events.invoke('bgClr');

            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(width, height);
            scene.renderFlags.offscreenIncludeReferenceImage = includeReferenceImage;
            scene.camera.renderOverlays = showDebug;
            scene.gizmoLayer.enabled = false;
            if (!transparentBg) {
                scene.camera.clearPass.setClearColor(events.invoke('bgClr'));
            }

            // render the next frame
            scene.forceRender = true;

            // for render to finish
            await postRender();

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(width * height * 4);

            const { mainTarget, workTarget } = scene.camera;

            scene.dataProcessor.copyRt(mainTarget, workTarget);

            // read the rendered frame
            await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data });

            // construct the png compressor
            if (!compressor) {
                compressor = new PngCompressor();
            }

            const arrayBuffer = await compressor.compress(
                new Uint32Array(data.buffer),
                width,
                height
            );

            // construct filename
            const selected = events.invoke('selection') as { name?: string } | null;
            const filename = `${removeExtension(selected?.name ?? 'SuperSplat')}-image.png`;

            // download
            downloadFile(arrayBuffer, filename);

            return true;
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('render.failed'),
                message: `'${error.message ?? error}'`
            });
        } finally {
            restoreLayers.forEach(({ layer, enabled }) => {
                if (layer) {
                    layer.enabled = enabled;
                }
            });
            scene.camera.endOffscreenMode();
            scene.camera.renderOverlays = true;
            scene.gizmoLayer.enabled = true;
            scene.camera.clearPass.setClearColor(nullClr);

            events.fire('stopSpinner');

            scene.renderFlags.offscreenIncludeReferenceImage = prevOffscreenIncludeReferenceImage;
        }
    });

    events.function('render.video', async (videoSettings: VideoSettings, fileStream: FileSystemWritableFileStream) => {
        events.fire('progressStart', localize('panel.render.render-video'));

        const restoreLayers: Array<{ layer: Layer; enabled: boolean; }> = [];
        const prevOffscreenIncludeReferenceImage = scene.renderFlags.offscreenIncludeReferenceImage;

        try {
            const { startFrame, endFrame, frameRate, width, height, bitrate, transparentBg, showDebug, format, codec: codecChoice } = videoSettings;
            const includeReferenceImage = !!videoSettings.includeReferenceImage;
            const rememberLayer = (layer?: Layer) => {
                if (!layer) return;
                restoreLayers.push({ layer, enabled: layer.enabled });
            };
            if (!includeReferenceImage) {
                [scene.referenceBackLayer, scene.referenceFrontLayer].forEach((layer) => {
                    if (!layer) return;
                    rememberLayer(layer);
                    layer.enabled = false;
                });
            }

            const target = fileStream ? new StreamTarget(fileStream) : new BufferTarget();

            // Configure output format based on container selection
            let outputFormat: Mp4OutputFormat | MovOutputFormat | MkvOutputFormat | WebMOutputFormat;
            let fileExtension: string;

            if (format === 'webm') {
                outputFormat = new WebMOutputFormat();
                fileExtension = 'webm';
            } else if (format === 'mov') {
                outputFormat = new MovOutputFormat({
                    fastStart: 'in-memory'
                });
                fileExtension = 'mov';
            } else if (format === 'mkv') {
                outputFormat = new MkvOutputFormat();
                fileExtension = 'mkv';
            } else {
                outputFormat = new Mp4OutputFormat({
                    fastStart: 'in-memory'
                });
                fileExtension = 'mp4';
            }

            // Configure codec based on codec selection
            let codecType: 'avc' | 'hevc' | 'vp9' | 'av1';
            let codec: string;

            if (codecChoice === 'h264') {
                codecType = 'avc';
                codec = height < 1080 ? 'avc1.420028' : 'avc1.640033'; // H.264 Constrained Baseline/High profile
            } else if (codecChoice === 'h265') {
                codecType = 'hevc';
                codec = 'hev1.1.6.L120.B0'; // H.265 Main profile, Level 4.0
            } else if (codecChoice === 'vp9') {
                codecType = 'vp9';
                codec = 'vp09.00.10.08'; // VP9 Profile 0, Level 1.0
            } else if (codecChoice === 'av1') {
                codecType = 'av1';
                codec = 'av01.0.05M.08'; // AV1 Main Profile, Level 3.1
            } else {
                codecType = 'avc';
                codec = height < 1080 ? 'avc1.420028' : 'avc1.640033'; // Default: H.264 Constrained Baseline/High
            }

            const output = new Output({
                format: outputFormat,
                target
            });

            const videoSource = new EncodedVideoPacketSource(codecType);
            output.addVideoTrack(videoSource, {
                rotation: 0,
                frameRate
            });

            await output.start();

            let encoderError: Error | null = null;

            const encoder = new VideoEncoder({
                output: async (chunk, meta) => {
                    const encodedPacket = EncodedPacket.fromEncodedChunk(chunk);
                    await videoSource.add(encodedPacket, meta);
                },
                error: (error) => {
                    encoderError = error;
                }
            });

            encoder.configure({
                codec,
                width,
                height,
                bitrate
            });

            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(width, height);
            scene.renderFlags.offscreenIncludeReferenceImage = includeReferenceImage;
            scene.camera.renderOverlays = showDebug;
            scene.gizmoLayer.enabled = false;
            if (!transparentBg) {
                scene.camera.clearPass.setClearColor(events.invoke('bgClr'));
            }
            scene.lockedRenderMode = true;

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(width * height * 4);
            const line = new Uint8Array(width * 4);

            // remember last camera position so we can skip sorting if the camera didn't move
            const last_pos = new Vec3(0, 0, 0);
            const last_forward = new Vec3(1, 0, 0);

            // helper to sort splats and wait for completion
            const sortAndWait = async () => {
                await scene.renderSystem.waitForSorter();
                await scene.renderSystem.waitForSorter();
            };

            // prepare the frame for rendering, returns the newly loaded splat if any
            const prepareFrame = async (frameTime: number): Promise<Splat | null> => {
                // Fire timeline.time for camera animation interpolation
                events.fire('timeline.time', frameTime);

                // Wait for PLY sequence to load the frame if present
                const newSplat = await events.invoke('plysequence.setFrameAsync', Math.floor(frameTime)) as Splat | null;

                // manually update the camera so position and rotation are correct
                scene.camera.onUpdate(0);

                const pos = scene.camera.position;
                const forward = scene.camera.forward;
                const moved = !last_pos.equals(pos) || !last_forward.equals(forward);
                if (moved) {
                    last_pos.copy(pos);
                    last_forward.copy(forward);
                }

                if (newSplat || moved) {
                    await sortAndWait();
                }

                return newSplat;
            };

            // capture the current video frame
            const captureFrame = async (frameTime: number) => {
                const { mainTarget, workTarget } = scene.camera;

                scene.dataProcessor.copyRt(mainTarget, workTarget);

                // read the rendered frame
                await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data });

                // flip the buffer vertically
                for (let y = 0; y < height / 2; y++) {
                    const top = y * width * 4;
                    const bottom = (height - y - 1) * width * 4;
                    line.set(data.subarray(top, top + width * 4));
                    data.copyWithin(top, bottom, bottom + width * 4);
                    data.set(line, bottom);
                }

                // construct the video frame
                const videoFrame = new VideoFrame(data, {
                    format: 'RGBA',
                    codedWidth: width,
                    codedHeight: height,
                    timestamp: Math.floor(1e6 * frameTime),
                    duration: Math.floor(1e6 / frameRate)
                });

                // wait for encoder queue to drain if necessary (backpressure handling)
                while (encoder.encodeQueueSize > 5) {
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, 1);
                    });
                }

                // check for encoder errors
                if (encoderError) {
                    videoFrame.close();
                    throw encoderError;
                }

                encoder.encode(videoFrame);
                videoFrame.close();
            };

            const animFrameRate = events.invoke('timeline.frameRate');
            const duration = (endFrame - startFrame) / animFrameRate;

            for (let frameTime = 0; frameTime <= duration; frameTime += 1.0 / frameRate) {
                // prepare the frame (loads PLY if needed, updates camera, sorts)
                await prepareFrame(startFrame + frameTime * animFrameRate);

                // render a frame
                scene.lockedRender = true;

                // wait for render to finish
                await postRender();

                // wait for capture
                await captureFrame(frameTime);

                events.fire('progressUpdate', {
                    text: localize('panel.render.rendering', { ellipsis: true }),
                    progress: 100 * frameTime / duration
                });
            }

            // Flush and finalize output
            await encoder.flush();
            await output.finalize();

            // Free resources
            encoder.close();

            // Download
            if (!fileStream) {
                const currentSplats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(splat => splat.visible);
                downloadFile((output.target as BufferTarget).buffer, `${removeExtension(currentSplats[0]?.name ?? 'supersplat')}.${fileExtension}`);
            }

            return true;
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('render.failed'),
                message: `'${error.message ?? error}'`
            });
        } finally {
            restoreLayers.forEach(({ layer, enabled }) => {
                if (layer) {
                    layer.enabled = enabled;
                }
            });
            scene.camera.endOffscreenMode();
            scene.camera.renderOverlays = true;
            scene.gizmoLayer.enabled = true;
            scene.camera.clearPass.setClearColor(nullClr);
            scene.lockedRenderMode = false;
            scene.forceRender = true;       // camera likely moved, finish with normal render
            scene.renderFlags.offscreenIncludeReferenceImage = prevOffscreenIncludeReferenceImage;

            events.fire('progressEnd');
        }
    });
};

export { ImageSettings, VideoSettings, registerRenderEvents };
export type { OffscreenRenderOptions };
