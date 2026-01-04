import { Button, Container, Label, NumericInput, SliderInput } from '@playcanvas/pcui';

import { DEFAULT_NEAR_CLIP, MIN_NEAR_CLIP } from '../clip-constants';
import { Events } from '../events';
import { localize } from './localization';
import mainCamSvg from './svg/camera-panel.svg';
import lockSvg from './svg/select-lock.svg';
import unlockSvg from './svg/select-unlock.svg';

type CameraFramesState = {
    enabled: boolean;
    mainCameraPose?: unknown | null;
    nearClip?: number | null;
};

type FovInfo = {
    crop: number;
    hfovDeg: number;
    hfovFrameDeg: number;
    eqMm: number;
    minEqMm: number;
    maxEqMm: number;
};

const createSvg = (svgString: string) => {
    let markup = svgString;
    const prefix = 'data:image/svg+xml,';
    if (svgString.startsWith(prefix)) {
        markup = decodeURIComponent(svgString.substring(prefix.length));
    }
    return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
};

class MainCameraPropsPanel extends Container {
    constructor(events: Events, args: any = {}) {
        super({
            ...args,
            id: 'main-camera-props-panel',
            class: ['panel', 'main-camera-props-panel'],
            hidden: true
        });

        ['pointerdown', 'pointerup', 'pointermove', 'click', 'wheel', 'dblclick'].forEach((evt) => {
            this.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });

        let suppress = false;
        let framesEnabled = false;
        let lastFovInfo: FovInfo | null = null;
        let mainPropsPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
        let mainPropsTransformEditing = false;
        let mainPropsTransformEditingDepth = 0;
        let mainPropsRollLocked = false;
        let altSlow = false;

        const panelHeader = new Container({ class: 'panel-header' });
        const panelIcon = new Container({ class: 'panel-header-icon' });
        panelIcon.dom.appendChild(createSvg(mainCamSvg));
        const panelTitle = new Label({ class: 'panel-header-label', text: localize('panel.camera-frames.main-props.title') });
        panelHeader.append(panelIcon);
        panelHeader.append(panelTitle);

        // パネルをドラッグで移動できるようにする
        let dragOffset: { x: number; y: number } | null = null;
        let currentPosition: { left: number; top: number } | null = null;

        const clampPosition = (left: number, top: number) => {
            const maxLeft = Math.max(0, window.innerWidth - this.dom.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - this.dom.offsetHeight);
            return {
                left: Math.min(Math.max(0, left), maxLeft),
                top: Math.min(Math.max(0, top), maxTop)
            };
        };

        const applyPosition = (left: number, top: number) => {
            const pos = clampPosition(left, top);
            this.dom.style.left = `${pos.left}px`;
            this.dom.style.top = `${pos.top}px`;
            this.dom.style.right = 'auto';
            this.dom.style.transform = 'none';
            currentPosition = pos;
        };

        const onPointerMove = (event: PointerEvent) => {
            if (!dragOffset) return;
            applyPosition(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
        };

        const stopDrag = () => {
            if (!dragOffset) return;
            window.removeEventListener('pointermove', onPointerMove, true);
            window.removeEventListener('pointerup', stopDrag, true);
            window.removeEventListener('pointercancel', stopDrag, true);
            this.dom.classList.remove('dragging');
            dragOffset = null;
        };

        panelHeader.dom.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== 0) return;
            event.stopPropagation();

            const rect = this.dom.getBoundingClientRect();
            dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };

            applyPosition(rect.left, rect.top);

