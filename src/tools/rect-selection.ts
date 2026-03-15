import { Events } from '../events';
import { isCtrlLike, modifiers } from '../modifier-tracker';

class RectSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement) {
        const toNormalizedPoint = (x: number, y: number) => events.invoke('camera.cssToNormalized', x, y) as { x: number; y: number } | null;

        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg', 'hidden');
        svg.id = 'rect-select-svg';
        parent.appendChild(svg);

        // create rect element
        const rect = document.createElementNS(svg.namespaceURI, 'rect') as SVGRectElement;
        svg.appendChild(rect);

        const start = { x: 0, y: 0 };
        const end = { x: 0, y: 0 };
        let dragId: number | undefined;
        let dragMoved = false;

        const updateRect = () => {
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const width = Math.abs(start.x - end.x);
            const height = Math.abs(start.y - end.y);

            rect.setAttribute('x', x.toString());
            rect.setAttribute('y', y.toString());
            rect.setAttribute('width', width.toString());
            rect.setAttribute('height', height.toString());
        };

        const pointerdown = (e: PointerEvent) => {
            if (dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
                e.preventDefault();
                e.stopPropagation();

                dragId = e.pointerId;
                dragMoved = false;
                parent.setPointerCapture(dragId);

                start.x = end.x = e.offsetX;
                start.y = end.y = e.offsetY;

                updateRect();

                svg.classList.remove('hidden');
            }
        };

        const pointermove = (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                dragMoved = true;
                end.x = e.offsetX;
                end.y = e.offsetY;

                updateRect();
            }
        };

        const dragEnd = () => {
            parent.releasePointerCapture(dragId);
            dragId = undefined;
            svg.classList.add('hidden');
        };

        const pointerup = async (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();
                const modState = modifiers.read(e);
                const op = modState.shift ? 'add' : (isCtrlLike(modState) ? 'remove' : 'set');

                const startPoint = toNormalizedPoint(start.x, start.y);
                const endPoint = toNormalizedPoint(end.x, end.y);
                if (!startPoint || !endPoint) {
                    dragEnd();
                    return;
                }

                if (dragMoved) {
                    // rect select - wait for selection to complete before hiding rect
                    const startX = Math.min(startPoint.x, endPoint.x);
                    const startY = Math.min(startPoint.y, endPoint.y);
                    const endX = Math.max(startPoint.x, endPoint.x);
                    const endY = Math.max(startPoint.y, endPoint.y);
                    if (endX <= startX || endY <= startY) {
                        return;
                    }
                    await events.invoke(
                        'select.rect',
                        op, {
                            start: { x: startX, y: startY },
                            end: { x: endX, y: endY }
                        });
                } else {
                    // pick - wait for selection to complete before hiding rect
                    const point = toNormalizedPoint(e.offsetX, e.offsetY);
                    if (!point) {
                        dragEnd();
                        return;
                    }
                    await events.invoke(
                        'select.point',
                        op,
                        point
                    );
                }

                dragEnd();
            }
        };

        this.activate = () => {
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
        };

        this.deactivate = () => {
            if (dragId !== undefined) {
                dragEnd();
            }
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
        };
    }

    destroy() {

    }
}

export { RectSelection };
