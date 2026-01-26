import { Button, Container, Element } from '@playcanvas/pcui';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import { localize } from './localization';
import cameraFrameSelectionSvg from './svg/camera-frame-selection.svg';
import cameraPanelSvg from './svg/camera-panel.svg';
import cameraResetSvg from './svg/camera-reset.svg';
import centersSvg from './svg/centers.svg';
import colorPanelSvg from './svg/color-panel.svg';
import ringsSvg from './svg/rings.svg';
import showHideSplatsSvg from './svg/show-hide-splats.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class RightToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'right-toolbar'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const ringsModeToggle = new Button({
            id: 'right-toolbar-mode-toggle',
            class: 'right-toolbar-toggle'
        });

        const showHideSplats = new Button({
            id: 'right-toolbar-show-hide',
            class: ['right-toolbar-toggle']
        });

        const cameraFrameSelection = new Button({
            id: 'right-toolbar-frame-selection',
            class: 'right-toolbar-button'
        });

        const cameraFrameMenu = new Button({
            id: 'right-toolbar-camera-frame',
            class: 'right-toolbar-toggle'
        });

        const cameraReset = new Button({
            id: 'right-toolbar-camera-origin',
            class: 'right-toolbar-button'
        });

        const colorPanel = new Button({
            id: 'right-toolbar-color-panel',
            class: 'right-toolbar-toggle'
        });

        const options = new Button({
            id: 'right-toolbar-options',
            class: 'right-toolbar-toggle',
            icon: 'E283'
        });

        const centersDom = createSvg(centersSvg);
        const ringsDom = createSvg(ringsSvg);
        ringsDom.style.display = 'none';

        ringsModeToggle.dom.appendChild(centersDom);
        ringsModeToggle.dom.appendChild(ringsDom);
        showHideSplats.dom.appendChild(createSvg(showHideSplatsSvg));
        cameraFrameSelection.dom.appendChild(createSvg(cameraFrameSelectionSvg));
        cameraFrameMenu.dom.appendChild(createSvg(cameraPanelSvg));
        cameraReset.dom.appendChild(createSvg(cameraResetSvg));
        colorPanel.dom.appendChild(createSvg(colorPanelSvg));

        this.append(ringsModeToggle);
        this.append(showHideSplats);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(cameraFrameSelection);
        this.append(cameraReset);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(colorPanel);
        this.append(options);
        this.append(new Element({ class: 'right-toolbar-separator' }));
        this.append(cameraFrameMenu);

        // Helper to compose localized tooltip text with shortcut
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const tooltip = (localeKey: string, shortcutId?: string) => {
            const text = localize(localeKey);
            if (shortcutId) {
                const shortcut = shortcutManager.formatShortcut(shortcutId);
                if (shortcut) {
                    return `${text} ( ${shortcut} )`;
                }
            }
            return text;
        };

        tooltips.register(ringsModeToggle, tooltip('tooltip.right-toolbar.splat-mode', 'camera.toggleMode'), 'left');
        tooltips.register(showHideSplats, tooltip('tooltip.right-toolbar.show-hide', 'camera.toggleOverlay'), 'left');
        tooltips.register(cameraFrameSelection, tooltip('tooltip.right-toolbar.frame-selection', 'camera.focus'), 'left');
        tooltips.register(cameraFrameMenu, tooltip('tooltip.right-toolbar.camera-frame'), 'left');
        tooltips.register(cameraReset, tooltip('tooltip.right-toolbar.reset-camera', 'camera.reset'), 'left');
        tooltips.register(colorPanel, tooltip('tooltip.right-toolbar.colors'), 'left');
        tooltips.register(options, tooltip('tooltip.right-toolbar.view-options'), 'left');

        // add event handlers

        ringsModeToggle.on('click', () => {
            events.fire('camera.toggleMode');
            events.fire('camera.setOverlay', true);
        });
        showHideSplats.on('click', () => events.fire('camera.toggleOverlay'));
        cameraFrameSelection.on('click', () => events.fire('camera.focus'));
        cameraFrameMenu.on('click', () => events.fire('cameraFramesPanel.toggle'));
        cameraReset.on('click', () => events.fire('camera.reset'));
        colorPanel.on('click', () => events.fire('colorPanel.toggleVisible'));
        options.on('click', () => events.fire('viewPanel.toggleVisible'));

        events.on('camera.mode', (mode: string) => {
            ringsModeToggle.class[mode === 'rings' ? 'add' : 'remove']('active');
            centersDom.style.display = mode === 'rings' ? 'none' : 'block';
            ringsDom.style.display = mode === 'rings' ? 'block' : 'none';
        });

        events.on('camera.overlay', (value: boolean) => {
            showHideSplats.class[value ? 'add' : 'remove']('active');
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            colorPanel.class[visible ? 'add' : 'remove']('active');
        });

        events.on('cameraFramesPanel.visible', (visible: boolean) => {
            cameraFrameMenu.class[visible ? 'add' : 'remove']('active');
        });

        events.on('viewPanel.visible', (visible: boolean) => {
            options.class[visible ? 'add' : 'remove']('active');
        });

    }
}

export { RightToolbar };
