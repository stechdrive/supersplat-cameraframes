import { BooleanInput, Button, Container, Label, NumericInput, Panel, SelectInput, SliderInput, TextInput } from '@playcanvas/pcui';

import { DEFAULT_NEAR_CLIP, MIN_NEAR_CLIP } from '../clip-constants';
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

type CameraFramesStateBase = {
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

type CameraPreset = {
    id: string;
    name: string;
    referenceImagePresetId: string;
    selected?: boolean;
    cameraFramesState: CameraFramesStateBase;
};

type ExportTarget = 'current' | 'all' | 'selected';

type CameraFramesState = CameraFramesStateBase & {
    cameraPresets: CameraPreset[];
    exportTarget?: ExportTarget;
    exportPresetIds?: string[];
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

type ReferenceImagesPresetsState = {
    activePresetId: string | null;
    presets: Array<{ id: string; name: string; }>;
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
        let selectedPresetId: string | null = null;
        let lastFovInfo: FovInfo | null = null;
        let lastState: CameraFramesState | null = null;
        let framesEnabled = false;
        let rendering = false;
        let maskScope: 'all' | 'selected' = 'all';
        let gridOverlayEnabled = false;
        let modelLayerEnabled = false;
        let exportTarget: ExportTarget = 'current';
        let exportPresetIds: string[] = [];
        let navMode: 'orbit' | 'fpv' = 'orbit';
        let viewportLensEnabled = false;
        let canSelectMain = false;
        let mainPropsPanelOpen = false;
        let mainPropsPanelVisible = false;
        let altSlow = false;
        let lastPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
        let mainPropsPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
        let transformEditing = false;
        let transformEditingDepth = 0;
        let mainPropsTransformEditing = false;
        let mainPropsTransformEditingDepth = 0;
        let compact = false;

        let maskDetailsCollapsed = true;
        let exportDetailsCollapsed = true;
        let cameraPresetsCollapsed = true;
        let framesSectionCollapsed = true;
        let referenceIncludeEnabled = false;

        let referenceImageLoaded = false;
        let referenceImageVisible = false;
        let referencePresetOptions: Array<{ v: string; t: string }> = [];

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

        const mainPropsBtn = new Container({ class: ['toggle-icon-btn', 'main-props-toggle'] });
        mainPropsBtn.dom.appendChild(createSvg(viewportSvg));
        mainPropsBtn.dom.title = localize('panel.camera-frames.main-props.toggle');
        mainPropsBtn.dom.setAttribute('aria-label', localize('panel.camera-frames.main-props.toggle'));

        headerToggle.append(mainCamBtn);
        headerToggle.append(mainPropsBtn);

        mainCamBtn.dom.addEventListener('click', () => {
            const next = !framesEnabled;
            events.fire('cameraFrames.setEnabled', next);
            if (next) {
                events.fire('camera.setNavMode', 'fpv');
            }
        });

        mainPropsBtn.dom.addEventListener('click', () => {
            resolveTargetAvailability();
            if (framesEnabled || !canSelectMain) {
                return;
            }
            setMainPropsPanelOpen(!mainPropsPanelOpen);
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
        viewportLensRow.append(viewportLensLabel);
        viewportLensRow.append(viewportLensControl);
        const updateLensVisibility = () => {
            const showMainLens = framesEnabled;
            fovRow.dom.style.display = showMainLens ? 'flex' : 'none';
            viewportLensRow.dom.style.display = showMainLens ? 'none' : 'flex';
        };
        updateLensVisibility();

        const mainPropsPanel = new Container({ class: ['inline-details', 'main-props-panel'] });
        mainPropsPanel.dom.style.display = 'none';
        mainPropsPanel.dom.style.flexDirection = 'column';
        mainPropsPanel.dom.style.gap = '6px';
        const mainPropsTitle = new Label({ class: 'main-props-title', text: localize('panel.camera-frames.main-props.title') });
        const mainPropsBody = new Container({ class: 'main-props-body' });
        mainPropsBody.dom.style.display = 'flex';
        mainPropsBody.dom.style.flexDirection = 'column';
        mainPropsBody.dom.style.gap = '6px';
        mainPropsPanel.append(mainPropsTitle);
        mainPropsPanel.append(mainPropsBody);

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
            value: 'cf-%cam'
        });
        const filenameTooltip = localize('panel.camera-frames.export.filename-tooltip');
        filenameLabel.dom.title = filenameTooltip;
        filenameInput.dom.title = filenameTooltip;
        filenameRow.append(filenameLabel);
        filenameRow.append(filenameInput);

        const exportTargetRow = new Container({ class: 'control-parent' });
        const exportTargetLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.export.target') });
        const exportTargetSelect = new SelectInput({
            class: 'control-element',
            defaultValue: 'current',
            options: [
                { v: 'current', t: localize('panel.camera-frames.export.target.current') },
                { v: 'all', t: localize('panel.camera-frames.export.target.all') },
                { v: 'selected', t: localize('panel.camera-frames.export.target.selected') }
            ]
        });
        exportTargetRow.append(exportTargetLabel);
        exportTargetRow.append(exportTargetSelect);

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
        exportDetails.append(exportTargetRow);
        exportDetails.append(new Container({ class: 'export-details-extra' }));

        const cameraPresetsActions = new Container({ class: 'camera-presets-actions' });
        const cameraPresetsExportBtn = new Button({ class: ['icon-button', 'camera-presets-export-button'], text: '' });
        cameraPresetsExportBtn.dom.appendChild(createSvg(exportSvg));
        cameraPresetsExportBtn.dom.title = localize('panel.camera-frames.camera-presets.export');
        cameraPresetsExportBtn.dom.setAttribute('aria-label', localize('panel.camera-frames.camera-presets.export'));
        cameraPresetsExportBtn.enabled = false;
        const cameraPresetsImportBtn = new Button({ class: ['icon-button', 'camera-presets-import-button'], text: '' });
        cameraPresetsImportBtn.dom.appendChild(createSvg(importSvg));
        cameraPresetsImportBtn.dom.title = localize('panel.camera-frames.camera-presets.import');
        cameraPresetsImportBtn.dom.setAttribute('aria-label', localize('panel.camera-frames.camera-presets.import'));
        const cameraPresetsAddBtn = new Button({ class: ['icon-button', 'camera-presets-add-button'], text: '' });
        cameraPresetsAddBtn.dom.appendChild(createSvg(newSvg));
        cameraPresetsAddBtn.dom.title = localize('panel.camera-frames.camera-presets.add');
        cameraPresetsAddBtn.dom.setAttribute('aria-label', localize('panel.camera-frames.camera-presets.add'));
        const cameraPresetsDeleteBtn = new Button({ class: ['icon-button', 'danger-icon', 'camera-presets-delete-button'], text: '' });
        cameraPresetsDeleteBtn.dom.appendChild(createSvg(deleteSvg));
        cameraPresetsDeleteBtn.dom.title = localize('panel.camera-frames.camera-presets.delete');
        cameraPresetsDeleteBtn.dom.setAttribute('aria-label', localize('panel.camera-frames.camera-presets.delete'));
        cameraPresetsDeleteBtn.enabled = false;

        cameraPresetsExportBtn.on('click', () => {
            if (suppress) return;
            events.invoke('cameraSave.exportCameraPresets');
        });
        cameraPresetsImportBtn.on('click', () => {
            if (suppress) return;
            events.invoke('cameraSave.importCameraPresets');
        });
        cameraPresetsAddBtn.on('click', () => {
            if (suppress) return;
            events.fire('cameraFrames.addCameraPreset');
        });
        cameraPresetsDeleteBtn.on('click', () => {
            if (suppress) return;
            events.fire('cameraFrames.deleteCameraPreset', selectedPresetId);
        });

        [cameraPresetsExportBtn, cameraPresetsImportBtn, cameraPresetsAddBtn, cameraPresetsDeleteBtn].forEach((button) => {
            ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
                button.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
            });
        });

        cameraPresetsActions.dom.style.display = 'flex';
        cameraPresetsActions.dom.style.alignItems = 'center';
        cameraPresetsActions.dom.style.gap = '6px';
        cameraPresetsActions.append(cameraPresetsExportBtn);
        cameraPresetsActions.append(cameraPresetsImportBtn);
        cameraPresetsActions.append(cameraPresetsAddBtn);
        cameraPresetsActions.append(cameraPresetsDeleteBtn);

        const cameraPresetsSectionHeader = new Container({ class: ['control-parent', 'collapsible-header', 'camera-presets-section-header'] });
        const cameraPresetsSectionArrow = new Label({ class: 'collapsible-arrow', text: '▶' });
        const cameraPresetsSectionLabel = new Label({ class: 'control-label', text: localize('panel.camera-frames.camera-presets.section') });
        cameraPresetsSectionHeader.append(cameraPresetsSectionArrow);
        cameraPresetsSectionHeader.append(cameraPresetsSectionLabel);
        cameraPresetsSectionHeader.append(cameraPresetsActions);

        const cameraPresetsList = new Container({ class: 'camera-presets-list' });
        const cameraPresetsEmpty = new Label({ class: 'camera-presets-empty', text: localize('panel.camera-frames.camera-presets.empty') });

        const cameraPresetsSectionBody = new Container({ class: ['collapsible-body', 'camera-presets-section-body'] });
        cameraPresetsSectionBody.append(cameraPresetsList);
        cameraPresetsSectionBody.append(cameraPresetsEmpty);
        cameraPresetsSectionBody.dom.style.display = 'none';
        cameraPresetsSectionBody.dom.style.flexDirection = 'column';
        cameraPresetsSectionBody.dom.style.gap = '6px';
        const updateCameraPresetsSectionVisibility = () => {
            cameraPresetsSectionBody.dom.style.display = cameraPresetsCollapsed ? 'none' : 'flex';
            cameraPresetsSectionArrow.text = cameraPresetsCollapsed ? '▶' : '▼';
            cameraPresetsSectionHeader.class[cameraPresetsCollapsed ? 'remove' : 'add']('active');
            cameraPresetsSectionHeader.dom.setAttribute('aria-expanded', (!cameraPresetsCollapsed).toString());
        };
        updateCameraPresetsSectionVisibility();
        cameraPresetsSectionHeader.on('click', () => {
            cameraPresetsCollapsed = !cameraPresetsCollapsed;
            updateCameraPresetsSectionVisibility();
        });

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

        const applyReferencePresetsState = (state?: ReferenceImagesPresetsState | null) => {
            const presets = Array.isArray(state?.presets) ? state.presets : [];
            referencePresetOptions = presets.map(preset => ({ v: preset.id, t: preset.name }));
        };

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

        const resolveTargetAvailability = (state?: CameraFramesState | null) => {
            const current = state ?? lastState;
            canSelectMain = !framesEnabled && !!current?.mainCameraPose;
        };

        const setMainPropsPanelOpen = (value: boolean) => {
            const next = !!value;
            if (mainPropsPanelOpen === next) {
                return;
            }
            mainPropsPanelOpen = next;
            updateMainPropsPanelVisibility();
            updateMainPropsButton();
        };

        const updateMainPropsButton = () => {
            const enabled = !framesEnabled && canSelectMain;
            mainPropsBtn.class[enabled ? 'remove' : 'add']('locked');
            const active = mainPropsPanelOpen && enabled;
            mainPropsBtn.class[active ? 'add' : 'remove']('active');
            mainPropsBtn.dom.setAttribute('aria-pressed', active ? 'true' : 'false');
            mainPropsBtn.dom.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        };

        const updateMainPropsPanelVisibility = () => {
            const enabled = !framesEnabled && canSelectMain;
            const visible = enabled && mainPropsPanelOpen;
            mainPropsPanel.dom.style.display = visible ? 'flex' : 'none';
            if (mainPropsPanelVisible !== visible) {
                mainPropsPanelVisible = visible;
                events.fire('cameraFrames.setMainEditMode', mainPropsPanelVisible);
            }
        };

        const updateTargetUI = (state?: CameraFramesState | null) => {
            resolveTargetAvailability(state);
            mainCamBtn.class[framesEnabled ? 'add' : 'remove']('active');
            updateMainPropsButton();
            updateMainPropsPanelVisibility();
        };

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
        mainPropsFovSlider.on('change', (value: number) => {
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

        exportTargetSelect.on('change', (value: string) => {
            if (suppress) return;
            const next = value === 'all' ? 'all' : (value === 'selected' ? 'selected' : 'current');
            events.fire('cameraFrames.setExportTarget', next);
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
                    filename: filenameInput.value,
                    target: exportTarget,
                    presetIds: exportPresetIds
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
        mainPropsBody.append(mainPropsFovRow);

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
        mainPropsBody.append(mainPropsPosGrid);

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
        mainPropsBody.append(mainPropsRotGrid);

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
        mainPropsBody.append(mainPropsLocalRow);

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
        mainPropsBody.append(mainPropsNearClipRow);

        const updateMainPropsFovUI = () => {
            suppress = true;
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
            precision: nearPrecision,
            step: nearStep,
            min: MIN_NEAR_CLIP,
            value: DEFAULT_NEAR_CLIP,
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
            if (framesEnabled) {
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


        let rollLocked = false;
        let mainPropsRollLocked = false;
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
            if (framesEnabled) {
                events.fire('cameraFrames.setMainCameraRotation', rotationPayload);
            } else {
                events.fire('camera.setRotationEuler', rotationPayload);
            }
        };
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
        const setRollLockUI = (locked: boolean) => {
            rollLocked = locked;
            rollLock.dom.innerHTML = '';
            rollLock.dom.appendChild(createSvg(locked ? lockSvg : unlockSvg));
            rollLock.class[locked ? 'add' : 'remove']('active');
        };
        const setMainRollLockUI = (locked: boolean) => {
            mainPropsRollLocked = locked;
            mainRollLock.dom.innerHTML = '';
            mainRollLock.dom.appendChild(createSvg(locked ? lockSvg : unlockSvg));
            mainRollLock.class[locked ? 'add' : 'remove']('active');
        };
        setRollLockUI(false);
        setMainRollLockUI(false);
        rollLock.on('click', () => {
            if (suppress) return;
            setRollLockUI(!rollLocked);
            applyRotationChange();
        });
        mainRollLock.on('click', () => {
            if (suppress) return;
            setMainRollLockUI(!mainPropsRollLocked);
            applyMainPropsRotationChange();
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
            if (framesEnabled) {
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
            if (framesEnabled) {
                events.fire('cameraFrames.nudgeMainCamera', payload);
            } else {
                events.fire('camera.nudgeLocal', payload);
            }
        };
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
            nearClipInput.step = step;
            nearClipInput.precision = precision;
            mainPropsNearClipInput.step = step;
            mainPropsNearClipInput.precision = precision;
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
            if (framesEnabled) {
                events.fire('cameraFrames.setMainCameraPosition', positionPayload);
            } else {
                events.fire('camera.setPosition', positionPayload);
            }
        };
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
        posX.on('change', applyPositionChange);
        posY.on('change', applyPositionChange);
        posZ.on('change', applyPositionChange);
        mainPosX.on('change', applyMainPropsPositionChange);
        mainPosY.on('change', applyMainPropsPositionChange);
        mainPosZ.on('change', applyMainPropsPositionChange);

        yawInput.on('change', applyRotationChange);
        pitchInput.on('change', applyRotationChange);
        rollInput.on('change', applyRotationChange);
        mainYawInput.on('change', applyMainPropsRotationChange);
        mainPitchInput.on('change', applyMainPropsRotationChange);
        mainRollInput.on('change', applyMainPropsRotationChange);

        const applyNearClipChange = (value: number) => {
            if (suppress) return;
            events.fire('cameraFrames.setNearClip', value);
        };
        nearClipInput.on('change', applyNearClipChange);
        mainPropsNearClipInput.on('change', applyNearClipChange);

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
        [sliderR, sliderU, sliderF, mainSliderR, mainSliderU, mainSliderF].forEach(hideSliderInputs);

        // assemble
        this.content.append(fovRow);
        this.content.append(viewportLensRow);
        this.content.append(mainPropsPanel);
        this.content.append(zoomMaskRow);
        this.content.append(maskDetails);
        this.content.append(exportRow);
        this.content.append(exportDetails);
        this.content.append(cameraPresetsSectionHeader);
        this.content.append(cameraPresetsSectionBody);
        this.content.append(framesSectionHeader);
        this.content.append(framesSectionBody);
        this.content.append(layoutGroup);
        this.content.append(camTransformHeader);
        this.content.append(camTransformBody);

        // list builder
        const rebuildPresetList = (state: CameraFramesState) => {
            cameraPresetsList.clear();
            const presets = state.cameraPresets ?? [];
            cameraPresetsEmpty.hidden = presets.length > 0;
            const showExportSelection = exportTarget === 'selected';
            presets.forEach((preset) => {
                const row = new Container({ class: 'camera-preset-row' });
                if (preset.selected) {
                    row.class.add('selected');
                }
                if (showExportSelection) {
                    const exportToggle = new BooleanInput({
                        class: ['camera-preset-export-toggle'],
                        value: exportPresetIds.includes(preset.id)
                    });
                    const exportToggleLabel = localize('panel.camera-frames.export.target.select-tooltip');
                    exportToggle.dom.title = exportToggleLabel;
                    exportToggle.dom.setAttribute('aria-label', exportToggleLabel);
                    exportToggle.on('change', (value: boolean) => {
                        if (suppress) return;
                        const next = new Set(exportPresetIds);
                        if (value) {
                            next.add(preset.id);
                        } else {
                            next.delete(preset.id);
                        }
                        const ordered = presets
                        .filter(item => next.has(item.id))
                        .map(item => item.id);
                        exportPresetIds = ordered;
                        events.fire('cameraFrames.setExportPresetIds', ordered);
                    });
                    [exportToggle].forEach((button) => {
                        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
                            button.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
                        });
                    });
                    row.append(exportToggle);
                }
                const labelStack = new Container({ class: 'camera-preset-labels' });
                const nameLabel = new Label({ class: 'camera-preset-name', text: preset.name });
                const referencePresetId = typeof preset.referenceImagePresetId === 'string' ? preset.referenceImagePresetId : '';
                const hasReferencePreset = referencePresetId &&
                    referencePresetOptions.some(option => option.v === referencePresetId);
                const referenceOptions = hasReferencePreset ?
                    referencePresetOptions :
                    [{ v: '', t: localize('panel.camera-frames.camera-presets.reference-image.unset') }, ...referencePresetOptions];
                const referenceSelect = new SelectInput({
                    class: ['camera-preset-reference-select'],
                    defaultValue: hasReferencePreset ? referencePresetId : '',
                    options: referenceOptions
                });
                referenceSelect.value = hasReferencePreset ? referencePresetId : '';
                referenceSelect.enabled = referencePresetOptions.length > 0;
                referenceSelect.on('change', (value: string) => {
                    if (suppress) return;
                    if (typeof value !== 'string' || !value) {
                        return;
                    }
                    events.fire('cameraFrames.setPresetReferenceImage', preset.id, value);
                });
                [referenceSelect].forEach((control) => {
                    ['pointerdown', 'pointerup', 'click', 'dblclick'].forEach((evt) => {
                        control.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
                    });
                });
                labelStack.append(nameLabel);
                labelStack.append(referenceSelect);
                row.append(labelStack);

                let pendingApplyId: number | null = null;
                let editing = false;

                const scheduleApply = () => {
                    if (preset.selected) {
                        return;
                    }
                    if (pendingApplyId !== null) {
                        window.clearTimeout(pendingApplyId);
                    }
                    pendingApplyId = window.setTimeout(() => {
                        pendingApplyId = null;
                        if (!editing) {
                            events.fire('cameraFrames.applyCameraPreset', preset.id);
                        }
                    }, 300);
                };

                let onBlur: (() => void) | null = null;
                let onKeyDown: ((event: KeyboardEvent) => void) | null = null;

                const finishEdit = (commit: boolean, input: TextInput) => {
                    if (!editing) {
                        return;
                    }
                    editing = false;
                    if (onBlur) {
                        input.input.removeEventListener('blur', onBlur);
                    }
                    if (onKeyDown) {
                        input.input.removeEventListener('keydown', onKeyDown);
                    }
                    labelStack.remove(input);
                    nameLabel.hidden = false;
                    if (!commit) {
                        return;
                    }
                    const nextName = input.value.trim();
                    if (nextName && nextName !== preset.name) {
                        events.fire('cameraFrames.renameCameraPreset', preset.id, nextName);
                    }
                };

                const beginEdit = () => {
                    if (editing) {
                        return;
                    }
                    if (pendingApplyId !== null) {
                        window.clearTimeout(pendingApplyId);
                        pendingApplyId = null;
                    }
                    editing = true;
                    nameLabel.hidden = true;
                    const input = new TextInput({ class: 'camera-preset-name-input' });
                    input.value = preset.name;
                    labelStack.appendAfter(input, nameLabel);
                    ['pointerdown', 'click', 'dblclick'].forEach((evt) => {
                        input.dom.addEventListener(evt, (event: Event) => event.stopPropagation());
                    });
                    onKeyDown = (event: KeyboardEvent) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            finishEdit(true, input);
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            finishEdit(false, input);
                        }
                    };
                    onBlur = () => {
                        finishEdit(true, input);
                    };
                    if (onBlur) {
                        input.input.addEventListener('blur', onBlur);
                    }
                    if (onKeyDown) {
                        input.input.addEventListener('keydown', onKeyDown);
                    }
                    input.focus();
                    if (input.input.select) {
                        input.input.select();
                    }
                };

                row.dom.addEventListener('click', (event: MouseEvent) => {
                    if (editing) {
                        return;
                    }
                    event.stopPropagation();
                    scheduleApply();
                });
                nameLabel.dom.addEventListener('dblclick', (event: MouseEvent) => {
                    event.stopPropagation();
                    beginEdit();
                });

                cameraPresetsList.append(row);
            });
        };

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
            nearClipRow.dom.style.display = framesEnabled ? 'grid' : 'none';
            nearClipInput.enabled = framesEnabled;
        };
        // state update hook
        const updateFromState = (state: CameraFramesState) => {
            suppress = true;

            // enableToggle.value = state.enabled;
            framesEnabled = state.enabled;
            updateNearClipUI();
            updateTargetUI(state);
            updateLensVisibility();
            if (framesEnabled && state.mainCameraPose?.navMode) {
                setNavModeState(state.mainCameraPose.navMode);
            } else if (!framesEnabled) {
                const viewportNav = events.invoke('camera.navMode') as ('orbit' | 'fpv');
                if (viewportNav) {
                    setNavModeState(viewportNav);
                }
            }

            widthScale.input.value = state.renderBox.scalePct.x;
            heightScale.input.value = state.renderBox.scalePct.y;

            filenameInput.value = state.exportName ?? 'cf-%cam';
            formatSelect.value = state.exportFormat ?? 'png';
            gridOverlayEnabled = !!state.exportGridOverlay;
            gridToggle.class[gridOverlayEnabled ? 'add' : 'remove']('active');
            gridToggle.dom.setAttribute('aria-pressed', gridOverlayEnabled ? 'true' : 'false');
            modelLayerEnabled = !!state.exportModelLayers;
            modelLayerToggle.class[modelLayerEnabled ? 'add' : 'remove']('active');
            modelLayerToggle.dom.setAttribute('aria-pressed', modelLayerEnabled ? 'true' : 'false');
            exportTarget = state.exportTarget === 'all' ? 'all' : (state.exportTarget === 'selected' ? 'selected' : 'current');
            exportTargetSelect.value = exportTarget;
            exportPresetIds = Array.isArray(state.exportPresetIds) ?
                state.exportPresetIds.filter(id => state.cameraPresets.some(preset => preset.id === id)) :
                [];

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

            rebuildPresetList(state);
            selectedPresetId = state.cameraPresets.find(preset => preset.selected)?.id ?? null;
            cameraPresetsDeleteBtn.enabled = !!selectedPresetId;
            cameraPresetsExportBtn.enabled = state.cameraPresets.length > 0;

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
                mainPropsNearClipInput.value = nearValue;
            }

            lastState = state;
            suppress = false;

            updateFovUI();
            updateMainPropsFovUI();
            applyViewportLensState();
            // update camera pose display (pull live values)
            if (!transformEditing) {
                const transform = framesEnabled ?
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
            if (!mainPropsTransformEditing) {
                const mainTransform = (events.invoke('cameraFrames.mainTransform') as any);
                if (mainTransform) {
                    applyMainPropsTransformToInputs(mainTransform);
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

        events.on('referenceImages.presetsState', (state: ReferenceImagesPresetsState) => {
            applyReferencePresetsState(state);
            if (lastState) {
                rebuildPresetList(lastState);
            }
        });

        events.on('cameraFrames.fovInfoChanged', (info: FovInfo) => {
            updateFovUI(info);
            updateMainPropsFovUI();
        });
        function applyViewportLensState(info?: { enabled: boolean; mm: number; min: number; max: number }) {
            suppress = true;
            const state = !framesEnabled ? (info ?? (events.invoke('cameraFrames.viewportLens') as any)) : null;
            if (state) {
                viewportLensEnabled = !!state.enabled;
                viewportLensSlider.enabled = viewportLensEnabled && !framesEnabled;
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
            if (framesEnabled) return;
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

        function applyMainPropsTransformToInputs(t: any) {
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
        }

        events.on('camera.transform', (t: any) => {
            if (framesEnabled) return;
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
            const referencePresetsState = (events.invoke('referenceImages.presetsState') as ReferenceImagesPresetsState | null) ?? null;
            applyReferencePresetsState(referencePresetsState);
            const enabled = events.invoke('cameraFrames.enabled') as boolean;
            framesEnabled = !!enabled;

            const initialFovInfo = events.invoke('cameraFrames.fovInfo') as FovInfo;
            if (initialFovInfo) {
                updateFovUI(initialFovInfo);
                updateMainPropsFovUI();
            }

            if (pendingState) {
                updateFromState(pendingState);
            } else {
                updateNearClipUI();
                updateTargetUI();
                applyViewportLensState();
            }

            const viewportNav = (events.invoke('camera.navMode') as ('orbit' | 'fpv'));
            const initialNav = framesEnabled ?
                (lastState?.mainCameraPose?.navMode ?? viewportNav) :
                viewportNav;
            if (initialNav) {
                setNavModeState(initialNav);
            }

            if (!transformEditing) {
                const initialTransform = framesEnabled ?
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
            if (!mainPropsTransformEditing) {
                const mainTransform = (events.invoke('cameraFrames.mainTransform') as any);
                if (mainTransform) {
                    applyMainPropsTransformToInputs(mainTransform);
                }
            }
        };

        events.on('app.ready', syncFromModel);
    }
}

export { CameraFramesPanel };
