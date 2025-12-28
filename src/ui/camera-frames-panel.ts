import { BooleanInput, Button, Container, Label, NumericInput, Panel, SelectInput, SliderInput, TextInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { formatInteger, localize } from './localization';
import mainCamSvg from './svg/camera-panel.svg';
import cameraResetSvg from './svg/camera-reset.svg';
import collapseSvg from './svg/collapse.svg';
import deleteSvg from './svg/delete.svg';
import exportSvg from './svg/export.svg';
import cameraPanelSvg from './svg/fpv-nav.svg';
import glbOutputSvg from './svg/glb-output.svg';
import helpSvg from './svg/help.svg';
import hiddenSvg from './svg/hidden.svg';
import importSvg from './svg/import.svg';
import newSvg from './svg/new.svg';
import orbitSvg from './svg/orbit-nav.svg';
import referenceImageSvg from './svg/reference-image.svg';
import lockSvg from './svg/select-lock.svg';
import unlockSvg from './svg/select-unlock.svg';
import shownSvg from './svg/shown.svg';
import viewportSvg from './svg/viewport.svg';

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
        scope: 'all' | 'selected';
    };
    mainCameraPose?: {
        focalPoint: { x: number; y: number; z: number; };
        azim: number;
        elev: number;
        distance: number;
        roll: number;
        navMode: 'orbit' | 'fpv';
        fpvPosition?: { x: number; y: number; z: number; };
        ortho?: boolean;
        lockFraming?: boolean;
    } | null;
    nearClip?: number | null;
    exportName?: string;
    exportFormat?: 'png' | 'psd';
    exportGridOverlay?: boolean;
    exportModelLayers?: boolean;
};

type FovInfo = {
    crop: number;
    hfovDeg: number;
    hfovFrameDeg: number;
    eqMm: number;
    minEqMm: number;
    maxEqMm: number;
};

