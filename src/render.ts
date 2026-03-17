import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, MkvOutputFormat, MovOutputFormat, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat } from 'mediabunny';
import { Color, Layer, path, Vec3 } from 'playcanvas';

import { registerCameraFramesRenderBridge, type OffscreenRenderOptions } from './camera-frames-render-bridge';
import { ElementType } from './element';
import { Events } from './events';
import { PngCompressor } from './png-compressor';
import { Scene } from './scene';
import { Splat } from './splat';
import { localize } from './ui/localization';

const nullClr = new Color(0, 0, 0, 0);

// Lookup maps for video output format and codec configuration
const FORMAT_CONFIG: Record<string, { create: (streaming: boolean) => Mp4OutputFormat | MovOutputFormat | MkvOutputFormat | WebMOutputFormat; extension: string }> = {
    mp4: { create: streaming => new Mp4OutputFormat({ fastStart: streaming ? false : 'in-memory' }), extension: 'mp4' },
    webm: { create: () => new WebMOutputFormat(), extension: 'webm' },
    mov: { create: streaming => new MovOutputFormat({ fastStart: streaming ? false : 'in-memory' }), extension: 'mov' },
    mkv: { create: () => new MkvOutputFormat(), extension: 'mkv' }
};

const CODEC_CONFIG: Record<string, { type: 'avc' | 'hevc' | 'vp9' | 'av1'; codec: (height: number) => string }> = {
    h264: { type: 'avc', codec: h => (h < 1080 ? 'avc1.420028' : 'avc1.640033') }, // H.264 Constrained Baseline/High profile
    h265: { type: 'hevc', codec: () => 'hev1.1.6.L120.B0' },                       // H.265 Main profile, Level 4.0
    vp9: { type: 'vp9', codec: () => 'vp09.00.10.08' },                            // VP9 Profile 0, Level 1.0
    av1: { type: 'av1', codec: () => 'av01.0.05M.08' }                             // AV1 Main Profile, Level 3.1
};

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

    registerCameraFramesRenderBridge(scene, events, postRender);

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
                header: localize('panel.render.failed'),
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

    events.function('render.video', (videoSettings: VideoSettings, fileStream: FileSystemWritableFileStream) => {
        const renderImpl = async () => {
            events.fire('progressStart', localize('panel.render.render-video'), true);

            let cancelled = false;
            const cancelHandler = events.on('progressCancel', () => {
                cancelled = true;
            });

            const restoreLayers: Array<{ layer: Layer; enabled: boolean; }> = [];
            const prevOffscreenIncludeReferenceImage = scene.renderFlags.offscreenIncludeReferenceImage;
            let encoder: VideoEncoder | null = null;

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

                const formatConfig = FORMAT_CONFIG[format] ?? FORMAT_CONFIG.mp4;
                const outputFormat = formatConfig.create(!!fileStream);
                const fileExtension = formatConfig.extension;

                const codecConfig = CODEC_CONFIG[codecChoice] ?? CODEC_CONFIG.h264;
                const codecType = codecConfig.type;
                const codec = codecConfig.codec(height);

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

                const createEncoder = () => {
                    encoderError = null;
                    const enc = new VideoEncoder({
                        output: async (chunk, meta) => {
                            const encodedPacket = EncodedPacket.fromEncodedChunk(chunk);
                            await videoSource.add(encodedPacket, meta);
                        },
                        error: (error) => {
                            encoderError = error;
                        }
                    });
                    enc.configure({ codec, width, height, bitrate });
                    return enc;
                };

                encoder = createEncoder();

                scene.camera.startOffscreenMode(width, height);
                scene.renderFlags.offscreenIncludeReferenceImage = includeReferenceImage;
                scene.camera.renderOverlays = showDebug;
                scene.gizmoLayer.enabled = false;
                if (!transparentBg) {
                    scene.camera.clearPass.setClearColor(events.invoke('bgClr'));
                }
                scene.lockedRenderMode = true;

                const data = new Uint8Array(width * height * 4);
                const line = new Uint8Array(width * 4);
                const lastPos = new Vec3(0, 0, 0);
                const lastForward = new Vec3(1, 0, 0);

                const sortAndWait = async () => {
                    await scene.splatRenderLifecycle.waitForSorter();
                    await scene.splatRenderLifecycle.waitForSorter();
                };

                const prepareFrame = async (frameTime: number): Promise<Splat | null> => {
                    events.fire('timeline.time', frameTime);

                    const newSplat = await events.invoke('plysequence.setFrameAsync', Math.floor(frameTime)) as Splat | null;

                    scene.camera.onUpdate(0);

                    const pos = scene.camera.position;
                    const forward = scene.camera.forward;
                    const moved = !lastPos.equals(pos) || !lastForward.equals(forward);
                    if (moved) {
                        lastPos.copy(pos);
                        lastForward.copy(forward);
                    }

                    if (newSplat || moved) {
                        await sortAndWait();
                    }

                    return newSplat;
                };

                const captureFrame = async (frameTime: number) => {
                    const { mainTarget, workTarget } = scene.camera;

                    scene.dataProcessor.copyRt(mainTarget, workTarget);
                    await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data });

                    for (let y = 0; y < height / 2; y++) {
                        const top = y * width * 4;
                        const bottom = (height - y - 1) * width * 4;
                        line.set(data.subarray(top, top + width * 4));
                        data.copyWithin(top, bottom, bottom + width * 4);
                        data.set(line, bottom);
                    }

                    const videoFrame = new VideoFrame(data, {
                        format: 'RGBA',
                        codedWidth: width,
                        codedHeight: height,
                        timestamp: Math.floor(1e6 * frameTime),
                        duration: Math.floor(1e6 / frameRate)
                    });

                    while ((encoder?.encodeQueueSize ?? 0) > 5) {
                        await new Promise<void>((resolve) => {
                            setTimeout(resolve, 1);
                        });
                    }

                    let forceKeyFrame = false;
                    if (encoder?.state === 'closed' && encoderError?.message?.includes('reclaimed')) {
                        encoder = createEncoder();
                        forceKeyFrame = true;
                    }

                    if (encoderError) {
                        videoFrame.close();
                        throw encoderError;
                    }

                    encoder?.encode(videoFrame, { keyFrame: forceKeyFrame });
                    videoFrame.close();
                };

                const animFrameRate = events.invoke('timeline.frameRate');
                const duration = (endFrame - startFrame) / animFrameRate;

                for (let frameTime = 0; frameTime <= duration; frameTime += 1.0 / frameRate) {
                    if (cancelled) break;

                    await prepareFrame(startFrame + frameTime * animFrameRate);

                    scene.lockedRender = true;
                    await postRender();
                    await captureFrame(frameTime);

                    events.fire('progressUpdate', {
                        text: localize('panel.render.rendering', { ellipsis: true }),
                        progress: 100 * frameTime / duration
                    });
                }

                await encoder.flush();
                await output.finalize();

                if (!cancelled && !fileStream) {
                    const currentSplats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(splat => splat.visible);
                    downloadFile((output.target as BufferTarget).buffer, `${removeExtension(currentSplats[0]?.name ?? 'supersplat')}.${fileExtension}`);
                }

                return !cancelled;
            } catch (error) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('panel.render.failed'),
                    message: `'${(error as any).message ?? error}'`
                });
                return false;
            } finally {
                if (encoder && encoder.state !== 'closed') {
                    encoder.close();
                }
                cancelHandler.off();

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
                scene.forceRender = true;
                scene.renderFlags.offscreenIncludeReferenceImage = prevOffscreenIncludeReferenceImage;

                events.fire('progressEnd');
            }
        };

        if (navigator.locks) {
            return navigator.locks.request('supersplat-video-render', renderImpl);
        }
        return renderImpl();
    });
};

export { ImageSettings, VideoSettings, registerRenderEvents };
export type { OffscreenRenderOptions };
