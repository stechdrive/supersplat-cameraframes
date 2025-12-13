import { BooleanInput, Button, Container, Label, NumericInput, SelectInput, SliderInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { formatInteger, localize } from './localization';
import referenceImageSvg from './svg/reference-image.svg';

const createSvg = (svgString: string) => {
    let markup = svgString;
    const prefix = 'data:image/svg+xml,';
    if (svgString.startsWith(prefix)) {
        markup = decodeURIComponent(svgString.substring(prefix.length));
    }
    return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
};

type ReferenceImageState = {
    enabled: boolean;
    visible: boolean;
    layer: 'back' | 'front';
    opacity: number;
    scalePct: number;
    offsetPx: { x: number; y: number; };
    includeInRender: boolean;
    source?: {
        filename: string;
        appliedSize?: { w: number; h: number; };
        usedOriginal?: boolean;
    } | null;
    pixelPerfectEligible?: boolean;
};

class ReferenceImagePanel extends Container {
    constructor(events: Events, args: any = {}) {
        super({
            ...args,
            id: 'reference-image-panel',
            class: ['panel', 'reference-image-panel'],
            hidden: true
        });

        ['pointerdown', 'pointerup', 'pointermove', 'click', 'wheel', 'dblclick'].forEach((evt) => {
            this.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });

        let suppress = false;

        const panelHeader = new Container({ class: 'panel-header' });
        const panelIcon = new Container({ class: 'panel-header-icon' });
        panelIcon.dom.appendChild(createSvg(referenceImageSvg));
        const panelTitle = new Label({ class: 'panel-header-label', text: localize('panel.reference-image.title') });
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

            applyPosition(rect.left, rect.top); // 右寄せ→left/top基準に切り替え

            this.dom.classList.add('dragging');

            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', stopDrag, true);
            window.addEventListener('pointercancel', stopDrag, true);
        });

        window.addEventListener('resize', () => {
            if (!currentPosition) return;
            applyPosition(currentPosition.left, currentPosition.top);
        });

        const body = new Container({ class: 'reference-image-body' });

        const infoLabel = new Label({ class: ['control-element-expand', 'reference-image-info'], text: localize('panel.reference-image.empty') });

        const loadButton = new Button({ class: ['icon-button', 'reference-image-load-button'], text: '' });
        loadButton.dom.appendChild(createSvg(referenceImageSvg));
        const loadLabel = document.createElement('span');
        loadLabel.textContent = localize('panel.reference-image.load');
        loadButton.dom.appendChild(loadLabel);
        loadButton.dom.setAttribute('aria-label', localize('panel.reference-image.load'));
        const clearButton = new Button({ class: ['icon-button', 'danger-icon'], text: localize('panel.reference-image.clear') });
        const buttonRow = new Container({ class: ['control-parent', 'button-row'] });
        buttonRow.append(loadButton);
        buttonRow.append(clearButton);

        const visibleRow = new Container({ class: 'control-parent' });
        visibleRow.append(new Label({ class: 'control-label', text: localize('panel.reference-image.visible') }));
        const visibleToggle = new BooleanInput({ type: 'toggle', class: 'control-element', value: false });
        visibleRow.append(visibleToggle);

        const includeRow = new Container({ class: 'control-parent' });
        includeRow.append(new Label({ class: 'control-label', text: localize('panel.reference-image.include') }));
        const includeToggle = new BooleanInput({ type: 'toggle', class: 'control-element', value: false });
        includeRow.append(includeToggle);

        const layerRow = new Container({ class: 'control-parent' });
        layerRow.append(new Label({ class: 'control-label', text: localize('panel.reference-image.layer') }));
        const layerSelect = new SelectInput({
            class: 'control-element',
            defaultValue: 'back',
            options: [
                { v: 'back', t: localize('panel.reference-image.layer-back') },
                { v: 'front', t: localize('panel.reference-image.layer-front') }
            ]
        });
        layerRow.append(layerSelect);

        const opacityRow = new Container({ class: 'control-parent' });
        opacityRow.append(new Label({ class: 'control-label', text: localize('panel.reference-image.opacity') }));
        const opacitySlider = new SliderInput({
            class: 'control-element-expand',
            min: 0,
            max: 100,
            precision: 0,
            value: 70
        });
        opacityRow.append(opacitySlider);

        const scaleRow = new Container({ class: 'control-parent' });
        scaleRow.append(new Label({ class: 'control-label', text: localize('panel.reference-image.scale') }));
        const scaleInput = new NumericInput({
            class: 'control-element',
            min: 10,
            max: 400,
            step: 1,
            precision: 0,
            value: 100
        });
        scaleRow.append(scaleInput);

        const offsetRow = new Container({ class: 'control-parent' });
        offsetRow.append(new Label({ class: 'control-label', text: localize('panel.reference-image.offset') }));
        const offsetX = new NumericInput({ class: 'control-element', step: 1, precision: 0, value: 0 });
        const offsetY = new NumericInput({ class: 'control-element', step: 1, precision: 0, value: 0 });
        offsetRow.append(offsetX);
        offsetRow.append(offsetY);

        const pixelPerfectLabel = new Label({ class: 'control-element-expand', text: '' });

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png,image/jpeg,image/webp';
        fileInput.addEventListener('change', async () => {
            if (fileInput.files?.length) {
                await events.invoke('referenceImage.loadBlob', fileInput.files[0], fileInput.files[0].name);
            }
            fileInput.value = '';
        });

        loadButton.on('click', () => fileInput.click());
        clearButton.on('click', () => events.fire('referenceImage.clear'));

        visibleToggle.on('change', (value: boolean) => {
            if (suppress) return;
            events.fire('referenceImage.setVisible', value);
        });
        includeToggle.on('change', (value: boolean) => {
            if (suppress) return;
            events.fire('referenceImage.setIncludeInRender', value);
        });
        layerSelect.on('change', (value: 'back' | 'front') => {
            if (suppress) return;
            events.fire('referenceImage.setLayer', value);
        });
        opacitySlider.on('change', (value: number) => {
            if (suppress) return;
            events.fire('referenceImage.setOpacity', value / 100);
        });
        scaleInput.on('change', (value: number) => {
            if (suppress) return;
            events.fire('referenceImage.setScale', value);
        });
        const applyOffset = () => {
            events.fire('referenceImage.setOffset', { x: offsetX.value, y: offsetY.value });
        };
        offsetX.on('change', () => {
            if (suppress) return;
            applyOffset();
        });
        offsetY.on('change', () => {
            if (suppress) return;
            applyOffset();
        });

        const applyState = (state?: ReferenceImageState | null) => {
            suppress = true;
            const active = !!(state?.source);
            visibleToggle.value = !!state?.visible;
            includeToggle.value = !!state?.includeInRender;
            layerSelect.value = (state?.layer ?? 'back') as any;
            opacitySlider.value = Math.round((state?.opacity ?? 0.7) * 100);
            scaleInput.value = state?.scalePct ?? 100;
            offsetX.value = state?.offsetPx?.x ?? 0;
            offsetY.value = state?.offsetPx?.y ?? 0;
            const infoParts = [];
            if (state?.source?.filename) {
                infoParts.push(state.source.filename);
            }
            if (state?.source?.appliedSize) {
                infoParts.push(`${formatInteger(state.source.appliedSize.w)}×${formatInteger(state.source.appliedSize.h)}${state.source.usedOriginal ? '' : ` (${localize('panel.reference-image.scaled')})`}`);
            }
            infoLabel.text = active ? infoParts.join(' / ') : localize('panel.reference-image.empty');
            pixelPerfectLabel.text = state?.pixelPerfectEligible ? localize('panel.reference-image.pixel-perfect') : localize('panel.reference-image.pixel-off');
            suppress = false;
        };

        const initialState = events.invoke('referenceImage.state') as ReferenceImageState;
        applyState(initialState);
        events.on('referenceImage.stateChanged', (state: ReferenceImageState) => applyState(state));

        const setVisible = (visible: boolean) => {
            const nextHidden = !visible;
            if (this.hidden === nextHidden) {
                return;
            }
            this.hidden = nextHidden;
            events.fire('referenceImagePanel.visible', visible);
        };

        events.function('referenceImagePanel.visible', () => {
            return !this.hidden;
        });

        events.on('referenceImagePanel.setVisible', (visible: boolean) => {
            setVisible(!!visible);
        });

        events.on('referenceImagePanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('cameraFramesPanel.visible', (visible: boolean) => {
            if (!visible) {
                setVisible(false);
            }
        });

        body.append(buttonRow);
        body.append(infoLabel);
        body.append(visibleRow);
        body.append(includeRow);
        body.append(layerRow);
        body.append(opacityRow);
        body.append(scaleRow);
        body.append(offsetRow);
        body.append(pixelPerfectLabel);

        this.append(panelHeader);
        this.append(body);
    }
}

export { ReferenceImagePanel };
