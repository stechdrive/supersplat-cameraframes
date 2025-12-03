import { BooleanInput, Button, Container, Label, NumericInput, Panel, SelectInput, SliderInput, TextInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { formatInteger, localize } from './localization';
import cameraPanelSvg from './svg/camera-panel.svg';
import collapseSvg from './svg/collapse.svg';
import deleteSvg from './svg/delete.svg';
import exportSvg from './svg/export.svg';
import cameraResetSvg from './svg/camera-reset.svg';
import newSvg from './svg/new.svg';
import lockSvg from './svg/select-lock.svg';
import orbitSvg from './svg/select-sphere.svg';
import unlockSvg from './svg/select-unlock.svg';

type CameraFramesState = {
    enabled: boolean;
    renderBox: {
        baseSize: { w: number; h: number; };
        scalePct: { x: number; y: number; };
        scale: { kx: number; ky: number; };
        anchor: { ax: 0 | 0.5 | 1; ay: 0 | 0.5 | 1; };
        fitScale: number;
        viewZoomPct: number;
        screenOrigin?: { ox: number; oy: number; };
        center: { cx: number; cy: number; };
        lastViewport?: { vw: number; vh: number; };
        projection?: {
            type: 'perspective' | 'ortho';
            baseFov?: number;
            orthoHalfHeight?: number;
        };
    };
    frames: Array<{
        id: string;
        pos: { x: number; y: number; };
        scalePct: number;
        scaleK: number;
        baseSize: { w: number; h: number; };
        order: number;
        selected?: boolean;
        rotationDeg?: number;
        anchor?: { x: number; y: number; };
    }>;
    mask: {
        enabled: boolean;
        opacity: number;
    };
    nearClip?: number | null;
    exportName?: string;
    exportFormat?: 'png' | 'psd';
    exportGridOverlay?: boolean;
};

type FovInfo = {
    crop: number;
    hfovDeg: number;
    hfovFrameDeg: number;
    eqMm: number;
    minEqMm: number;
    maxEqMm: number;
};

const anchorKey = (ax: number, ay: number) => `${ax},${ay}`;
const createSvg = (svgString: string) => {
    let markup = svgString;
    const prefix = 'data:image/svg+xml,';
    if (svgString.startsWith(prefix)) {
        markup = decodeURIComponent(svgString.substring(prefix.length));
    }
    return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
};

class CameraFramesPanel extends Panel {
    constructor(events: Events, args: any = {}) {
        args = {
            ...args,
            id: 'camera-frames-panel',
            headerText: localize('panel.camera-frames.header'),
            resizable: 'top',
            collapsed: false,
            collapsible: false,
            hidden: false
        };

        super(args);

        // prevent pointer events from reaching canvas / camera controls
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });
        this.dom.addEventListener('pointerenter', () => {
            events.fire('cameraFrames.overlay.release');
        });

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

        this.header.dom.addEventListener('pointerdown', (event: PointerEvent) => {
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

        let suppress = false;
        let selectedFrameId: string = null;
        let lastFovInfo: FovInfo | null = null;
        let framesEnabled = false;
        let rendering = false;
        let gridOverlayEnabled = false;
        let navMode: 'orbit' | 'fpv' = 'orbit';
        let altSlow = false;
        let lastPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
        let transformEditing = false;
        let transformEditingDepth = 0;
        let compact = false;

        const collapseButton = new Button({
            class: ['panel-header-button', 'camera-frames-collapse'],
            text: ''
        });
        collapseButton.dom.appendChild(createSvg(collapseSvg));
        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
            collapseButton.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });

        const setCompact = (value: boolean) => {
            compact = value;
            collapseButton.dom.innerHTML = '';
            collapseButton.dom.appendChild(createSvg(compact ? cameraPanelSvg : collapseSvg));
            collapseButton.dom.title = compact ? localize('panel.camera-frames.expand') : localize('panel.camera-frames.collapse');
            this.class[compact ? 'add' : 'remove']('compact');
            this.content.hidden = compact;
            this.dom.setAttribute('aria-expanded', (!compact).toString());
        };

        const toggleCompact = () => {
            setCompact(!compact);
        };
        collapseButton.on('click', toggleCompact);

        // enable toggle (header)
        const enableToggle = new BooleanInput({ type: 'toggle', class: ['panel-header-toggle'], value: false });
        enableToggle.dom.classList.add('panel-header-button');
        enableToggle.dom.title = localize('panel.camera-frames.toggle');
        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
            enableToggle.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });
        this.header.append(enableToggle);
        this.header.append(collapseButton);
        setCompact(false);

        // layout group (大判指定)
        const layoutGroup = new Container({ class: ['layout-group'] });
        const layoutHeader = new Container({ class: ['layout-header', 'collapsible-header'] });
        const layoutArrow = new Label({ class: 'collapsible-arrow', text: '▶' });
        const layoutTitle = new Label({ class: 'control-label', text: localize('panel.camera-frames.layout.title') });
        layoutHeader.append(layoutArrow);
        layoutHeader.append(layoutTitle);
        layoutGroup.append(layoutHeader);
        const layoutBody = new Container({});
        layoutBody.dom.style.display = 'none';
        layoutBody.dom.style.flexDirection = 'column';
        layoutBody.dom.style.gap = '8px';


        // anchor grid
        const anchorContainer = new Container({ id: 'camera-frames-anchor', class: 'anchor-wrapper' });
        anchorContainer.append(new Label({ class: 'control-label', text: localize('panel.camera-frames.layout.anchor') }));
        const anchorGrid = new Container({ class: 'anchor-grid' });
        const anchorButtons = new Map<string, Button>();
        [0, 0.5, 1].forEach((ay) => {
            [0, 0.5, 1].forEach((ax) => {
                const btn = new Button({ text: '', class: ['anchor-cell'] });
                const key = anchorKey(ax, ay);
                anchorButtons.set(key, btn);
                btn.on('click', () => {
                    events.fire('cameraFrames.setAnchor', { ax, ay });
                });
                anchorGrid.append(btn);
            });
        });
        anchorContainer.append(anchorGrid);

        // scale controls
        const scaleRow = (label: string) => {
            const row = new Container({ class: 'layout-row' });
            row.append(new Label({ class: 'control-label', text: label }));
            const input = new NumericInput({
                class: 'control-element',
                precision: 1,
                min: 100,
                max: 1000,
                step: 1,
                value: 100
            });
            row.append(input);
            return { row, input };
        };

        const widthScale = scaleRow(localize('panel.camera-frames.layout.width'));
        const heightScale = scaleRow(localize('panel.camera-frames.layout.height'));

        // layout group assembly (2-column feel)
        const sizeContainer = new Container({ class: 'layout-size' });
        sizeContainer.append(widthScale.row);
        sizeContainer.append(heightScale.row);

        const layoutRow = new Container({ class: 'layout-body' });
        layoutRow.append(anchorContainer);
        layoutRow.append(sizeContainer);
        layoutBody.append(layoutRow);

        let layoutCollapsed = true;
        const updateLayoutVisibility = () => {
            layoutBody.dom.style.display = layoutCollapsed ? 'none' : 'flex';
            layoutArrow.text = layoutCollapsed ? '▶' : '▼';
            layoutHeader.class[layoutCollapsed ? 'remove' : 'add']('active');
        };
        updateLayoutVisibility();
        const toggleLayout = () => {
            layoutCollapsed = !layoutCollapsed;
            updateLayoutVisibility();
        };
        layoutHeader.on('click', toggleLayout);

        // output resolution
        const outputRow = new Container({ class: 'control-parent' });
        const outputLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.output.label') });
        const outputValue = new Label({ class: 'control-element-expand', text: '-' });
        outputRow.append(outputLabel);
        outputRow.append(outputValue);

        // FOV (35mm換算)
        const fovRow = new Container({ class: 'control-parent' });
        const fovLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.fov') });
        const fovSlider = new SliderInput({
            class: 'control-element',
            min: 10,
            max: 200,
            precision: 1,
            value: 35
        });
        fovRow.append(fovLabel);
        fovRow.append(fovSlider);

        // canvas zoom
        const canvasZoomRow = new Container({ class: 'control-parent' });
        const canvasZoomLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.canvas-zoom') });
        const canvasZoomInput = new NumericInput({
            class: 'control-element',
            precision: 0,
            min: 25,
            max: 100,
            step: 1,
            value: 100
        });
        canvasZoomRow.append(canvasZoomLabel);
        canvasZoomRow.append(canvasZoomInput);

        layoutBody.append(canvasZoomRow);
        layoutGroup.append(layoutBody);

        // export options
        const filenameRow = new Container({ class: 'control-parent' });
        const filenameLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.export.filename') });
        const filenameInput = new TextInput({
            class: ['control-element-expand', 'text-input'],
            value: 'yc4_00_000_CGLO'
        });
        filenameRow.append(filenameLabel);
        filenameRow.append(filenameInput);

        const formatRow = new Container({ class: 'control-parent' });
        const formatLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.export.format') });
        const formatSelect = new SelectInput({
            class: 'control-element',
            defaultValue: 'psd',
            options: [
                { v: 'psd', t: 'PSD' },
                { v: 'png', t: 'PNG' }
            ]
        });
        const gridToggle = new Button({ class: ['icon-button', 'grid-toggle-button'], text: '' });
        gridToggle.dom.appendChild(createSvg(cameraResetSvg));
        gridToggle.dom.title = localize('panel.camera-frames.export.grid-tooltip');
        gridToggle.dom.setAttribute('aria-pressed', 'false');
        const gridToggleWrapper = new Container({ class: 'format-grid-toggle' });
        gridToggleWrapper.dom.style.display = 'flex';
        gridToggleWrapper.dom.style.alignItems = 'center';
        gridToggleWrapper.dom.style.gap = '6px';
        gridToggleWrapper.append(gridToggle);
        const renderButton = new Button({ class: ['icon-button'], text: '' });
        renderButton.dom.appendChild(createSvg(exportSvg));
        renderButton.dom.title = localize('panel.camera-frames.export.render');
        const formatGroup = new Container({ class: 'format-row' });
        formatGroup.append(formatLabel);
        formatGroup.append(formatSelect);
        formatGroup.append(gridToggleWrapper);
        formatGroup.append(renderButton);
        const renderSpinner = new Container({ class: 'render-spinner', hidden: true });
        formatGroup.append(renderSpinner);

        // frame list
        const frameListLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.frames') });
        const frameActions = new Container({ class: 'frame-actions' });
        const addButton = new Button({ class: ['icon-button'], text: '' });
        addButton.dom.appendChild(createSvg(newSvg));
        addButton.dom.title = localize('panel.camera-frames.frames.add');
        const deleteBtn = new Button({ class: ['icon-button', 'danger-icon'], text: '' });
        deleteBtn.dom.appendChild(createSvg(deleteSvg));
        deleteBtn.dom.title = localize('panel.camera-frames.frames.delete');
        frameActions.append(addButton);
        frameActions.append(deleteBtn);
        const frameListHeader = new Container({ class: 'frame-list-header' });
        frameListHeader.append(frameListLabel);
        frameListHeader.append(frameActions);
        const frameList = new Container({ id: 'camera-frames-list', class: 'list-container' });

        const frameScaleRow = new Container({ class: 'control-parent' });
        frameScaleRow.append(new Label({ class: 'control-label', text: localize('panel.camera-frames.frames.scale') }));
        const frameScaleInput = new NumericInput({
            class: 'control-element',
            precision: 1,
            min: 1,
            max: 500,
            step: 1,
            value: 100
        });
        frameScaleRow.append(frameScaleInput);

        // mask controls
        const maskRow = new Container({ class: ['control-parent', 'mask-row'] });
        const maskLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.mask') });
        const maskToggle = new BooleanInput({ type: 'toggle', class: 'control-element', value: false });
        const maskOpacityLabel = new Label({ class: ['control-label', 'mask-opacity-label'], text: localize('panel.camera-frames.mask.opacity') });
        const maskOpacityInput = new NumericInput({
            class: 'control-element',
            precision: 0,
            min: 0,
            max: 100,
            step: 1,
            value: 80
        });
        maskRow.append(maskLabel);
        maskRow.append(maskToggle);
        maskRow.append(maskOpacityLabel);
        maskRow.append(maskOpacityInput);

        // helpers
        const updateFovUI = (info?: FovInfo) => {
            suppress = true;
            if (info) {
                lastFovInfo = info;
            }
            const current = lastFovInfo;
            const sliderEnabled = framesEnabled && !!current;
            fovSlider.enabled = sliderEnabled;
            if (!sliderEnabled || !current) {
                suppress = false;
                return;
            }

            const minMm = Math.min(current.minEqMm, current.maxEqMm);
            const maxMm = Math.max(current.minEqMm, current.maxEqMm);
            fovSlider.min = minMm;
            fovSlider.max = maxMm;
            const clamped = Math.min(maxMm, Math.max(minMm, current.eqMm));
            fovSlider.value = clamped;
            suppress = false;
        };

        const syncRenderBoxScale = () => {
            if (suppress) return;
            suppress = true;
            events.fire('cameraFrames.setScalePct', {
                x: widthScale.input.value,
                y: heightScale.input.value
            });
            suppress = false;
        };

        widthScale.input.on('change', syncRenderBoxScale);
        heightScale.input.on('change', syncRenderBoxScale);
        fovSlider.on('change', (value: number) => {
            if (suppress) return;
            events.fire('cameraFrames.setEqFovMm', value);
        });
        canvasZoomInput.on('change', (value: number) => {
            if (suppress) return;
            const clamped = Math.max(25, Math.min(100, value));
            if (canvasZoomInput.value !== clamped) {
                canvasZoomInput.value = clamped;
            }
            events.fire('cameraFrames.setViewZoomPct', clamped);
        });

        filenameInput.on('change', (value: string) => {
            if (suppress) return;
            events.fire('cameraFrames.setExportName', value);
        });

        formatSelect.on('change', (value: string) => {
            if (suppress) return;
            const format = value === 'psd' ? 'psd' : 'png';
            events.fire('cameraFrames.setExportFormat', format);
        });
        gridToggle.on('click', () => {
            if (suppress) return;
            events.fire('cameraFrames.setExportGridOverlay', !gridOverlayEnabled);
        });

        const setRenderBusy = (busy: boolean) => {
            rendering = busy;
            renderButton.enabled = !busy;
            renderSpinner.hidden = !busy;
        };

        enableToggle.on('change', (value: boolean) => {
            if (suppress) return;
            events.fire('cameraFrames.setEnabled', value);
            if (value) {
                events.fire('camera.setNavMode', 'fpv');
            }
        });

        addButton.on('click', () => events.fire('cameraFrames.addFrame'));
        renderButton.on('click', async () => {
            if (rendering) return;
            setRenderBusy(true);
            try {
                await events.invoke('cameraFrames.render', {
                    format: formatSelect.value as ('png' | 'psd'),
                    filename: filenameInput.value
                });
            } finally {
                setRenderBusy(false);
            }
        });

        const updateFrameScale = (value: number) => {
            if (suppress || !selectedFrameId) return;
            events.fire('cameraFrames.setFrameScale', { id: selectedFrameId, scalePct: value });
        };

        frameScaleInput.on('change', updateFrameScale);

        deleteBtn.on('click', () => events.fire('cameraFrames.deleteSelected'));

        maskToggle.on('change', (v: boolean) => {
            if (suppress) return;
            events.fire('cameraFrames.setMask', { enabled: v });
        });
        const updateMaskOpacity = (value: number) => {
            if (suppress) return;
            events.fire('cameraFrames.setMask', { opacity: value / 100 });
        };
        maskOpacityInput.on('change', updateMaskOpacity);

        // camera transform controls (compact, single-column rows)
        const posGrid = new Container({ class: 'control-parent' });
        const posX = new NumericInput({ class: 'control-element', precision: 3, step: 0.01, value: 0, style: 'width: 70px' });
        const posY = new NumericInput({ class: 'control-element', precision: 3, step: 0.01, value: 0, style: 'width: 70px' });
        const posZ = new NumericInput({ class: 'control-element', precision: 3, step: 0.01, value: 0, style: 'width: 70px' });
        posGrid.dom.style.display = 'grid';
        posGrid.dom.style.gridTemplateColumns = '28px 1fr 28px 1fr 28px 1fr';
        posGrid.dom.style.columnGap = '4px';
        posGrid.dom.style.alignItems = 'center';
        posGrid.append(new Label({ class: 'control-label', text: 'X' }));
        posGrid.append(posX);
        posGrid.append(new Label({ class: 'control-label', text: 'Y' }));
        posGrid.append(posY);
        posGrid.append(new Label({ class: 'control-label', text: 'Z' }));
        posGrid.append(posZ);

        const rotGrid = new Container({ class: 'control-parent' });
        const yawInput = new NumericInput({ class: 'control-element', precision: 2, step: 1, value: 0, style: 'width: 60px' });
        const pitchInput = new NumericInput({ class: 'control-element', precision: 2, step: 1, value: 0, style: 'width: 60px' });
        const rollInput = new NumericInput({ class: 'control-element', precision: 2, step: 1, value: 0, style: 'width: 60px' });
        const rollLock = new Button({ class: ['control-element', 'roll-lock-btn'], text: '' });
        rollLock.dom.title = localize('panel.camera-frames.transform.roll-lock');
        rotGrid.dom.style.display = 'grid';
        rotGrid.dom.style.gridTemplateColumns = '24px 70px 24px 70px 24px 70px 26px';
        rotGrid.dom.style.columnGap = '2px';
        rotGrid.dom.style.alignItems = 'center';
        rotGrid.append(new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.yaw') }));
        rotGrid.append(yawInput);
        rotGrid.append(new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.pitch') }));
        rotGrid.append(pitchInput);
        rotGrid.append(new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.roll') }));
        rotGrid.append(rollInput);
        rotGrid.append(rollLock);

        const nearClipRow = new Container({ class: 'control-parent' });
        nearClipRow.dom.style.display = 'none';
        nearClipRow.dom.style.gridTemplateColumns = '120px 1fr';
        nearClipRow.dom.style.columnGap = '6px';
        nearClipRow.dom.style.alignItems = 'center';
        const nearClipLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.near-clip') });
        const nearClipInput = new NumericInput({
            class: 'control-element',
            precision: 1,
            step: 1,
            min: 0.000001,
            value: 0.01,
            style: 'width: 120px'
        });
        nearClipRow.append(nearClipLabel);
        nearClipRow.append(nearClipInput);

        const localRow = new Container({ class: 'control-parent' });
        const sliderLabelR = new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.right-left') });
        const sliderR = new SliderInput({ class: 'control-element-expand', min: -1, max: 1, step: 0.01, value: 0 });
        const sliderLabelU = new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.up-down') });
        const sliderU = new SliderInput({ class: 'control-element-expand', min: -1, max: 1, step: 0.01, value: 0 });
        const sliderLabelF = new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.forward-back') });
        const sliderF = new SliderInput({ class: 'control-element-expand', min: -1, max: 1, step: 0.01, value: 0 });
        const localGrid = new Container({ class: 'control-parent' });
        localGrid.dom.style.display = 'grid';
        localGrid.dom.style.gridTemplateColumns = '32px 1fr 32px 1fr 32px 1fr';
        localGrid.dom.style.columnGap = '6px';
        localGrid.dom.style.alignItems = 'center';
        localGrid.append(sliderLabelR);
        localGrid.append(sliderR);
        localGrid.append(sliderLabelU);
        localGrid.append(sliderU);
        localGrid.append(sliderLabelF);
        localGrid.append(sliderF);
        localRow.append(localGrid);

        const camTransformHeader = new Container({ class: ['control-parent', 'collapsible-header'] });
        const camTransformArrow = new Label({ class: 'collapsible-arrow', text: '▶' });
        const camTransformLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.transform.title') });
        const camNavControls = new Container({ class: 'cam-nav-controls' });
        const orbitIcon = new Container({ class: ['cam-nav-icon', 'active'] });
        orbitIcon.dom.appendChild(createSvg(orbitSvg));
        orbitIcon.dom.title = localize('panel.camera-frames.transform.orbit');
        const fpvIcon = new Container({ class: ['cam-nav-icon'] });
        fpvIcon.dom.appendChild(createSvg(cameraPanelSvg));
        fpvIcon.dom.title = localize('panel.camera-frames.transform.fpv');
        camNavControls.append(orbitIcon);
        camNavControls.append(fpvIcon);
        camTransformHeader.append(camTransformArrow);
        camTransformHeader.append(camTransformLabel);
        camTransformHeader.append(camNavControls);

        const camTransformBody = new Container({ class: 'collapsible-body' });
        camTransformBody.append(posGrid);
        camTransformBody.append(rotGrid);
        camTransformBody.append(localRow);
        camTransformBody.append(nearClipRow);
        camTransformBody.dom.style.display = 'none';
        camTransformBody.dom.style.flexDirection = 'column';
        camTransformBody.dom.style.gap = '6px';

        let camTransformCollapsed = true;
        const updateCamTransformVisibility = () => {
            camTransformBody.dom.style.display = camTransformCollapsed ? 'none' : 'flex';
            camTransformArrow.text = camTransformCollapsed ? '▶' : '▼';
            camTransformHeader.class[camTransformCollapsed ? 'remove' : 'add']('active');
        };
        updateCamTransformVisibility();
        const toggleCamTransform = () => {
            camTransformCollapsed = !camTransformCollapsed;
            updateCamTransformVisibility();
        };
        camTransformHeader.on('click', toggleCamTransform);

        const setNavModeUI = (mode: 'orbit' | 'fpv') => {
            if (suppress) return;
            events.fire('camera.setNavMode', mode);
        };
        [orbitIcon, fpvIcon].forEach((icon) => {
            ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
                icon.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
            });
        });
        orbitIcon.on('click', () => setNavModeUI('orbit'));
        fpvIcon.on('click', () => setNavModeUI('fpv'));

        const syncLastPoseFromInputs = () => {
            lastPose = {
                x: posX.value,
                y: posY.value,
                z: posZ.value,
                yaw: yawInput.value,
                pitch: pitchInput.value,
                roll: rollInput.value
            };
        };

        // 編集中はカメラの自動反映を抑止するためフォーカスを追跡
        [posX, posY, posZ, yawInput, pitchInput, rollInput].forEach((input) => {
            input.dom.addEventListener('focusin', () => {
                transformEditingDepth += 1;
                transformEditing = true;
            });
            input.dom.addEventListener('focusout', () => {
                transformEditingDepth = Math.max(0, transformEditingDepth - 1);
                transformEditing = transformEditingDepth > 0;
                if (!transformEditing) {
                    syncLastPoseFromInputs();
                }
            });
        });


        let rollLocked = false;
        const applyRotationChange = () => {
            if (suppress) return;
            const factor = altSlow ? 0.1 : 1;
            const dyaw = yawInput.value - lastPose.yaw;
            const dpitch = pitchInput.value - lastPose.pitch;
            const droll = rollInput.value - lastPose.roll;
            const newYaw = lastPose.yaw + dyaw * factor;
            const newPitch = lastPose.pitch + dpitch * factor;
            const newRoll = lastPose.roll + droll * factor;
            suppress = true;
            yawInput.value = newYaw;
            pitchInput.value = newPitch;
            rollInput.value = newRoll;
            suppress = false;
            lastPose = { ...lastPose, yaw: newYaw, pitch: newPitch, roll: newRoll };
            events.fire('camera.setRotationEuler', {
                yaw: newYaw,
                pitch: newPitch,
                roll: newRoll,
                lockRoll: rollLocked
            });
        };
        const setRollLockUI = (locked: boolean) => {
            rollLocked = locked;
            rollLock.dom.innerHTML = '';
            rollLock.dom.appendChild(createSvg(locked ? lockSvg : unlockSvg));
            rollLock.class[locked ? 'add' : 'remove']('active');
        };
        setRollLockUI(false);
        rollLock.on('click', () => {
            if (suppress) return;
            setRollLockUI(!rollLocked);
            applyRotationChange();
        });

        const applyPose = () => {
            if (suppress) return;
            // absolute set: Altは影響させず現在入力値をそのまま適用
            events.fire('camera.setPositionWorld', {
                x: posX.value,
                y: posY.value,
                z: posZ.value
            });
            events.fire('camera.setRotationEuler', {
                yaw: yawInput.value,
                pitch: pitchInput.value,
                roll: rollInput.value,
                lockRoll: rollLocked
            });
        };
        const applyLocalDelta = (right: number, up: number, forward: number) => {
            if (suppress) return;
            const mul = altSlow ? 0.1 : 1;
            events.fire('camera.nudgeLocal', { right: right * mul, up: up * mul, forward: forward * mul, scale: 1 });
        };

        const resetSlider = (slider: SliderInput) => {
            suppress = true;
            slider.value = 0;
            suppress = false;
        };

        sliderR.on('change', (v: number) => {
            applyLocalDelta(v, 0, 0);
            resetSlider(sliderR);
        });
        sliderU.on('change', (v: number) => {
            applyLocalDelta(0, v, 0);
            resetSlider(sliderU);
        });
        sliderF.on('change', (v: number) => {
            applyLocalDelta(0, 0, v);
            resetSlider(sliderF);
        });

        const updateNearStep = () => {
            const step = altSlow ? 0.1 : 1;
            const precision = altSlow ? 3 : 1;
            nearClipInput.step = step;
            nearClipInput.precision = precision;
        };
        updateNearStep();

        // track Alt for slow mode
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

        // live binding: numeric changes immediately update camera
        const applyPositionChange = () => {
            if (suppress) return;
            const factor = altSlow ? 0.1 : 1;
            const dx = posX.value - lastPose.x;
            const dy = posY.value - lastPose.y;
            const dz = posZ.value - lastPose.z;
            const newX = lastPose.x + dx * factor;
            const newY = lastPose.y + dy * factor;
            const newZ = lastPose.z + dz * factor;
            suppress = true;
            posX.value = newX;
            posY.value = newY;
            posZ.value = newZ;
            suppress = false;
            lastPose.x = newX;
            lastPose.y = newY;
            lastPose.z = newZ;
            events.fire('camera.setPosition', { x: newX, y: newY, z: newZ });
        };
        posX.on('change', applyPositionChange);
        posY.on('change', applyPositionChange);
        posZ.on('change', applyPositionChange);

        yawInput.on('change', applyRotationChange);
        pitchInput.on('change', applyRotationChange);
        rollInput.on('change', applyRotationChange);

        const applyNearClipChange = (value: number) => {
            if (suppress) return;
            events.fire('cameraFrames.setNearClip', value);
        };
        nearClipInput.on('change', applyNearClipChange);

        // hide numeric boxes on sliders (slider-only look)
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
        [sliderR, sliderU, sliderF].forEach(hideSliderInputs);

        // assemble
        this.content.append(layoutGroup);
        this.content.append(outputRow);
        this.content.append(filenameRow);
        this.content.append(formatGroup);
        this.content.append(frameListHeader);
        this.content.append(frameList);
        this.content.append(frameScaleRow);
        this.content.append(maskRow);
        this.content.append(fovRow);
        this.content.append(camTransformHeader);
        this.content.append(camTransformBody);

        // list builder
        const rebuildList = (state: CameraFramesState) => {
            frameList.clear();
            const rbScale = state.renderBox.scale;
            const sortedFrames = state.frames.slice().sort((a, b) => a.order - b.order);
            sortedFrames.forEach((frame) => {
                const scalePct = Math.round(frame.scalePct);
                const text = `${frame.id} (${formatInteger(frame.baseSize.w * frame.scaleK * rbScale.kx)} x ${formatInteger(frame.baseSize.h * frame.scaleK * rbScale.ky)} px @${scalePct}%)`;
                const classes = ['list-item'];
                if (frame.selected) {
                    classes.push('active');
                }

                const item = new Button({
                    text,
                    class: classes
                });
                item.on('click', () => events.fire('cameraFrames.selectFrame', frame.id));
                frameList.append(item);
            });
        };

        // anchor ui update
        const updateAnchorUI = (ax: number, ay: number) => {
            anchorButtons.forEach((btn, key) => {
                const active = key === anchorKey(ax, ay);
                btn.class[active ? 'add' : 'remove']('active');
            });
        };

        const updateNearClipUI = () => {
            nearClipRow.dom.style.display = framesEnabled ? 'grid' : 'none';
            nearClipInput.enabled = framesEnabled;
        };

        // state update hook
        const updateFromState = (state: CameraFramesState) => {
            suppress = true;

            enableToggle.value = state.enabled;
            framesEnabled = state.enabled;
            updateNearClipUI();

            widthScale.input.value = state.renderBox.scalePct.x;
            heightScale.input.value = state.renderBox.scalePct.y;

            filenameInput.value = state.exportName ?? 'camera-frames';
            formatSelect.value = state.exportFormat ?? 'png';
            gridOverlayEnabled = !!state.exportGridOverlay;
            gridToggle.class[gridOverlayEnabled ? 'add' : 'remove']('active');
            gridToggle.dom.setAttribute('aria-pressed', gridOverlayEnabled ? 'true' : 'false');

            const zoomPct = Math.round(state.renderBox.viewZoomPct ?? 100);
            canvasZoomInput.value = zoomPct;


            const outW = state.renderBox.baseSize.w * state.renderBox.scale.kx;
            const outH = state.renderBox.baseSize.h * state.renderBox.scale.ky;
            const fitScale = state.renderBox.fitScale ?? 1;
            const viewScale = fitScale * (state.renderBox.viewZoomPct ?? 100) / 100;
            const vpW = state.renderBox.lastViewport?.vw ?? 0;
            const vpH = state.renderBox.lastViewport?.vh ?? 0;
            const center = state.renderBox.center ?? { cx: vpW * 0.5, cy: vpH * 0.5 };
            const displayW = outW * viewScale;
            const displayH = outH * viewScale;
            const rectLeft = center.cx - displayW * 0.5;
            const rectTop = center.cy - displayH * 0.5;
            const rectRight = rectLeft + displayW;
            const rectBottom = rectTop + displayH;
            const overflowX = vpW > 0 ? (rectLeft < -0.5 || rectRight > vpW + 0.5) : false;
            const overflowY = vpH > 0 ? (rectTop < -0.5 || rectBottom > vpH + 0.5) : false;
            const overflowNote = (overflowX || overflowY) ? localize('panel.camera-frames.output.viewport-overflow') : '';
            outputValue.text = localize('panel.camera-frames.output.value', {
                outW: formatInteger(outW),
                outH: formatInteger(outH),
                a4x: state.renderBox.scale.kx.toFixed(2),
                a4y: state.renderBox.scale.ky.toFixed(2),
                overflow: overflowNote
            });

            updateAnchorUI(state.renderBox.anchor.ax, state.renderBox.anchor.ay);

            rebuildList(state);

            selectedFrameId = state.frames.find(f => f.selected)?.id ?? null;
            if (selectedFrameId) {
                const frame = state.frames.find(f => f.id === selectedFrameId);
                frameScaleInput.value = frame.scalePct;
            }

            maskToggle.value = state.mask.enabled;
            const op = Math.round((state.mask.opacity ?? 0) * 100);
            maskOpacityInput.value = op;

            const nearValue = (typeof state.nearClip === 'number' && isFinite(state.nearClip)) ?
                state.nearClip :
                events.invoke('camera.near');
            if (typeof nearValue === 'number' && isFinite(nearValue)) {
                nearClipInput.value = nearValue;
            }

            suppress = false;

            updateFovUI();
            // update camera pose display (pull live values)
            if (!transformEditing) {
                const camPos = events.invoke('camera.position') as { x: number, y: number, z: number };
                if (camPos) {
                    posX.value = camPos.x;
                    posY.value = camPos.y;
                    posZ.value = camPos.z;
                }
                const camRot = events.invoke('camera.rotation') as { yaw: number, pitch: number, roll: number };
                if (camRot) {
                    yawInput.value = camRot.yaw;
                    pitchInput.value = camRot.pitch;
                    rollInput.value = camRot.roll;
                }
                syncLastPoseFromInputs();
            }
        };

        events.on('cameraFrames.stateChanged', (state: CameraFramesState) => {
            updateFromState(state);
        });

        events.on('cameraFrames.fovInfoChanged', (info: FovInfo) => {
            updateFovUI(info);
        });

        events.on('camera.navMode', (mode: 'orbit' | 'fpv') => {
            navMode = mode;
            orbitIcon.class[mode === 'orbit' ? 'add' : 'remove']('active');
            fpvIcon.class[mode === 'fpv' ? 'add' : 'remove']('active');
        });

        const applyTransformToInputs = (t: any) => {
            if (!t) return;
            if (transformEditing) return;
            suppress = true;
            posX.value = t.position.x;
            posY.value = t.position.y;
            posZ.value = t.position.z;
            yawInput.value = t.rotation.yaw;
            pitchInput.value = t.rotation.pitch;
            rollInput.value = t.rotation.roll;
            suppress = false;
            lastPose = {
                x: t.position.x,
                y: t.position.y,
                z: t.position.z,
                yaw: t.rotation.yaw,
                pitch: t.rotation.pitch,
                roll: t.rotation.roll
            };
        };

        events.on('camera.transform', (t: any) => applyTransformToInputs(t));

        const initialFovInfo = events.invoke('cameraFrames.fovInfo') as FovInfo;
        if (initialFovInfo) {
            updateFovUI(initialFovInfo);
        }

        const initialNav = events.invoke('camera.navMode') as ('orbit' | 'fpv');
        if (initialNav) {
            events.fire('camera.navMode', initialNav);
        }

        const initialTransform = events.invoke('camera.transform') as any;
        if (initialTransform) {
            applyTransformToInputs(initialTransform);
            lastPose = {
                x: initialTransform.position.x,
                y: initialTransform.position.y,
                z: initialTransform.position.z,
                yaw: initialTransform.rotation.yaw,
                pitch: initialTransform.rotation.pitch,
                roll: initialTransform.rotation.roll
            };
        }
    }
}

export { CameraFramesPanel };
