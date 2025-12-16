import { Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import closeSvg from './svg/close.svg';
import helpSvg from './svg/help.svg';
import openSvg from './svg/open.svg';

const HELP_MANUAL_PATH = 'help/camera_frames_manual.html';
const HELP_DOCK_GAP_PX = 18;
const HELP_DOCK_RIGHT_PX = 102;
const HELP_DOCK_VERTICAL_MARGIN_PX = 24;
const HELP_DOCK_SNAP_PX = 24;

const createSvg = (svgString: string) => {
    let markup = svgString;
    const prefix = 'data:image/svg+xml,';
    if (svgString.startsWith(prefix)) {
        markup = decodeURIComponent(svgString.substring(prefix.length));
    }
    return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
};

class CameraFramesHelpPanel extends Container {
    constructor(events: Events, args: any = {}) {
        super({
            ...args,
            id: 'camera-frames-help-panel',
            class: ['panel', 'camera-frames-help-panel'],
            hidden: true,
            resizable: 'right',
            resizeMin: 280,
            resizeMax: Math.max(360, window.innerWidth - 200)
        });

        ['pointerdown', 'pointerup', 'pointermove', 'click', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const setCssOffsets = (leftOffset: number, rightOffset: number) => {
            document.body.style.setProperty('--camera-frames-help-offset-left', `${Math.max(0, Math.round(leftOffset))}px`);
            document.body.style.setProperty('--camera-frames-help-offset-right', `${Math.max(0, Math.round(rightOffset))}px`);
        };

        const getDockSide = () => {
            const rect = this.dom.getBoundingClientRect();
            const distanceFromRight = window.innerWidth - rect.right;
            if (rect.left <= HELP_DOCK_SNAP_PX) {
                return 'left';
            }
            if (Math.abs(distanceFromRight - HELP_DOCK_RIGHT_PX) <= HELP_DOCK_SNAP_PX) {
                return 'right';
            }
            return 'floating';
        };

        const updateOffsets = () => {
            if (this.hidden) {
                setCssOffsets(0, 0);
                return;
            }

            const width = this.dom.getBoundingClientRect().width;
            const offset = width + HELP_DOCK_GAP_PX;
            const side = getDockSide();
            setCssOffsets(side === 'left' ? offset : 0, side === 'right' ? offset : 0);
            this.resizable = side === 'right' ? 'left' : 'right';
        };

        let manualLoaded = false;
        const iframe = document.createElement('iframe');
        iframe.className = 'camera-frames-help-iframe';
        iframe.loading = 'lazy';
        iframe.title = localize('panel.camera-frames.help.iframe-title');

        const ensureManualLoaded = () => {
            if (manualLoaded) {
                return;
            }
            iframe.src = HELP_MANUAL_PATH;
            manualLoaded = true;
        };

        const applyDockedLayout = (side: 'left' | 'right') => {
            this.dom.style.top = `${HELP_DOCK_VERTICAL_MARGIN_PX}px`;
            this.dom.style.bottom = `${HELP_DOCK_VERTICAL_MARGIN_PX}px`;
            this.dom.style.height = '';
            this.dom.style.transform = 'none';

            if (side === 'left') {
                this.dom.style.left = '0px';
                this.dom.style.right = 'auto';
                this.resizable = 'right';
            } else {
                this.dom.style.left = 'auto';
                this.dom.style.right = `${HELP_DOCK_RIGHT_PX}px`;
                this.resizable = 'left';
            }
        };

        // Make panel draggable by its header
        let dragOffset: { x: number; y: number } | null = null;
        let currentPosition: { left: number; top: number } | null = null;
        let draggingHeight = 0;

        const clampPosition = (left: number, top: number) => {
            const maxLeft = Math.max(0, window.innerWidth - this.dom.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - this.dom.offsetHeight);
            return {
                left: Math.min(Math.max(0, left), maxLeft),
                top: Math.min(Math.max(0, top), maxTop)
            };
        };

        const applyFloatingPosition = (left: number, top: number) => {
            const pos = clampPosition(left, top);
            this.dom.style.left = `${pos.left}px`;
            this.dom.style.top = `${pos.top}px`;
            this.dom.style.right = 'auto';
            this.dom.style.bottom = 'auto';
            this.dom.style.height = `${draggingHeight}px`;
            this.dom.style.transform = 'none';
            currentPosition = pos;
        };

        const onPointerMove = (event: PointerEvent) => {
            if (!dragOffset) return;
            applyFloatingPosition(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
        };

        const stopDrag = () => {
            if (!dragOffset) return;
            window.removeEventListener('pointermove', onPointerMove, true);
            window.removeEventListener('pointerup', stopDrag, true);
            window.removeEventListener('pointercancel', stopDrag, true);
            this.dom.classList.remove('dragging');
            dragOffset = null;

            const side = getDockSide();
            if (side === 'left' || side === 'right') {
                applyDockedLayout(side);
                currentPosition = null;
            }
            updateOffsets();
        };

        const setVisible = (visible: boolean) => {
            const nextHidden = !visible;
            if (this.hidden === nextHidden) {
                return;
            }

            if (visible) {
                ensureManualLoaded();
            }
            this.hidden = nextHidden;
            events.fire('cameraFramesHelpPanel.visible', visible);

            if (visible) {
                requestAnimationFrame(() => updateOffsets());
            } else {
                setCssOffsets(0, 0);
            }
        };

        const updateResizeMax = () => {
            this.resizeMax = Math.max(this.resizeMin, window.innerWidth - 200);
        };

        const header = new Container({ class: 'panel-header' });

        const icon = new Container({ class: 'panel-header-icon' });
        icon.dom.appendChild(createSvg(helpSvg));

        const label = new Label({
            text: localize('panel.camera-frames.help.title'),
            class: 'panel-header-label'
        });

        const openButton = new Container({ class: ['panel-header-button', 'camera-frames-help-open'] });
        openButton.dom.appendChild(createSvg(openSvg));
        openButton.dom.title = localize('panel.camera-frames.help.open');
        openButton.dom.setAttribute('aria-label', openButton.dom.title);
        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
            openButton.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });
        openButton.on('click', () => window.open(HELP_MANUAL_PATH, '_blank')?.focus());

        const closeButton = new Container({ class: ['panel-header-button', 'camera-frames-help-close'] });
        closeButton.dom.appendChild(createSvg(closeSvg));
        closeButton.dom.title = localize('panel.camera-frames.help.close');
        closeButton.dom.setAttribute('aria-label', closeButton.dom.title);
        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
            closeButton.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
        });
        closeButton.on('click', () => setVisible(false));

        header.append(icon);
        header.append(label);
        header.append(openButton);
        header.append(closeButton);

        header.dom.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== 0) return;
            event.stopPropagation();

            const rect = this.dom.getBoundingClientRect();
            dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            draggingHeight = rect.height;
            applyFloatingPosition(rect.left, rect.top);

            this.dom.classList.add('dragging');

            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', stopDrag, true);
            window.addEventListener('pointercancel', stopDrag, true);
        });

        const body = new Container({ class: 'camera-frames-help-body' });

        body.append(new Element({ dom: iframe }));

        this.append(header);
        this.append(body);

        events.function('cameraFramesHelpPanel.visible', () => {
            return !this.hidden;
        });

        events.on('cameraFramesHelpPanel.setVisible', (visible: boolean) => {
            setVisible(!!visible);
        });

        events.on('cameraFramesHelpPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('cameraFramesPanel.visible', (visible: boolean) => {
            if (!visible) {
                setVisible(false);
            }
        });

        this.on('resize', () => updateOffsets());

        window.addEventListener('resize', () => {
            updateResizeMax();
            if (currentPosition) {
                applyFloatingPosition(currentPosition.left, currentPosition.top);
            } else if (!this.hidden) {
                const side = getDockSide();
                if (side === 'left' || side === 'right') {
                    applyDockedLayout(side);
                }
            }
            if (!this.hidden) {
                requestAnimationFrame(() => updateOffsets());
            }
        });

        updateResizeMax();
        applyDockedLayout('left');
        setCssOffsets(0, 0);
    }
}

export { CameraFramesHelpPanel, HELP_MANUAL_PATH };
