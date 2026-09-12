import { Container, Element as PCUIElement, Label, NumericInput } from '@playcanvas/pcui';

import { Element as SceneElement } from '../element';
import { Events } from '../events';
import { LightRig } from '../light-rig';
import { ColorPanel } from './color-panel';
import { localize } from './localization';
import { MeshList } from './mesh-list';
import { registerNumericInputHistory } from './register-numeric-input-history';
import { SplatList } from './splat-list';
import cameraResetSvg from './svg/camera-reset.svg';
import hiddenSvg from './svg/hidden.svg';
import sceneImportSvg from './svg/import.svg';
import lightSettingSvg from './svg/light-setting.svg';
import sceneNewSvg from './svg/new.svg';
import selectPickerSvg from './svg/select-picker.svg';
import shownSvg from './svg/shown.svg';
import soloSvg from './svg/solo.svg';
import { Tooltips } from './tooltips';
import { Transform } from './transform';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class ScenePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'scene-panel',
            class: 'panel'
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const safeInvoke = <T>(name: string): T | undefined => {
            return events.functions.has(name) ? events.invoke(name) as T : undefined;
        };
        const setControlDisabled = (control: Container, disabled: boolean) => {
            control.class[disabled ? 'add' : 'remove']('disabled');
            control.dom.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        };

        const initialLightState = safeInvoke<{ enabled?: boolean; intensity?: number }>('modelLight.state');
        const initialAmbient = safeInvoke<number>('lighting.ambient');
        let exportBusy = safeInvoke<boolean>('cameraFrames.exportBusy') ?? false;

        const sceneHeader = new Container({
            class: 'panel-header'
        });

        const sceneIcon = new Label({
            text: '\uE344',
            class: 'panel-header-icon'
        });

        const sceneLabel = new Label({
            text: localize('panel.scene-manager'),
            class: 'panel-header-label'
        });

        let soloActive = false;

        const soloToggle = new Container({
            class: 'panel-header-button'
        });
        soloToggle.dom.appendChild(createSvg(soloSvg));

        const updateSoloToggleState = (value: boolean) => {
            soloActive = value;
            soloToggle.class[value ? 'add' : 'remove']('active');
        };

        soloToggle.on('click', () => {
            if (exportBusy) {
                return;
            }
            updateSoloToggleState(!soloActive);
            events.fire('scene.solo', soloActive);
        });

        const sceneImport = new Container({
            class: 'panel-header-button'
        });
        sceneImport.dom.appendChild(createSvg(sceneImportSvg));

        const sceneNew = new Container({
            class: 'panel-header-button'
        });
        sceneNew.dom.appendChild(createSvg(sceneNewSvg));

        sceneHeader.append(sceneIcon);
        sceneHeader.append(sceneLabel);
        sceneHeader.append(soloToggle);
        sceneHeader.append(sceneImport);
        sceneHeader.append(sceneNew);

        sceneImport.on('click', async () => {
            if (exportBusy) {
                return;
            }
            await events.invoke('scene.import');
        });

        sceneNew.on('click', () => {
            if (exportBusy) {
                return;
            }
            events.invoke('doc.new');
        });

        tooltips.register(soloToggle, localize('tooltip.scene.solo'), 'top');
        tooltips.register(sceneImport, 'Import Scene', 'top');
        tooltips.register(sceneNew, 'New Scene', 'top');

        const splatList = new SplatList(events);
        const meshList = new MeshList(events);
        const colorPanel = new ColorPanel(events);

        const splatListContainer = new Container({
            class: 'splat-list-container'
        });
        splatListContainer.append(splatList);

        const meshListContainer = new Container({
            class: 'mesh-list-container'
        });
        meshListContainer.append(meshList);

        const transformHeader = new Container({
            class: 'panel-header'
        });

        const transformIcon = new Label({
            text: '\uE111',
            class: 'panel-header-icon'
        });

        const transformLabel = new Label({
            text: localize('panel.scene-manager.transform'),
            class: 'panel-header-label'
        });

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);

        const lightHeader = new Container({
            class: 'panel-header'
        });

        const lightIcon = new Container({
            class: 'panel-header-icon'
        });
        lightIcon.dom.appendChild(createSvg(lightSettingSvg));

        const lightLabel = new Label({
            text: localize('panel.scene-manager.lighting'),
            class: 'panel-header-label'
        });

        const lightToggle = new Container({
            class: ['panel-header-button', 'light-button']
        });
        const lightToggleOnIcon = createSvg(shownSvg);
        const lightToggleOffIcon = createSvg(hiddenSvg);
        lightToggleOffIcon.style.display = 'none';
        lightToggle.dom.appendChild(lightToggleOnIcon);
        lightToggle.dom.appendChild(lightToggleOffIcon);

        const lightSelect = new Container({
            class: ['panel-header-button', 'light-button']
        });
        lightSelect.dom.appendChild(createSvg(selectPickerSvg));

        const lightReset = new Container({
            class: ['panel-header-button', 'light-reset-button']
        });
        lightReset.dom.appendChild(createSvg(cameraResetSvg));

        const intensityRow = new Container({
            class: 'panel-header'
        });

        const lightLabelInline = new Label({
            text: localize('panel.scene-manager.lighting.light'),
            class: 'panel-header-label-inline'
        });

        const lightInput = new NumericInput({
            min: 0,
            max: 2,
            step: 0.05,
            precision: 2,
            value: initialLightState?.intensity ?? 0.8,
            class: 'panel-header-slider'
        });

        const ambientLabel = new Label({
            text: localize('panel.scene-manager.lighting.ambient'),
            class: 'panel-header-label-inline'
        });

        const ambientInput = new NumericInput({
            min: 0,
            max: 2,
            step: 0.05,
            precision: 2,
            value: initialAmbient ?? 0.3,
            class: 'panel-header-slider'
        });

        const updateBusyState = () => {
            setControlDisabled(soloToggle, exportBusy);
            setControlDisabled(sceneImport, exportBusy);
            setControlDisabled(sceneNew, exportBusy);
            setControlDisabled(lightToggle, exportBusy);
            setControlDisabled(lightSelect, exportBusy);
            setControlDisabled(lightReset, exportBusy);
            lightInput.enabled = !exportBusy;
            ambientInput.enabled = !exportBusy;
        };

        let lightEnabled = initialLightState?.enabled ?? true;
        let lightSelected = false;
        let syncingIntensity = false;
        let syncingAmbient = false;

        const updateLightToggleState = (enabled: boolean) => {
            lightEnabled = enabled;
            lightToggle.class[enabled ? 'add' : 'remove']('active');
            lightToggleOnIcon.style.display = enabled ? 'block' : 'none';
            lightToggleOffIcon.style.display = enabled ? 'none' : 'block';
        };

        const updateLightSelectionState = (selected: boolean) => {
            lightSelected = selected;
            lightSelect.class[selected ? 'add' : 'remove']('active');
        };

        const updateIntensityFromState = (intensity?: number) => {
            if (typeof intensity !== 'number' || !isFinite(intensity)) {
                return;
            }
            if (syncingIntensity) {
                return;
            }
            syncingIntensity = true;
            lightInput.value = intensity;
            syncingIntensity = false;
        };

        const updateAmbientFromState = (value?: number) => {
            if (typeof value !== 'number' || !isFinite(value)) {
                return;
            }
            if (syncingAmbient) {
                return;
            }
            syncingAmbient = true;
            ambientInput.value = value;
            syncingAmbient = false;
        };

        updateSoloToggleState(false);
        updateLightToggleState(lightEnabled);
        updateLightSelectionState(safeInvoke<SceneElement>('selection') instanceof LightRig);
        updateIntensityFromState(initialLightState?.intensity);

        intensityRow.append(lightLabelInline);
        intensityRow.append(lightInput);
        intensityRow.append(ambientLabel);
        intensityRow.append(ambientInput);

        lightHeader.append(lightIcon);
        lightHeader.append(lightLabel);
        lightHeader.append(lightToggle);
        lightHeader.append(lightSelect);
        lightHeader.append(lightReset);

        lightToggle.on('click', () => {
            if (exportBusy) {
                return;
            }
            updateLightToggleState(!lightEnabled);
            events.fire('modelLight.toggle');
        });

        lightSelect.on('click', () => {
            if (exportBusy) {
                return;
            }
            if (lightSelected) {
                events.fire('selection', null);
            } else {
                events.fire('modelLight.selectRig');
            }
        });

        lightReset.on('click', () => {
            if (exportBusy) {
                return;
            }
            events.fire('modelLight.resetDirection');
        });

        events.on('selection.changed', (selection: SceneElement) => {
            updateLightSelectionState(selection instanceof LightRig);
        });

        events.on('scene.solo', (value: boolean) => {
            updateSoloToggleState(value);
        });

        events.on('modelLight.state', (state: { enabled?: boolean; intensity?: number; }) => {
            if (state && typeof state.enabled === 'boolean') {
                updateLightToggleState(state.enabled);
            }
            if (state && typeof state.intensity === 'number') {
                updateIntensityFromState(state.intensity);
            }
        });
        events.on('lighting.ambientChanged', (value: number) => {
            updateAmbientFromState(value);
        });
        events.on('cameraFrames.exportBusyChanged', (value: boolean) => {
            exportBusy = !!value;
            updateBusyState();
        });

        tooltips.register(lightToggle, localize('panel.scene-manager.lighting.toggle'), 'top');
        tooltips.register(lightSelect, localize('panel.scene-manager.lighting.select'), 'top');
        tooltips.register(lightReset, localize('panel.scene-manager.lighting.reset'), 'top');
        tooltips.register(lightInput, localize('panel.scene-manager.lighting.intensity'), 'top');
        tooltips.register(ambientInput, localize('panel.scene-manager.lighting.ambient-intensity'), 'top');

        this.append(sceneHeader);
        this.append(splatListContainer);
        this.append(meshListContainer);
        this.append(lightHeader);
        this.append(intensityRow);
        this.append(transformHeader);
        this.append(new Transform(events));
        this.append(colorPanel);
        this.append(new PCUIElement({
            class: 'panel-header',
            height: 20
        }));

        lightInput.on('change', (value: number) => {
            if (syncingIntensity || exportBusy) {
                return;
            }
            events.fire('modelLight.setIntensity', value);
        });

        registerNumericInputHistory({
            events,
            input: lightInput,
            label: 'modelLight.intensity',
            canBegin: () => !syncingIntensity,
            historyBeginEvent: null,
            historyCommitEvent: null,
            beginOnFocus: false,
            flushCameraHistory: false,
            onCommit: () => {
                if (events.functions.has('modelLight.commitPending')) {
                    events.invoke('modelLight.commitPending');
                }
            }
        });

        ambientInput.on('change', (value: number) => {
            if (syncingAmbient || exportBusy) {
                return;
            }
            events.fire('lighting.setAmbient', value);
        });

        registerNumericInputHistory({
            events,
            input: ambientInput,
            label: 'lighting.ambient',
            canBegin: () => !syncingAmbient,
            historyBeginEvent: null,
            historyCommitEvent: null,
            beginOnFocus: false,
            flushCameraHistory: false,
            onCommit: () => {
                if (events.functions.has('lighting.commitPending')) {
                    events.invoke('lighting.commitPending');
                }
            }
        });

        updateBusyState();
    }
}

export { ScenePanel };