type ReferenceImagesState = {
    masterVisible?: boolean;
    items?: Array<{ includeInRender?: boolean }>;
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
        let appReady = false;
        let pendingState: CameraFramesState | null = null;
        let selectedFrameId: string = null;
        let lastFovInfo: FovInfo | null = null;
        let lastState: CameraFramesState | null = null;
        let framesEnabled = false;
        let rendering = false;
        let maskScope: 'all' | 'selected' = 'all';
        let gridOverlayEnabled = false;
        let modelLayerEnabled = false;
        let navMode: 'orbit' | 'fpv' = 'orbit';
        let viewportLensEnabled = false;
        let uiTarget: 'viewport' | 'main' = 'viewport';
        let canSelectMain = false;
        let altSlow = false;
        let lastPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
        let transformEditing = false;
        let transformEditingDepth = 0;
        let compact = false;
        const framesActive = () => framesEnabled || uiTarget === 'main';

        let maskDetailsCollapsed = true;
        let exportDetailsCollapsed = true;
        let framesSectionCollapsed = true;
        let referenceIncludeEnabled = false;

        let referenceImageLoaded = false;
        let referenceImageVisible = false;

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
            collapseButton.dom.appendChild(createSvg(compact ? mainCamSvg : collapseSvg));
            collapseButton.dom.title = compact ? localize('panel.camera-frames.expand') : localize('panel.camera-frames.collapse');
            this.class[compact ? 'add' : 'remove']('compact');
            this.content.hidden = compact;
            this.dom.setAttribute('aria-expanded', (!compact).toString());
        };

        const toggleCompact = () => {
            setCompact(!compact);
        };
        collapseButton.on('click', toggleCompact);

        // header toggle (Mode Switch)
        const headerToggle = new Container({ class: ['header-toggle-group'] });
        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
            headerToggle.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });

        const mainCamBtn = new Container({ class: 'toggle-icon-btn' });
        mainCamBtn.dom.appendChild(createSvg(mainCamSvg));
        mainCamBtn.dom.title = localize('panel.camera-frames.mode.main');

        const viewportBtn = new Container({ class: 'toggle-icon-btn' });
        viewportBtn.dom.appendChild(createSvg(viewportSvg));
        viewportBtn.dom.title = localize('panel.camera-frames.mode.viewport');

        headerToggle.append(mainCamBtn);
        headerToggle.append(viewportBtn);

        mainCamBtn.dom.addEventListener('click', () => {
            if (!framesEnabled) {
                events.fire('cameraFrames.setEnabled', true);
                events.fire('camera.setNavMode', 'fpv');
            }
        });

        viewportBtn.dom.addEventListener('click', () => {
            if (framesEnabled) {
                events.fire('cameraFrames.setEnabled', false);
            }
        });

        const referenceImageHeaderButton = new Button({
            class: ['panel-header-button', 'camera-frames-reference-image'],
            text: ''
        });
        referenceImageHeaderButton.dom.appendChild(createSvg(referenceImageSvg));
        referenceImageHeaderButton.dom.title = localize('panel.reference-image.toggle');
        referenceImageHeaderButton.dom.setAttribute('aria-label', localize('panel.reference-image.toggle'));
        referenceImageHeaderButton.dom.setAttribute('aria-pressed', 'false');
        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
            referenceImageHeaderButton.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });
        referenceImageHeaderButton.on('click', () => {
            events.fire('referenceImagePanel.toggleVisible');
        });

        const setReferenceButtonState = (visible: boolean) => {
            referenceImageHeaderButton.class[visible ? 'add' : 'remove']('active');
            referenceImageHeaderButton.dom.setAttribute('aria-pressed', visible ? 'true' : 'false');
        };
        setReferenceButtonState(false);
        events.on('referenceImagePanel.visible', (visible: boolean) => setReferenceButtonState(!!visible));

        const referenceVisibilityButton = new Button({
            class: ['panel-header-button', 'camera-frames-reference-visibility'],
            text: ''
        });
        referenceVisibilityButton.dom.appendChild(createSvg(hiddenSvg));
        referenceVisibilityButton.dom.setAttribute('aria-pressed', 'false');
        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
            referenceVisibilityButton.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });

        const updateReferenceVisibilityButton = () => {
            referenceVisibilityButton.dom.innerHTML = '';
            referenceVisibilityButton.dom.appendChild(createSvg(referenceImageLoaded && referenceImageVisible ? shownSvg : hiddenSvg));
            referenceVisibilityButton.enabled = referenceImageLoaded;
            referenceVisibilityButton.class[referenceImageLoaded && referenceImageVisible ? 'add' : 'remove']('active');
            referenceVisibilityButton.dom.setAttribute('aria-pressed', (referenceImageLoaded && referenceImageVisible).toString());
            const label = !referenceImageLoaded ?
                localize('panel.reference-image.empty') :
                (referenceImageVisible ? localize('panel.reference-image.hide') : localize('panel.reference-image.show'));
            referenceVisibilityButton.dom.title = label;
            referenceVisibilityButton.dom.setAttribute('aria-label', label);
        };

        const applyReferenceImageState = (state?: Partial<ReferenceImagesState> | null) => {
            referenceImageLoaded = Array.isArray(state?.items) && state.items.length > 0;
            referenceImageVisible = referenceImageLoaded && !!state?.masterVisible;
            updateReferenceVisibilityButton();
        };
        events.on('referenceImages.stateChanged', (state: ReferenceImagesState) => applyReferenceImageState(state));

        referenceVisibilityButton.on('click', () => {
            if (!referenceImageLoaded) {
                return;
            }
            events.fire('referenceImages.toggleMasterVisible');
        });

        const helpHeaderButton = new Button({
            class: ['panel-header-button', 'camera-frames-help'],
            text: ''
        });
        helpHeaderButton.dom.appendChild(createSvg(helpSvg));
        helpHeaderButton.dom.title = localize('panel.camera-frames.help.toggle');
        helpHeaderButton.dom.setAttribute('aria-label', localize('panel.camera-frames.help.toggle'));
        helpHeaderButton.dom.setAttribute('aria-pressed', 'false');
        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
            helpHeaderButton.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });
        helpHeaderButton.on('click', () => {
            events.fire('cameraFramesHelpPanel.toggleVisible');
        });

        const setHelpButtonState = (visible: boolean) => {
            helpHeaderButton.class[visible ? 'add' : 'remove']('active');
            helpHeaderButton.dom.setAttribute('aria-pressed', visible ? 'true' : 'false');
        };
        setHelpButtonState(false);
        events.on('cameraFramesHelpPanel.visible', (visible: boolean) => setHelpButtonState(!!visible));

        this.header.append(headerToggle);
        this.header.append(referenceImageHeaderButton);
        this.header.append(referenceVisibilityButton);
        this.header.append(helpHeaderButton);
        this.header.append(collapseButton);
        setCompact(false);

        const viewportTargetButton = new Button({ class: ['radio-button'], text: '' });
        const mainTargetButton = new Button({ class: ['radio-button'], text: '' });
        viewportTargetButton.dom.setAttribute('aria-label', localize('panel.camera-frames.target.viewport'));
        mainTargetButton.dom.setAttribute('aria-label', localize('panel.camera-frames.target.main'));
        viewportTargetButton.dom.title = localize('panel.camera-frames.target.select');
        mainTargetButton.dom.title = localize('panel.camera-frames.target.select');

        // layout group (大判指定)
        const layoutGroup = new Container({ class: ['layout-group'] });
        const layoutHeader = new Container({ class: ['layout-header', 'collapsible-header'] });
        const layoutArrow = new Label({ class: 'collapsible-arrow', text: '▶' });
        const layoutTitle = new Label({ class: 'control-label', text: localize('panel.camera-frames.layout.title') });
        const layoutSummary = new Label({ class: 'layout-summary', text: '-' });
        layoutHeader.append(layoutArrow);
        layoutHeader.append(layoutTitle);
        layoutHeader.append(layoutSummary);
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
        fovSlider.dom.style.flex = '1 1 0';
        const fovControl = new Container({ class: ['control-element-expand', 'lens-control'] });
        fovControl.dom.style.display = 'flex';
        fovControl.dom.style.alignItems = 'center';
        fovControl.dom.style.gap = '6px';
        fovControl.append(fovSlider);
        fovControl.append(mainTargetButton);
        fovRow.append(fovLabel);
        fovRow.append(fovControl);
        const viewportLensRow = new Container({ class: 'control-parent' });
        const viewportLensLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.viewport-lens') });
        const viewportLensSlider = new SliderInput({
            class: 'control-element',
            min: 10,
            max: 200,
            precision: 1,
            value: 35
        });
        viewportLensSlider.dom.style.flex = '1 1 0';
        const viewportLensControl = new Container({ class: ['control-element-expand', 'lens-control'] });
        viewportLensControl.dom.style.display = 'flex';
        viewportLensControl.dom.style.alignItems = 'center';
        viewportLensControl.dom.style.gap = '6px';
        viewportLensControl.append(viewportLensSlider);
        viewportLensControl.append(viewportTargetButton);
        viewportLensRow.append(viewportLensLabel);
        viewportLensRow.append(viewportLensControl);

        // canvas zoom
        const canvasZoomLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.canvas-zoom') });
        const canvasZoomInput = new NumericInput({
            class: 'control-element',
            precision: 0,
            min: 25,
            max: 100,
            step: 1,
            value: 100
        });

        layoutGroup.append(layoutBody);

        // export options
        const filenameRow = new Container({ class: 'control-parent' });
        const filenameLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.export.filename') });
        const filenameInput = new TextInput({
            class: ['control-element-expand', 'text-input'],
            value: 'cf-output'
        });
        filenameRow.append(filenameLabel);
        filenameRow.append(filenameInput);

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
        const modelLayerToggle = new Button({ class: ['icon-button', 'model-layer-toggle-button'], text: '' });
        modelLayerToggle.dom.appendChild(createSvg(glbOutputSvg));
        modelLayerToggle.dom.title = localize('panel.camera-frames.export.model-layer-tooltip');
        modelLayerToggle.dom.setAttribute('aria-pressed', 'false');
        const referenceIncludeToggle = new Button({ class: ['icon-button', 'reference-include-toggle-button'], text: '' });
        referenceIncludeToggle.dom.appendChild(createSvg(referenceImageSvg));
        referenceIncludeToggle.dom.title = localize('panel.camera-frames.export.reference-image-tooltip');
        referenceIncludeToggle.dom.setAttribute('aria-label', localize('panel.camera-frames.export.reference-image-tooltip'));
        referenceIncludeToggle.dom.setAttribute('aria-pressed', 'false');
        const toggleGroup = new Container({ class: 'format-toggle-group' });
        toggleGroup.dom.style.display = 'flex';
        toggleGroup.dom.style.alignItems = 'center';
        toggleGroup.dom.style.gap = '6px';
        toggleGroup.append(gridToggle);
        toggleGroup.append(modelLayerToggle);
        toggleGroup.append(referenceIncludeToggle);
        const renderButton = new Button({ class: ['icon-button', 'export-render-button'], text: '' });
        renderButton.dom.appendChild(createSvg(exportSvg));
        renderButton.dom.title = localize('panel.camera-frames.export.render');
        const renderSpinner = new Container({ class: 'render-spinner', hidden: true });
        const exportDetailsToggle = new Button({ class: ['icon-button', 'details-toggle-button'], text: '▶' });
        exportDetailsToggle.dom.title = localize('panel.camera-frames.export.details');
        exportDetailsToggle.dom.setAttribute('aria-label', localize('panel.camera-frames.export.details'));
        exportDetailsToggle.dom.setAttribute('aria-expanded', 'false');

        const exportControls = new Container({ class: ['export-controls', 'control-element-expand'] });
        exportControls.dom.style.display = 'flex';
        exportControls.dom.style.alignItems = 'center';
        exportControls.dom.style.gap = '6px';
        exportControls.append(formatSelect);
        exportControls.append(toggleGroup);
        exportControls.append(renderButton);
        exportControls.append(renderSpinner);
        exportControls.append(exportDetailsToggle);
        exportDetailsToggle.dom.style.marginLeft = 'auto';

        const exportRow = new Container({ class: ['control-parent', 'export-row'] });
        exportRow.append(formatLabel);
        exportRow.append(exportControls);

        const exportDetails = new Container({ class: ['inline-details', 'export-details'] });
        exportDetails.dom.style.display = 'none';
        exportDetails.dom.style.flexDirection = 'column';
        exportDetails.dom.style.gap = '6px';
        exportDetails.append(filenameRow);
        exportDetails.append(new Container({ class: 'export-details-extra' }));

        const mainCameraFileLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.main-camera-file') });
        const mainCameraExportBtn = new Button({ class: ['icon-button', 'main-camera-export-button'], text: '' });
        mainCameraExportBtn.dom.appendChild(createSvg(exportSvg));
        mainCameraExportBtn.dom.title = localize('panel.camera-frames.main-camera-file.export');
        mainCameraExportBtn.dom.setAttribute('aria-label', localize('panel.camera-frames.main-camera-file.export'));
        const mainCameraImportBtn = new Button({ class: ['icon-button', 'main-camera-import-button'], text: '' });
        mainCameraImportBtn.dom.appendChild(createSvg(importSvg));
        mainCameraImportBtn.dom.title = localize('panel.camera-frames.main-camera-file.import');
        mainCameraImportBtn.dom.setAttribute('aria-label', localize('panel.camera-frames.main-camera-file.import'));

        mainCameraExportBtn.on('click', () => {
            if (suppress) return;
            events.invoke('cameraSave.exportMainCamera');
        });
        mainCameraImportBtn.on('click', () => {
            if (suppress) return;
            events.invoke('cameraSave.importMainCamera');
        });

        const mainCameraFileControls = new Container({ class: 'main-camera-file-controls' });
        mainCameraFileControls.dom.style.display = 'flex';
        mainCameraFileControls.dom.style.alignItems = 'center';
        mainCameraFileControls.dom.style.gap = '6px';
        mainCameraFileControls.append(mainCameraExportBtn);
        mainCameraFileControls.append(mainCameraImportBtn);

        const mainCameraFileRow = new Container({ class: ['control-parent', 'main-camera-file-row'] });
        mainCameraFileRow.append(mainCameraFileLabel);
        mainCameraFileRow.append(mainCameraFileControls);

        const updateExportDetailsVisibility = () => {
            exportDetails.dom.style.display = exportDetailsCollapsed ? 'none' : 'flex';
            exportDetailsToggle.text = exportDetailsCollapsed ? '▶' : '▼';
            exportDetailsToggle.dom.setAttribute('aria-expanded', (!exportDetailsCollapsed).toString());
        };
        updateExportDetailsVisibility();
        exportDetailsToggle.on('click', () => {
            exportDetailsCollapsed = !exportDetailsCollapsed;
            updateExportDetailsVisibility();
        });

        const updateReferenceIncludeToggle = () => {
            referenceIncludeToggle.class[referenceIncludeEnabled ? 'add' : 'remove']('active');
            referenceIncludeToggle.dom.setAttribute('aria-pressed', referenceIncludeEnabled ? 'true' : 'false');
            referenceIncludeToggle.enabled = referenceImageLoaded;
            const label = referenceImageLoaded ?
                localize('panel.camera-frames.export.reference-image-tooltip') :
                localize('panel.reference-image.empty');
            referenceIncludeToggle.dom.title = label;
            referenceIncludeToggle.dom.setAttribute('aria-label', label);
        };
        updateReferenceIncludeToggle();

        const applyReferenceIncludeState = (state?: Partial<ReferenceImagesState> | null) => {
            referenceIncludeEnabled = Array.isArray(state?.items) && state.items.some(i => !!i?.includeInRender);
            updateReferenceIncludeToggle();
        };
        events.on('referenceImages.stateChanged', (state: ReferenceImagesState) => applyReferenceIncludeState(state));

        referenceIncludeToggle.on('click', () => {
            if (suppress) return;
            events.fire('referenceImagePanel.setVisible', true);
        });

        // frames section
        const frameActions = new Container({ class: 'frame-actions' });
        const addButton = new Button({ class: ['icon-button'], text: '' });
        addButton.dom.appendChild(createSvg(newSvg));
        addButton.dom.title = localize('panel.camera-frames.frames.add');
        const deleteBtn = new Button({ class: ['icon-button', 'danger-icon'], text: '' });
        deleteBtn.dom.appendChild(createSvg(deleteSvg));
        deleteBtn.dom.title = localize('panel.camera-frames.frames.delete');
        frameActions.append(addButton);
        frameActions.append(deleteBtn);
        [addButton, deleteBtn].forEach((button) => {
            ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
                button.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
            });
        });

        const framesSectionHeader = new Container({ class: ['control-parent', 'collapsible-header', 'frames-section-header'] });
        const framesSectionArrow = new Label({ class: 'collapsible-arrow', text: '▶' });
        const framesSectionLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.frames.section') });
        framesSectionHeader.append(framesSectionArrow);
        framesSectionHeader.append(framesSectionLabel);
        framesSectionHeader.append(frameActions);

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

        const framesSectionBody = new Container({ class: ['collapsible-body', 'frames-section-body'] });
        framesSectionBody.append(frameList);
        framesSectionBody.append(frameScaleRow);
        framesSectionBody.dom.style.display = 'none';
        framesSectionBody.dom.style.flexDirection = 'column';
        framesSectionBody.dom.style.gap = '6px';

        const updateFramesSectionVisibility = () => {
            framesSectionBody.dom.style.display = framesSectionCollapsed ? 'none' : 'flex';
            framesSectionArrow.text = framesSectionCollapsed ? '▶' : '▼';
            framesSectionHeader.class[framesSectionCollapsed ? 'remove' : 'add']('active');
            framesSectionHeader.dom.setAttribute('aria-expanded', (!framesSectionCollapsed).toString());
        };
        updateFramesSectionVisibility();
        framesSectionHeader.on('click', () => {
            framesSectionCollapsed = !framesSectionCollapsed;
            updateFramesSectionVisibility();
        });

        // mask controls
        const maskLabel = new Label({ class: ['control-label', 'mask-label'], text: localize('panel.camera-frames.mask') });
        const maskToggle = new BooleanInput({ type: 'toggle', class: 'control-element', value: false });
        const maskDetailsToggle = new Button({ class: ['icon-button', 'details-toggle-button'], text: '▶' });
        maskDetailsToggle.dom.title = localize('panel.camera-frames.mask.details');
        maskDetailsToggle.dom.setAttribute('aria-label', localize('panel.camera-frames.mask.details'));
        maskDetailsToggle.dom.setAttribute('aria-expanded', 'false');

        const maskScopeLabel = new Label({ class: ['control-label', 'mask-scope-label'], text: localize('panel.camera-frames.mask.scope') });
        const maskScopeSelect = new SelectInput({
            class: ['control-element', 'mask-scope-select'],
            options: [
                { v: 'all', t: localize('panel.camera-frames.mask.scope.all') },
                { v: 'selected', t: localize('panel.camera-frames.mask.scope.selected') }
            ],
            value: 'all'
        });
        const maskOpacityLabel = new Label({ class: ['control-label', 'mask-opacity-label'], text: localize('panel.camera-frames.mask.opacity') });
        const maskOpacityInput = new NumericInput({
            class: 'control-element',
            precision: 0,
            min: 0,
            max: 100,
            step: 1,
            value: 80
        });

        const zoomMaskRow = new Container({ class: ['control-parent', 'zoom-mask-row'] });
        const zoomGroup = new Container({ class: 'zoom-group' });
        zoomGroup.dom.style.display = 'flex';
        zoomGroup.dom.style.alignItems = 'center';
        zoomGroup.dom.style.gap = '6px';
        zoomGroup.append(canvasZoomLabel);
        zoomGroup.append(canvasZoomInput);
        const maskGroup = new Container({ class: 'mask-group' });
        maskGroup.dom.style.display = 'flex';
        maskGroup.dom.style.alignItems = 'center';
        maskGroup.dom.style.gap = '6px';
        maskGroup.append(maskLabel);
        maskGroup.append(maskToggle);
        maskGroup.append(maskDetailsToggle);
        zoomMaskRow.append(zoomGroup);
        zoomMaskRow.append(maskGroup);

        const maskDetails = new Container({ class: ['inline-details', 'mask-details'] });
        maskDetails.dom.style.display = 'none';
        maskDetails.dom.style.flexDirection = 'column';
        maskDetails.dom.style.gap = '6px';
        const maskScopeRow = new Container({ class: 'control-parent' });
        maskScopeRow.append(maskScopeLabel);
        maskScopeRow.append(maskScopeSelect);
        const maskOpacityRow = new Container({ class: 'control-parent' });
        maskOpacityRow.append(maskOpacityLabel);
        maskOpacityRow.append(maskOpacityInput);
        maskDetails.append(maskScopeRow);
        maskDetails.append(maskOpacityRow);

        const updateMaskDetailsVisibility = () => {
            maskDetails.dom.style.display = maskDetailsCollapsed ? 'none' : 'flex';
            maskDetailsToggle.text = maskDetailsCollapsed ? '▶' : '▼';
            maskDetailsToggle.dom.setAttribute('aria-expanded', (!maskDetailsCollapsed).toString());
        };
        updateMaskDetailsVisibility();
        maskDetailsToggle.on('click', () => {
            maskDetailsCollapsed = !maskDetailsCollapsed;
            updateMaskDetailsVisibility();
        });

        const resolveTargetAvailability = () => {
            const availability = events.invoke('cameraFrames.uiTargetAvailability') as { canSelectMain?: boolean } | null;
            if (availability && typeof availability.canSelectMain === 'boolean') {
                canSelectMain = availability.canSelectMain;
            } else {
                canSelectMain = !framesEnabled && !!lastState?.mainCameraPose;
            }
        };

        const setTargetButtonState = (button: Button, active: boolean, enabled: boolean) => {
            button.class[active ? 'add' : 'remove']('active');
            button.class[enabled ? 'remove' : 'add']('locked');
            if (!enabled) {
                button.class.remove('active'); // ロック時はactive表示を消す（Plan通りMain固定に見せる場合は別ロジックだが、ここではradioの見た目制御）
            }
            if (!enabled && active) {
                // MainがロックされているがActiveとして表示したい場合（CF=ON時）、activeかつlockedにする
                button.class.add('active');
            }

            button.dom.setAttribute('aria-pressed', active ? 'true' : 'false');
            button.enabled = enabled; // input要素としてのdisable
            button.dom.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        };

        const updateTargetUI = () => {
            resolveTargetAvailability();
            const mainEnabled = canSelectMain && !framesEnabled;
            // CF有効時は Main=Selected/Locked, Viewport=Unselected/Locked
            // CF無効時は 通常のRadio動作
            if (framesEnabled) {
                setTargetButtonState(viewportTargetButton, false, false);
                setTargetButtonState(mainTargetButton, true, false);
                mainTargetButton.dom.title = localize('panel.camera-frames.target.locked');
                viewportTargetButton.dom.title = localize('panel.camera-frames.target.locked');
            } else {
                setTargetButtonState(viewportTargetButton, uiTarget === 'viewport', true);
                setTargetButtonState(mainTargetButton, uiTarget === 'main', mainEnabled);
                mainTargetButton.dom.title = localize('panel.camera-frames.target.select');
                viewportTargetButton.dom.title = localize('panel.camera-frames.target.select');
            }
            mainCamBtn.class[framesEnabled ? 'add' : 'remove']('active');
            viewportBtn.class[framesEnabled ? 'remove' : 'add']('active');
        };

        viewportTargetButton.on('click', () => {
            if (suppress) return;
            events.fire('cameraFrames.setUiTarget', 'viewport');
        });
        mainTargetButton.on('click', () => {
            if (suppress) return;
            resolveTargetAvailability();
            if (!canSelectMain || framesEnabled) return;
            events.fire('cameraFrames.setUiTarget', 'main');
        });

        // helpers
        const updateFovUI = (info?: FovInfo) => {
            suppress = true;
            if (info) {
                lastFovInfo = info;
            }
            const current = lastFovInfo;
            const sliderEnabled = framesActive() && !!current;
            fovSlider.enabled = sliderEnabled;
            viewportLensSlider.enabled = uiTarget === 'viewport' && !framesEnabled;
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
        viewportLensSlider.on('change', (value: number) => {
            if (suppress) return;
            events.fire('cameraFrames.setViewportLens', value);
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
        modelLayerToggle.on('click', () => {
            if (suppress) return;
            events.fire('cameraFrames.setExportModelLayers', !modelLayerEnabled);
        });

        const setRenderBusy = (busy: boolean) => {
            rendering = busy;
            renderButton.enabled = !busy;
            renderSpinner.hidden = !busy;
        };

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
        maskScopeSelect.on('change', (value: string) => {
            const next = value === 'selected' ? 'selected' : 'all';
            if (suppress || maskScope === next) return;
            maskScope = next;
            events.fire('cameraFrames.setMask', { scope: next });
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
        camNavControls.append(fpvIcon);
        camNavControls.append(orbitIcon);
        camTransformHeader.append(camTransformArrow);
        camTransformHeader.append(camTransformLabel);
        camTransformHeader.append(camNavControls);
        const setNavModeState = (mode: 'orbit' | 'fpv') => {
            navMode = mode;
            orbitIcon.class[mode === 'orbit' ? 'add' : 'remove']('active');
            fpvIcon.class[mode === 'fpv' ? 'add' : 'remove']('active');
        };

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
            setNavModeState(mode);
            if (uiTarget === 'main') {
                events.fire('cameraFrames.setMainNavMode', mode);
            } else {
                events.fire('camera.setNavMode', mode);
            }
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
            const rotationPayload = {
                yaw: newYaw,
                pitch: newPitch,
                roll: newRoll,
                lockRoll: rollLocked
            };
            if (uiTarget === 'main') {
                events.fire('cameraFrames.setMainCameraRotation', rotationPayload);
            } else {
                events.fire('camera.setRotationEuler', rotationPayload);
            }
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
            const position = {
                x: posX.value,
                y: posY.value,
                z: posZ.value
            };
            const rotation = {
                yaw: yawInput.value,
                pitch: pitchInput.value,
                roll: rollInput.value,
                lockRoll: rollLocked
            };
            if (uiTarget === 'main') {
                events.fire('cameraFrames.setMainCameraPose', { position, rotation });
            } else {
                events.fire('camera.setPositionWorld', position);
                events.fire('camera.setRotationEuler', rotation);
            }
        };
        const applyLocalDelta = (right: number, up: number, forward: number) => {
            if (suppress) return;
            const mul = altSlow ? 0.1 : 1;
            const payload = { right: right * mul, up: up * mul, forward: forward * mul, scale: 1 };
            if (uiTarget === 'main') {
                events.fire('cameraFrames.nudgeMainCamera', payload);
            } else {
                events.fire('camera.nudgeLocal', payload);
            }
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
            const positionPayload = { x: newX, y: newY, z: newZ };
            if (uiTarget === 'main') {
                events.fire('cameraFrames.setMainCameraPosition', positionPayload);
            } else {
                events.fire('camera.setPosition', positionPayload);
            }
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
        this.content.append(fovRow);
        this.content.append(viewportLensRow);
        this.content.append(zoomMaskRow);
        this.content.append(maskDetails);
        this.content.append(exportRow);
        this.content.append(exportDetails);
        this.content.append(mainCameraFileRow);
        this.content.append(framesSectionHeader);
        this.content.append(framesSectionBody);
        this.content.append(layoutGroup);
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
                const isSelected = !!frame.selected;
                if (isSelected) {
                    classes.push('active');
                }

                const item = new Button({
                    text,
                    class: classes
                });
                item.on('click', () => {
                    const nextId = isSelected ? null : frame.id;
                    events.fire('cameraFrames.selectFrame', nextId);
                });
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
            const active = framesActive();
            nearClipRow.dom.style.display = active ? 'grid' : 'none';
            nearClipInput.enabled = active;
        };
        // state update hook
        const updateFromState = (state: CameraFramesState) => {
            suppress = true;

            // enableToggle.value = state.enabled;
            mainCamBtn.class[state.enabled ? 'add' : 'remove']('active');
            viewportBtn.class[!state.enabled ? 'add' : 'remove']('active');
            framesEnabled = state.enabled;
            updateNearClipUI();
            updateTargetUI();
            if (uiTarget === 'main' && state.mainCameraPose?.navMode) {
                setNavModeState(state.mainCameraPose.navMode);
            }

            widthScale.input.value = state.renderBox.scalePct.x;
            heightScale.input.value = state.renderBox.scalePct.y;

            filenameInput.value = state.exportName ?? 'cf-output';
            formatSelect.value = state.exportFormat ?? 'png';
            gridOverlayEnabled = !!state.exportGridOverlay;
            gridToggle.class[gridOverlayEnabled ? 'add' : 'remove']('active');
            gridToggle.dom.setAttribute('aria-pressed', gridOverlayEnabled ? 'true' : 'false');
            modelLayerEnabled = !!state.exportModelLayers;
            modelLayerToggle.class[modelLayerEnabled ? 'add' : 'remove']('active');
            modelLayerToggle.dom.setAttribute('aria-pressed', modelLayerEnabled ? 'true' : 'false');

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
            const hasOverflow = overflowX || overflowY;
            const overflowNote = hasOverflow ? localize('panel.camera-frames.output.viewport-overflow') : '';
            const outputDetail = localize('panel.camera-frames.output.value', {
                outW: formatInteger(outW),
                outH: formatInteger(outH),
                a4x: state.renderBox.scale.kx.toFixed(2),
                a4y: state.renderBox.scale.ky.toFixed(2),
                overflow: overflowNote
            });
            layoutSummary.text = `${formatInteger(outW)}×${formatInteger(outH)}`;
            layoutSummary.dom.title = outputDetail;
            layoutSummary.class[hasOverflow ? 'add' : 'remove']('warning');

            updateAnchorUI(state.renderBox.anchor.ax, state.renderBox.anchor.ay);

            rebuildList(state);

            selectedFrameId = state.frames.find(f => f.selected)?.id ?? null;
            if (selectedFrameId) {
                const frame = state.frames.find(f => f.id === selectedFrameId);
                frameScaleInput.value = frame.scalePct;
            }
            frameScaleInput.enabled = !!selectedFrameId;
            deleteBtn.enabled = !!selectedFrameId;

            maskScope = state.mask.scope === 'selected' ? 'selected' : 'all';
            maskScopeSelect.value = maskScope;
            maskToggle.value = state.mask.enabled;
            const op = Math.round((state.mask.opacity ?? 0) * 100);
            maskOpacityInput.value = op;

            const nearValue = (typeof state.nearClip === 'number' && isFinite(state.nearClip)) ?
                state.nearClip :
                events.invoke('camera.near');
            if (typeof nearValue === 'number' && isFinite(nearValue)) {
                nearClipInput.value = nearValue;
            }

            lastState = state;
            suppress = false;

            updateFovUI();
            applyViewportLensState();
            // update camera pose display (pull live values)
            if (!transformEditing) {
                const transform = (uiTarget === 'main') ?
                    (events.invoke('cameraFrames.mainTransform') as any) :
                    (events.invoke('camera.transform') as any);
                if (transform) {
                    applyTransformToInputs(transform);
                    lastPose = {
                        x: transform.position.x,
                        y: transform.position.y,
                        z: transform.position.z,
                        yaw: transform.rotation.yaw,
                        pitch: transform.rotation.pitch,
                        roll: transform.rotation.roll
                    };
                }
            }
        };

        events.on('cameraFrames.stateChanged', (state: CameraFramesState) => {
            pendingState = state;
            lastState = state;
            if (!appReady) {
                return;
            }
            updateFromState(state);
        });

        events.on('cameraFrames.fovInfoChanged', (info: FovInfo) => {
            updateFovUI(info);
        });
        events.on('cameraFrames.uiTargetChanged', (target: 'viewport' | 'main') => {
            uiTarget = target === 'main' ? 'main' : 'viewport';
            if (!appReady) {
                return;
            }
            updateNearClipUI();
            updateTargetUI();
            updateFovUI();
            applyViewportLensState();
            const nav = uiTarget === 'main' ? (lastState?.mainCameraPose?.navMode ?? navMode) : (events.invoke('camera.navMode') as ('orbit' | 'fpv'));
            if (nav) {
                setNavModeState(nav);
            }
            if (!transformEditing) {
                const transform = (uiTarget === 'main') ?
                    (events.invoke('cameraFrames.mainTransform') as any) :
                    (events.invoke('camera.transform') as any);
                if (transform) {
                    applyTransformToInputs(transform);
                }
            }
        });

        function applyViewportLensState(info?: { enabled: boolean; mm: number; min: number; max: number }) {
            suppress = true;
            const state = (uiTarget === 'viewport' && !framesEnabled) ? (info ?? (events.invoke('cameraFrames.viewportLens') as any)) : null;
            if (state) {
                viewportLensEnabled = !!state.enabled;
                viewportLensSlider.enabled = viewportLensEnabled && uiTarget === 'viewport' && !framesEnabled;
                viewportLensSlider.min = state.min ?? viewportLensSlider.min;
                viewportLensSlider.max = state.max ?? viewportLensSlider.max;
                if (typeof state.mm === 'number' && isFinite(state.mm)) {
                    viewportLensSlider.value = state.mm;
                }
            } else {
                viewportLensEnabled = false;
                viewportLensSlider.enabled = false;
            }
            suppress = false;
        }
        events.on('cameraFrames.viewportLensChanged', (info: any) => applyViewportLensState(info));

        events.on('camera.navMode', (mode: 'orbit' | 'fpv') => {
            if (uiTarget !== 'viewport') return;
            setNavModeState(mode);
        });

        function applyTransformToInputs(t: any) {
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
        }

        events.on('camera.transform', (t: any) => {
            if (uiTarget !== 'viewport') return;
            applyTransformToInputs(t);
        });

        const syncFromModel = () => {
            if (appReady) {
                return;
            }
            appReady = true;

            const referenceState = (events.invoke('referenceImages.state') as ReferenceImagesState | null) ?? null;
            applyReferenceImageState(referenceState);
            applyReferenceIncludeState(referenceState);

            uiTarget = (events.invoke('cameraFrames.uiTarget') as ('viewport' | 'main')) ?? 'viewport';

            const initialFovInfo = events.invoke('cameraFrames.fovInfo') as FovInfo;
            if (initialFovInfo) {
                updateFovUI(initialFovInfo);
            }

            if (pendingState) {
                updateFromState(pendingState);
            } else {
                updateNearClipUI();
                updateTargetUI();
                applyViewportLensState();
            }

            const initialNav = uiTarget === 'main' ?
                (lastState?.mainCameraPose?.navMode ?? (events.invoke('camera.navMode') as ('orbit' | 'fpv'))) :
                (events.invoke('camera.navMode') as ('orbit' | 'fpv'));
            if (initialNav) {
                if (uiTarget === 'viewport') {
                    events.fire('camera.navMode', initialNav);
                } else {
                    setNavModeState(initialNav);
                }
            }

            if (!transformEditing) {
                const initialTransform = (uiTarget === 'main') ?
                    (events.invoke('cameraFrames.mainTransform') as any) :
                    (events.invoke('camera.transform') as any);
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
        };

        events.on('app.ready', syncFromModel);
    }
}

export { CameraFramesPanel };
