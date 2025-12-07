import { Container, Element, Label, SliderInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { MeshList } from './mesh-list';
import { SplatList } from './splat-list';
import sceneImportSvg from './svg/import.svg';
import sceneNewSvg from './svg/new.svg';
import cameraResetSvg from './svg/camera-reset.svg';
import selectPickerSvg from './svg/select-picker.svg';
import shownSvg from './svg/shown.svg';
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
        sceneHeader.append(sceneImport);
        sceneHeader.append(sceneNew);

        sceneImport.on('click', async () => {
            await events.invoke('scene.import');
        });

        sceneNew.on('click', () => {
            events.invoke('doc.new');
        });

        tooltips.register(sceneImport, 'Import Scene', 'top');
        tooltips.register(sceneNew, 'New Scene', 'top');

        const splatList = new SplatList(events);
        const meshList = new MeshList(events);

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

        const lightIcon = new Label({
            text: '\uE3F0',
            class: 'panel-header-icon'
        });

        const lightLabel = new Label({
            text: 'Model Light',
            class: 'panel-header-label'
        });

        const lightToggle = new Container({
            class: 'panel-header-button'
        });
        lightToggle.dom.appendChild(createSvg(shownSvg));

        const lightSelect = new Container({
            class: 'panel-header-button'
        });
        lightSelect.dom.appendChild(createSvg(selectPickerSvg));

        const lightReset = new Container({
            class: 'panel-header-button'
        });
        lightReset.dom.appendChild(createSvg(cameraResetSvg));

        const lightIntensity = new SliderInput({
            class: 'panel-header-slider',
            min: 0,
            max: 2,
            step: 0.05,
            precision: 2,
            value: 0.8
        });

        lightHeader.append(lightIcon);
        lightHeader.append(lightLabel);
        lightHeader.append(lightToggle);
        lightHeader.append(lightSelect);
        lightHeader.append(lightReset);

        lightToggle.on('click', () => {
            events.fire('modelLight.toggle');
        });

        lightSelect.on('click', () => {
            events.fire('modelLight.selectRig');
        });

        lightReset.on('click', () => {
            events.fire('modelLight.resetDirection');
        });

        lightIntensity.on('change', (value: number) => {
            events.fire('modelLight.setIntensity', value);
        });

        tooltips.register(lightToggle, 'モデルライトのON/OFF', 'top');
        tooltips.register(lightSelect, 'ライトを選択して回転を編集', 'top');
        tooltips.register(lightReset, 'ライト方向をリセット', 'top');

        this.append(sceneHeader);
        this.append(splatListContainer);
        this.append(meshListContainer);
        this.append(lightHeader);
        this.append(lightIntensity);
        this.append(transformHeader);
        this.append(new Transform(events));
        this.append(new Element({
            class: 'panel-header',
            height: 20
        }));
    }
}

export { ScenePanel };