            this.dom.classList.add('dragging');

            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', stopDrag, true);
            window.addEventListener('pointercancel', stopDrag, true);
        });

        window.addEventListener('resize', () => {
            if (!currentPosition) return;
            applyPosition(currentPosition.left, currentPosition.top);
        });

        const body = new Container({ class: 'main-camera-props-body' });

        const mainPropsFovRow = new Container({ class: 'control-parent' });
        const mainPropsFovLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.fov') });
        const mainPropsFovSlider = new SliderInput({
            class: 'control-element',
            min: 10,
            max: 200,
            precision: 1,
            value: 35
        });
        mainPropsFovSlider.dom.style.flex = '1 1 0';
        const mainPropsFovControl = new Container({ class: ['control-element-expand', 'lens-control'] });
        mainPropsFovControl.dom.style.display = 'flex';
        mainPropsFovControl.dom.style.alignItems = 'center';
        mainPropsFovControl.dom.style.gap = '6px';
        mainPropsFovControl.append(mainPropsFovSlider);
        mainPropsFovRow.append(mainPropsFovLabel);
        mainPropsFovRow.append(mainPropsFovControl);
        body.append(mainPropsFovRow);

        const mainPropsPosGrid = new Container({ class: 'control-parent' });
        const mainPosX = new NumericInput({ class: 'control-element', precision: 3, step: 0.01, value: 0, style: 'width: 70px' });
        const mainPosY = new NumericInput({ class: 'control-element', precision: 3, step: 0.01, value: 0, style: 'width: 70px' });
        const mainPosZ = new NumericInput({ class: 'control-element', precision: 3, step: 0.01, value: 0, style: 'width: 70px' });
        mainPropsPosGrid.dom.style.display = 'grid';
        mainPropsPosGrid.dom.style.gridTemplateColumns = '28px 1fr 28px 1fr 28px 1fr';
        mainPropsPosGrid.dom.style.columnGap = '4px';
        mainPropsPosGrid.dom.style.alignItems = 'center';
        mainPropsPosGrid.append(new Label({ class: 'control-label', text: 'X' }));
        mainPropsPosGrid.append(mainPosX);
        mainPropsPosGrid.append(new Label({ class: 'control-label', text: 'Y' }));
        mainPropsPosGrid.append(mainPosY);
        mainPropsPosGrid.append(new Label({ class: 'control-label', text: 'Z' }));
        mainPropsPosGrid.append(mainPosZ);
        body.append(mainPropsPosGrid);

        const mainPropsRotGrid = new Container({ class: 'control-parent' });
        const mainYawInput = new NumericInput({ class: 'control-element', precision: 2, step: 1, value: 0, style: 'width: 60px' });
        const mainPitchInput = new NumericInput({ class: 'control-element', precision: 2, step: 1, value: 0, style: 'width: 60px' });
        const mainRollInput = new NumericInput({ class: 'control-element', precision: 2, step: 1, value: 0, style: 'width: 60px' });
        const mainRollLock = new Button({ class: ['control-element', 'roll-lock-btn'], text: '' });
        mainRollLock.dom.title = localize('panel.camera-frames.transform.roll-lock');
        mainPropsRotGrid.dom.style.display = 'grid';
        mainPropsRotGrid.dom.style.gridTemplateColumns = '24px 70px 24px 70px 24px 70px 26px';
        mainPropsRotGrid.dom.style.columnGap = '2px';
        mainPropsRotGrid.dom.style.alignItems = 'center';
        mainPropsRotGrid.append(new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.yaw') }));
        mainPropsRotGrid.append(mainYawInput);
        mainPropsRotGrid.append(new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.pitch') }));
        mainPropsRotGrid.append(mainPitchInput);
        mainPropsRotGrid.append(new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.roll') }));
        mainPropsRotGrid.append(mainRollInput);
        mainPropsRotGrid.append(mainRollLock);
        body.append(mainPropsRotGrid);

        const mainPropsLocalRow = new Container({ class: 'control-parent' });
        const mainSliderLabelR = new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.right-left') });
        const mainSliderR = new SliderInput({ class: 'control-element-expand', min: -1, max: 1, step: 0.01, value: 0 });
        const mainSliderLabelU = new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.up-down') });
        const mainSliderU = new SliderInput({ class: 'control-element-expand', min: -1, max: 1, step: 0.01, value: 0 });
        const mainSliderLabelF = new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.forward-back') });
        const mainSliderF = new SliderInput({ class: 'control-element-expand', min: -1, max: 1, step: 0.01, value: 0 });
        const mainPropsLocalGrid = new Container({ class: 'control-parent' });
        mainPropsLocalGrid.dom.style.display = 'grid';
        mainPropsLocalGrid.dom.style.gridTemplateColumns = '32px 1fr 32px 1fr 32px 1fr';
        mainPropsLocalGrid.dom.style.columnGap = '6px';
        mainPropsLocalGrid.dom.style.alignItems = 'center';
        mainPropsLocalGrid.append(mainSliderLabelR);
        mainPropsLocalGrid.append(mainSliderR);
        mainPropsLocalGrid.append(mainSliderLabelU);
        mainPropsLocalGrid.append(mainSliderU);
        mainPropsLocalGrid.append(mainSliderLabelF);
        mainPropsLocalGrid.append(mainSliderF);
        mainPropsLocalRow.append(mainPropsLocalGrid);
        body.append(mainPropsLocalRow);

        const nearStep = 0.01;
        const nearStepAlt = 0.001;
        const nearPrecision = 3;
        const nearPrecisionAlt = 4;

        const mainPropsNearClipRow = new Container({ class: 'control-parent' });
        mainPropsNearClipRow.dom.style.display = 'grid';
        mainPropsNearClipRow.dom.style.gridTemplateColumns = '120px 1fr';
        mainPropsNearClipRow.dom.style.columnGap = '6px';
        mainPropsNearClipRow.dom.style.alignItems = 'center';
        const mainPropsNearClipLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.near-clip') });
        const mainPropsNearClipInput = new NumericInput({
            class: 'control-element',
            precision: nearPrecision,
            step: nearStep,
            min: MIN_NEAR_CLIP,
            value: DEFAULT_NEAR_CLIP,
            style: 'width: 120px'
        });
        mainPropsNearClipRow.append(mainPropsNearClipLabel);
        mainPropsNearClipRow.append(mainPropsNearClipInput);
        body.append(mainPropsNearClipRow);

        const updateMainPropsFovUI = (info?: FovInfo) => {
            suppress = true;
            if (info) {
                lastFovInfo = info;
            }
            const current = lastFovInfo;
            mainPropsFovSlider.enabled = !framesEnabled && !!current;
            if (!current) {
                suppress = false;
                return;
            }
            const minMm = Math.min(current.minEqMm, current.maxEqMm);
            const maxMm = Math.max(current.minEqMm, current.maxEqMm);
            mainPropsFovSlider.min = minMm;
            mainPropsFovSlider.max = maxMm;
            const clamped = Math.min(maxMm, Math.max(minMm, current.eqMm));
            mainPropsFovSlider.value = clamped;
            suppress = false;
        };

        const syncMainPropsPoseFromInputs = () => {
            mainPropsPose = {
                x: mainPosX.value,
                y: mainPosY.value,
                z: mainPosZ.value,
                yaw: mainYawInput.value,
                pitch: mainPitchInput.value,
                roll: mainRollInput.value
            };
        };

        [mainPosX, mainPosY, mainPosZ, mainYawInput, mainPitchInput, mainRollInput].forEach((input) => {
            input.dom.addEventListener('focusin', () => {
                mainPropsTransformEditingDepth += 1;
                mainPropsTransformEditing = true;
            });
            input.dom.addEventListener('focusout', () => {
                mainPropsTransformEditingDepth = Math.max(0, mainPropsTransformEditingDepth - 1);
                mainPropsTransformEditing = mainPropsTransformEditingDepth > 0;
                if (!mainPropsTransformEditing) {
                    syncMainPropsPoseFromInputs();
                }
            });
        });

        const setMainRollLockUI = (locked: boolean) => {
            mainPropsRollLocked = locked;
            mainRollLock.dom.innerHTML = '';
            mainRollLock.dom.appendChild(createSvg(locked ? lockSvg : unlockSvg));
            mainRollLock.class[locked ? 'add' : 'remove']('active');
        };
        setMainRollLockUI(false);

        const applyMainPropsRotationChange = () => {
            if (suppress) return;
            const factor = altSlow ? 0.1 : 1;
            const dyaw = mainYawInput.value - mainPropsPose.yaw;
            const dpitch = mainPitchInput.value - mainPropsPose.pitch;
            const droll = mainRollInput.value - mainPropsPose.roll;
            const newYaw = mainPropsPose.yaw + dyaw * factor;
            const newPitch = mainPropsPose.pitch + dpitch * factor;
            const newRoll = mainPropsPose.roll + droll * factor;
            suppress = true;
            mainYawInput.value = newYaw;
            mainPitchInput.value = newPitch;
            mainRollInput.value = newRoll;
            suppress = false;
            mainPropsPose = { ...mainPropsPose, yaw: newYaw, pitch: newPitch, roll: newRoll };
            const rotationPayload = {
                yaw: newYaw,
                pitch: newPitch,
                roll: newRoll,
                lockRoll: mainPropsRollLocked
            };
            events.fire('cameraFrames.setMainCameraRotation', rotationPayload);
        };

        mainRollLock.on('click', () => {
            if (suppress) return;
            setMainRollLockUI(!mainPropsRollLocked);
            applyMainPropsRotationChange();
        });

        const applyMainPropsLocalDelta = (right: number, up: number, forward: number) => {
            if (suppress) return;
            const mul = altSlow ? 0.1 : 1;
            const payload = { right: right * mul, up: up * mul, forward: forward * mul, scale: 1 };
            events.fire('cameraFrames.nudgeMainCamera', payload);
        };

        const resetSlider = (slider: SliderInput) => {
            suppress = true;
            slider.value = 0;
            suppress = false;
        };

        mainSliderR.on('change', (v: number) => {
            applyMainPropsLocalDelta(v, 0, 0);
            resetSlider(mainSliderR);
        });
        mainSliderU.on('change', (v: number) => {
            applyMainPropsLocalDelta(0, v, 0);
            resetSlider(mainSliderU);
        });
        mainSliderF.on('change', (v: number) => {
            applyMainPropsLocalDelta(0, 0, v);
            resetSlider(mainSliderF);
        });

        const updateNearStep = () => {
            const step = altSlow ? nearStepAlt : nearStep;
            const precision = altSlow ? nearPrecisionAlt : nearPrecision;
            mainPropsNearClipInput.step = step;
            mainPropsNearClipInput.precision = precision;
        };
        updateNearStep();

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Alt') {
                altSlow = true;
                updateNearStep();
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Alt') {
                altSlow = false;
                updateNearStep();
            }
        });

        const applyMainPropsPositionChange = () => {
            if (suppress) return;
            const factor = altSlow ? 0.1 : 1;
            const dx = mainPosX.value - mainPropsPose.x;
            const dy = mainPosY.value - mainPropsPose.y;
            const dz = mainPosZ.value - mainPropsPose.z;
            const newX = mainPropsPose.x + dx * factor;
            const newY = mainPropsPose.y + dy * factor;
            const newZ = mainPropsPose.z + dz * factor;
            suppress = true;
            mainPosX.value = newX;
            mainPosY.value = newY;
            mainPosZ.value = newZ;
            suppress = false;
            mainPropsPose.x = newX;
            mainPropsPose.y = newY;
            mainPropsPose.z = newZ;
            const positionPayload = { x: newX, y: newY, z: newZ };
            events.fire('cameraFrames.setMainCameraPosition', positionPayload);
        };
        mainPosX.on('change', applyMainPropsPositionChange);
        mainPosY.on('change', applyMainPropsPositionChange);
        mainPosZ.on('change', applyMainPropsPositionChange);

        mainYawInput.on('change', applyMainPropsRotationChange);
        mainPitchInput.on('change', applyMainPropsRotationChange);
        mainRollInput.on('change', applyMainPropsRotationChange);

        const applyNearClipChange = (value: number) => {
            if (suppress) return;
            events.fire('cameraFrames.setNearClip', value);
        };
        mainPropsNearClipInput.on('change', applyNearClipChange);

        mainPropsFovSlider.on('change', (value: number) => {
            if (suppress) return;
            events.fire('cameraFrames.setEqFovMm', value);
        });

        const hideSliderInputs = (slider: SliderInput) => {
            const inputEl = slider.dom.querySelector('.pcui-numeric-input') as HTMLElement;
            if (inputEl) {
                inputEl.style.display = 'none';
            }
            const sliderEl = slider.dom.querySelector('.pcui-slider') as HTMLElement;
            if (sliderEl) {
                sliderEl.style.width = '100%';
            }
        };
        [mainSliderR, mainSliderU, mainSliderF].forEach(hideSliderInputs);

        const applyMainPropsTransformToInputs = (t: any) => {
            if (!t) return;
            if (mainPropsTransformEditing) return;
            suppress = true;
            mainPosX.value = t.position.x;
            mainPosY.value = t.position.y;
            mainPosZ.value = t.position.z;
            mainYawInput.value = t.rotation.yaw;
            mainPitchInput.value = t.rotation.pitch;
            mainRollInput.value = t.rotation.roll;
            suppress = false;
            mainPropsPose = {
                x: t.position.x,
                y: t.position.y,
                z: t.position.z,
                yaw: t.rotation.yaw,
                pitch: t.rotation.pitch,
                roll: t.rotation.roll
            };
        };

        const updateFromState = (state?: CameraFramesState | null) => {
            if (!state) return;
            suppress = true;
            framesEnabled = !!state.enabled;
            const nearValue = (typeof state.nearClip === 'number' && isFinite(state.nearClip)) ?
                state.nearClip :
                events.invoke('camera.near');
            if (typeof nearValue === 'number' && isFinite(nearValue)) {
                mainPropsNearClipInput.value = nearValue;
            }
            suppress = false;
            updateMainPropsFovUI();
            if (!mainPropsTransformEditing) {
                const mainTransform = (events.invoke('cameraFrames.mainTransform') as any);
                if (mainTransform) {
                    applyMainPropsTransformToInputs(mainTransform);
                }
            }
        };

        let appReady = false;
        let pendingState: CameraFramesState | null = null;

        events.on('cameraFrames.stateChanged', (state: CameraFramesState) => {
            pendingState = state;
            if (!appReady) {
                return;
            }
            updateFromState(state);
        });

        events.on('cameraFrames.fovInfoChanged', (info: FovInfo) => {
            updateMainPropsFovUI(info);
        });

        events.on('app.ready', () => {
            if (appReady) {
                return;
            }
            appReady = true;
            framesEnabled = !!(events.invoke('cameraFrames.enabled') as boolean);
            const initialFovInfo = events.invoke('cameraFrames.fovInfo') as FovInfo;
            if (initialFovInfo) {
                updateMainPropsFovUI(initialFovInfo);
            }
            if (pendingState) {
                updateFromState(pendingState);
            } else {
                updateFromState({
                    enabled: framesEnabled,
                    nearClip: events.invoke('camera.near')
                });
            }
        });

        events.on('mainCameraPropsPanel.setVisible', (visible: boolean) => {
            this.hidden = !visible;
        });

        events.function('mainCameraPropsPanel.visible', () => {
            return !this.hidden;
        });

        this.append(panelHeader);
        this.append(body);
    }
}

export { MainCameraPropsPanel };
