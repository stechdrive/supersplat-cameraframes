import { Button, Container, Label, NumericInput, SelectInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { formatInteger, localize } from './localization';
import arrowSvg from './svg/arrow.svg';
import deleteSvg from './svg/delete.svg';
import exportSvg from './svg/export.svg';
import hiddenSvg from './svg/hidden.svg';
import referenceImageSvg from './svg/reference-image.svg';
import shownSvg from './svg/shown.svg';
import undoSvg from './svg/undo.svg';

const createSvg = (svgString: string) => {
    let markup = svgString;
    const prefix = 'data:image/svg+xml,';
    if (svgString.startsWith(prefix)) {
        markup = decodeURIComponent(svgString.substring(prefix.length));
    }
    return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
};

type ReferenceImageItemState = {
    id: string;
    name: string;
    group: 'back' | 'front';
    order: number;
    visible: boolean;
    includeInRender: boolean;
    opacity: number;
    scalePct: number;
    offsetPx: { x: number; y: number; };
    source?: {
        filename: string;
        appliedSize?: { w: number; h: number; };
        usedOriginal?: boolean;
    } | null;
};

type ReferenceImagesState = {
    masterVisible: boolean;
    activeId: string | null;
    items: ReferenceImageItemState[];
};

type SelectionBaseEntry = {
    offsetX: number;
    offsetY: number;
    scalePct: number;
    opacityPct: number;
};

type SelectionBase = {
    activeId: string | null;
    valuesById: Map<string, SelectionBaseEntry>;
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
        const selectedIds = new Set<string>();
        let selectionAnchorId: string | null = null;
        const relativeInputs = new Set<NumericInput>();
        const selectionBaseByInput = new Map<NumericInput, SelectionBase>();

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

        // actions row
        const actionsRow = new Container({ class: ['control-parent', 'reference-image-actions-row'] });
        const infoLabel = new Label({ class: ['control-element-expand', 'reference-image-info'], text: localize('panel.reference-image.empty') });
        const addButton = new Button({ class: ['icon-button'], text: '' });
        addButton.dom.appendChild(createSvg(referenceImageSvg));
        addButton.dom.title = localize('panel.reference-image.load');
        addButton.dom.setAttribute('aria-label', localize('panel.reference-image.load'));
        const clearAllButton = new Button({ class: ['icon-button', 'danger-icon'], text: '' });
        clearAllButton.dom.appendChild(createSvg(deleteSvg));
        clearAllButton.dom.title = localize('panel.reference-image.clear-all');
        clearAllButton.dom.setAttribute('aria-label', localize('panel.reference-image.clear-all'));
        actionsRow.append(infoLabel);
        actionsRow.append(addButton);
        actionsRow.append(clearAllButton);
        [addButton, clearAllButton].forEach((button) => {
            ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
                button.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
            });
        });

        // list (back/front)
        const lists = new Container({ class: 'reference-image-lists' });
        const backGroup = new Container({ class: 'reference-image-group' });
        const backHeader = new Label({ class: 'reference-image-group-title', text: localize('panel.reference-image.layer-back') });
        const backList = new Container({ class: 'reference-image-list' });
        backGroup.append(backHeader);
        backGroup.append(backList);

        const frontGroup = new Container({ class: 'reference-image-group' });
        const frontHeader = new Label({ class: 'reference-image-group-title', text: localize('panel.reference-image.layer-front') });
        const frontList = new Container({ class: 'reference-image-list' });
        frontGroup.append(frontHeader);
        frontGroup.append(frontList);

        lists.append(backGroup);
        lists.append(frontGroup);

        const createReorderButton = (className: string, title: string) => {
            const btn = new Button({ class: ['icon-button', 'reference-image-item-reorder', className], text: '' });
            btn.dom.appendChild(createSvg(arrowSvg));
            btn.dom.title = title;
            btn.dom.setAttribute('aria-label', title);
            return btn;
        };

        const setSelection = (next: Set<string>) => {
            selectedIds.clear();
            next.forEach(id => selectedIds.add(id));
        };

        const normalizeSelection = (state: ReferenceImagesState) => {
            const items = Array.isArray(state?.items) ? state.items : [];
            const validIds = new Set(items.map(item => item.id));
            Array.from(selectedIds).forEach((id) => {
                if (!validIds.has(id)) {
                    selectedIds.delete(id);
                }
            });
            if (state.activeId && validIds.has(state.activeId)) {
                selectedIds.add(state.activeId);
            }
            if (selectedIds.size === 0 && items.length > 0) {
                selectedIds.add(state.activeId ?? items[0].id);
            }
            if (!selectionAnchorId || !validIds.has(selectionAnchorId)) {
                selectionAnchorId = selectedIds.size > 0 ? (state.activeId ?? Array.from(selectedIds)[0] ?? null) : null;
            }
        };

        const getSelectionIds = (state: ReferenceImagesState | null) => {
            const items = Array.isArray(state?.items) ? state.items : [];
            const validIds = new Set(items.map(item => item.id));
            const ids = Array.from(selectedIds).filter(id => validIds.has(id));
            if (ids.length === 0 && state?.activeId && validIds.has(state.activeId)) {
                ids.push(state.activeId);
            }
            return ids;
        };

        const captureSelectionBase = (): SelectionBase | null => {
            const state = events.invoke('referenceImages.state') as ReferenceImagesState | null;
            const items = Array.isArray(state?.items) ? state.items : [];
            const ids = getSelectionIds(state);
            if (ids.length === 0) {
                return null;
            }
            const itemsById = new Map(items.map(item => [item.id, item]));
            const valuesById = new Map<string, SelectionBaseEntry>();
            ids.forEach((id) => {
                const item = itemsById.get(id);
                if (!item) {
                    return;
                }
                valuesById.set(id, {
                    offsetX: -(item.offsetPx?.x ?? 0),
                    offsetY: -(item.offsetPx?.y ?? 0),
                    scalePct: item.scalePct ?? 100,
                    opacityPct: Math.round((item.opacity ?? 0.7) * 100)
                });
            });
            return { activeId: state?.activeId ?? null, valuesById };
        };

        const beginRelative = (input: NumericInput) => {
            if (suppress || relativeInputs.has(input)) {
                return;
            }
            const base = captureSelectionBase();
            if (!base) {
                return;
            }
            relativeInputs.add(input);
            selectionBaseByInput.set(input, base);
        };

        const endRelative = (input: NumericInput) => {
            if (!relativeInputs.has(input)) {
                return;
            }
            relativeInputs.delete(input);
            selectionBaseByInput.delete(input);
        };

        const rebuildList = (state: ReferenceImagesState) => {
            const activeId = state?.activeId ?? null;
            const items = Array.isArray(state?.items) ? state.items : [];
            const itemsById = new Map(items.map(item => [item.id, item]));
            // UIリストは「上が優先(手前)」になるよう、order が大きいものを上に表示する
            const compareOrderDesc = (a: ReferenceImageItemState, b: ReferenceImageItemState) => (b.order - a.order) || a.id.localeCompare(b.id);
            const backItems = items.filter(i => i.group === 'back').slice().sort(compareOrderDesc);
            const frontItems = items.filter(i => i.group === 'front').slice().sort(compareOrderDesc);

            backList.clear();
            frontList.clear();

            const addRows = (list: Container, groupItems: ReferenceImageItemState[]) => {
                const groupIds = groupItems.map(i => i.id);
                groupItems.forEach((item) => {
                    const classes = ['reference-image-item'];
                    if (selectedIds.has(item.id)) {
                        classes.push('selected');
                    }
                    if (activeId === item.id) {
                        classes.push('active');
                    }
                    const row = new Container({ class: classes });

                    const up = createReorderButton('up', localize('panel.reference-image.reorder-up'));
                    const down = createReorderButton('down', localize('panel.reference-image.reorder-down'));
                    // 内部 order は「低いほど下(奥)」「高いほど上(手前)」
                    up.enabled = item.order < groupItems.length - 1;
                    down.enabled = item.order > 0;

                    const visibilityButton = new Button({ class: ['icon-button', 'reference-image-item-visibility'], text: '' });
                    visibilityButton.dom.appendChild(createSvg(item.visible ? shownSvg : hiddenSvg));
                    visibilityButton.class[item.visible ? 'add' : 'remove']('active');
                    const visibilityLabel = item.visible ? localize('panel.reference-image.hide') : localize('panel.reference-image.show');
                    visibilityButton.dom.title = visibilityLabel;
                    visibilityButton.dom.setAttribute('aria-label', visibilityLabel);

                    const exportButton = new Button({ class: ['icon-button', 'reference-image-item-export'], text: '' });
                    exportButton.dom.appendChild(createSvg(exportSvg));
                    exportButton.class[item.includeInRender ? 'add' : 'remove']('active');
                    exportButton.dom.title = localize('panel.reference-image.export-toggle');
                    exportButton.dom.setAttribute('aria-label', localize('panel.reference-image.export-toggle'));

                    const name = new Label({
                        class: 'reference-image-item-name',
                        text: item.name || item.source?.filename || localize('panel.reference-image.empty')
                    });

                    const removeButton = new Button({ class: ['icon-button', 'danger-icon', 'reference-image-item-delete'], text: '' });
                    removeButton.dom.appendChild(createSvg(deleteSvg));
                    removeButton.dom.title = localize('panel.reference-image.delete-item');
                    removeButton.dom.setAttribute('aria-label', localize('panel.reference-image.delete-item'));

                    const stop = (button: Button) => {
                        ['pointerdown', 'pointerup', 'click'].forEach((evt) => {
                            button.dom.addEventListener(evt, (e: Event) => e.stopPropagation());
                        });
                    };
                    [up, down, visibilityButton, exportButton, removeButton].forEach(stop);

                    up.on('click', () => {
                        events.fire('referenceImages.reorder', { id: item.id, group: item.group, toIndex: item.order + 1 });
                    });
                    down.on('click', () => {
                        events.fire('referenceImages.reorder', { id: item.id, group: item.group, toIndex: item.order - 1 });
                    });
                    const applySelectionToggle = (patch: Partial<ReferenceImageItemState>) => {
                        if (!selectedIds.has(item.id)) {
                            setSelection(new Set([item.id]));
                            selectionAnchorId = item.id;
                            events.fire('referenceImages.setActive', item.id);
                            events.fire('referenceImages.update', item.id, patch);
                            return;
                        }
                        const ids = Array.from(selectedIds);
                        if (ids.length === 0) {
                            return;
                        }
                        events.fire('referenceImages.updateMany', { ids, patch });
                    };

                    visibilityButton.on('click', () => {
                        applySelectionToggle({ visible: !item.visible });
                    });
                    exportButton.on('click', () => {
                        applySelectionToggle({ includeInRender: !item.includeInRender });
                    });
                    removeButton.on('click', () => {
                        events.fire('referenceImages.remove', item.id);
                    });

                    row.dom.addEventListener('click', (event: MouseEvent) => {
                        const toggleKey = event.metaKey || event.ctrlKey;
                        const shiftKey = event.shiftKey;
                        let nextSelection: Set<string> | null = null;
                        if (shiftKey && selectionAnchorId) {
                            const anchorItem = itemsById.get(selectionAnchorId);
                            if (anchorItem && anchorItem.group === item.group) {
                                const anchorIndex = groupIds.indexOf(selectionAnchorId);
                                const clickedIndex = groupIds.indexOf(item.id);
                                if (anchorIndex !== -1 && clickedIndex !== -1) {
                                    const start = Math.min(anchorIndex, clickedIndex);
                                    const end = Math.max(anchorIndex, clickedIndex);
                                    nextSelection = new Set(groupIds.slice(start, end + 1));
                                }
                            }
                        }
                        if (!nextSelection) {
                            if (toggleKey) {
                                nextSelection = new Set(selectedIds);
                                if (nextSelection.has(item.id)) {
                                    nextSelection.delete(item.id);
                                } else {
                                    nextSelection.add(item.id);
                                }
                            } else {
                                nextSelection = new Set([item.id]);
                            }
                        }
                        if (nextSelection.size === 0) {
                            nextSelection.add(item.id);
                        }
                        setSelection(nextSelection);
                        selectionAnchorId = item.id;
                        events.fire('referenceImages.setActive', item.id);
                    });

                    row.append(up);
                    row.append(down);
                    row.append(visibilityButton);
                    row.append(exportButton);
                    row.append(name);
                    row.append(removeButton);
                    list.append(row);
                });
            };

            addRows(backList, backItems);
            addRows(frontList, frontItems);
        };

        // properties (active item)
        const groupRow = new Container({ class: ['control-parent'] });
        groupRow.append(new Label({ class: 'control-label', text: localize('panel.reference-image.layer') }));
        const groupSelect = new SelectInput({
            class: 'control-element',
            defaultValue: 'front',
            options: [
                { v: 'front', t: localize('panel.reference-image.layer-front') },
                { v: 'back', t: localize('panel.reference-image.layer-back') }
            ]
        });
        groupRow.append(groupSelect);

        const positionGroup = new Container({ class: 'reference-image-position-group' });

        const offsetRow = new Container({ class: ['control-parent', 'reference-image-offset-row'] });
        offsetRow.append(new Label({ class: 'control-label', text: localize('panel.reference-image.offset') }));
        const offsetX = new NumericInput({ class: 'control-element', step: 1, precision: 0, value: 0 });
        const offsetY = new NumericInput({ class: 'control-element', step: 1, precision: 0, value: 0 });
        offsetX.dom.title = `${localize('panel.reference-image.offset')}X`;
        offsetY.dom.title = `${localize('panel.reference-image.offset')}Y`;
        offsetX.dom.setAttribute('aria-label', `${localize('panel.reference-image.offset')}X`);
        offsetY.dom.setAttribute('aria-label', `${localize('panel.reference-image.offset')}Y`);
        offsetRow.append(offsetX);
        offsetRow.append(offsetY);

        const centerButton = new Button({ class: ['icon-button', 'reference-image-center-button'], text: '' });
        centerButton.dom.appendChild(createSvg(undoSvg));
        centerButton.dom.title = localize('panel.reference-image.center');
        centerButton.dom.setAttribute('aria-label', localize('panel.reference-image.center'));
        offsetRow.append(centerButton);

        const transformRow = new Container({ class: ['control-parent', 'reference-image-transform-row'] });

        const scaleGroup = new Container({ class: 'reference-image-transform-group' });
        const scaleLabel = new Label({ class: 'control-label', text: localize('panel.reference-image.scale') });
        scaleGroup.append(scaleLabel);

        const scaleInput = new NumericInput({
            class: 'control-element',
            min: 10,
            max: 400,
            step: 1,
            precision: 0,
            value: 100,
            style: 'width: 60px'
        });
        scaleInput.dom.title = localize('panel.reference-image.scale');
        scaleInput.dom.setAttribute('aria-label', localize('panel.reference-image.scale'));
        scaleGroup.append(scaleInput);
        transformRow.append(scaleGroup);

        const opacityGroup = new Container({ class: 'reference-image-transform-group' });
        const opacityLabel = new Label({ class: 'control-label', text: localize('panel.reference-image.opacity') });
        opacityGroup.append(opacityLabel);

        const opacityInput = new NumericInput({
            class: 'control-element',
            min: 0,
            max: 100,
            step: 1,
            precision: 0,
            value: 70,
            style: 'width: 60px'
        });
        opacityInput.dom.title = localize('panel.reference-image.opacity');
        opacityInput.dom.setAttribute('aria-label', localize('panel.reference-image.opacity'));
        opacityGroup.append(opacityInput);
        transformRow.append(opacityGroup);

        const registerUndoGroup = (input: NumericInput, label: string) => {
            let active = false;

            const begin = () => {
                if (suppress || active) {
                    return;
                }
                active = true;
                beginRelative(input);
                events.fire('referenceImages.historyBegin', label);
            };

            const commit = () => {
                if (!active) {
                    return;
                }
                active = false;
                events.fire('referenceImages.historyCommit', label);
                endRelative(input);
            };

            input.on('slider:mousedown', begin);
            input.on('slider:mouseup', commit);
            input.on('blur', commit);

            // ArrowUp/ArrowDown は keydown 内で値が更新され 'change' が発火するため、
            // capture で先に begin して 1 操作としてまとめる。
            input.input.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    begin();
                }
            }, true);

            input.input.addEventListener('keyup', (event: KeyboardEvent) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    commit();
                }
            }, true);
        };

        registerUndoGroup(offsetX, 'referenceImages.offset');
        registerUndoGroup(offsetY, 'referenceImages.offset');
        registerUndoGroup(scaleInput, 'referenceImages.scale');
        registerUndoGroup(opacityInput, 'referenceImages.opacity');

        positionGroup.append(offsetRow);
        positionGroup.append(transformRow);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = 'image/png,image/jpeg,image/webp,.psd';

        const getDefaultGroup = (state: ReferenceImagesState) => {
            const active = state.items.find(i => i.id === state.activeId) ?? null;
            return (active?.group === 'back' || active?.group === 'front') ? active.group : 'front';
        };

        fileInput.addEventListener('change', async () => {
            const files = Array.from(fileInput.files ?? []);
            fileInput.value = '';
            if (files.length === 0) {
                return;
            }
            const state = (events.invoke('referenceImages.state') as ReferenceImagesState | null) ?? { masterVisible: true, activeId: null, items: [] };
            const group = getDefaultGroup(state);
            const images: Array<{ blob: Blob; filename?: string }> = [];
            for (const file of files) {
                const lower = file.name.toLowerCase();
                if (lower.endsWith('.psd')) {
                    await events.invoke('referenceImages.importPsd', file, file.name, { group });
                } else {
                    images.push({ blob: file, filename: file.name });
                }
            }
            if (images.length > 0) {
                await events.invoke('referenceImages.addBlobs', images, { group });
            }
        });

        addButton.on('click', () => fileInput.click());
        clearAllButton.on('click', async () => {
            if (suppress) return;
            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: localize('panel.reference-image.title'),
                message: localize('panel.reference-image.clear-all-confirm')
            });
            if (result.action === 'yes') {
                events.fire('referenceImages.clearAll');
            }
        });

        const applyActivePatch = (patch: Partial<ReferenceImageItemState>) => {
            const state = events.invoke('referenceImages.state') as ReferenceImagesState | null;
            const activeId = state?.activeId ?? null;
            if (!activeId) {
                return;
            }
            events.fire('referenceImages.update', activeId, patch);
        };

        const applySelectionUpdates = (updates: Array<{ id: string; patch: Partial<ReferenceImageItemState> }>) => {
            if (updates.length === 0) {
                return;
            }
            events.fire('referenceImages.updateMany', { updates });
        };

        const applySelectionPatch = (patch: Partial<ReferenceImageItemState>) => {
            const state = events.invoke('referenceImages.state') as ReferenceImagesState | null;
            const ids = getSelectionIds(state);
            if (ids.length === 0) {
                return;
            }
            events.fire('referenceImages.updateMany', { ids, patch });
        };

        const applyRelativeUpdates = (
            input: NumericInput,
            value: number,
            getBaseValue: (entry: SelectionBaseEntry) => number,
            toPatch: (nextValue: number) => Partial<ReferenceImageItemState>
        ) => {
            const base = selectionBaseByInput.get(input);
            if (!base || !base.activeId) {
                return false;
            }
            const activeBase = base.valuesById.get(base.activeId);
            if (!activeBase) {
                return false;
            }
            const delta = value - getBaseValue(activeBase);
            const updates: Array<{ id: string; patch: Partial<ReferenceImageItemState> }> = [];
            base.valuesById.forEach((entry, id) => {
                updates.push({ id, patch: toPatch(getBaseValue(entry) + delta) });
            });
            if (updates.length === 0) {
                return false;
            }
            applySelectionUpdates(updates);
            return true;
        };

        groupSelect.on('change', (value: 'back' | 'front') => {
            if (suppress) return;
            applyActivePatch({ group: value });
        });
        opacityInput.on('change', (value: number) => {
            if (suppress) return;
            if (relativeInputs.has(opacityInput)) {
                if (applyRelativeUpdates(
                    opacityInput,
                    value,
                    entry => entry.opacityPct,
                    nextValue => ({ opacity: nextValue / 100 })
                )) {
                    return;
                }
            }
            applySelectionPatch({ opacity: value / 100 });
        });
        scaleInput.on('change', (value: number) => {
            if (suppress) return;
            if (relativeInputs.has(scaleInput)) {
                if (applyRelativeUpdates(
                    scaleInput,
                    value,
                    entry => entry.scalePct,
                    nextValue => ({ scalePct: nextValue })
                )) {
                    return;
                }
            }
            applySelectionPatch({ scalePct: value });
        });
        offsetX.on('change', (value: number) => {
            if (suppress) return;
            if (relativeInputs.has(offsetX)) {
                if (applyRelativeUpdates(
                    offsetX,
                    value,
                    entry => entry.offsetX,
                    nextValue => ({ offsetPx: { x: -nextValue } })
                )) {
                    return;
                }
            }
            applySelectionPatch({ offsetPx: { x: -value } });
        });
        offsetY.on('change', (value: number) => {
            if (suppress) return;
            if (relativeInputs.has(offsetY)) {
                if (applyRelativeUpdates(
                    offsetY,
                    value,
                    entry => entry.offsetY,
                    nextValue => ({ offsetPx: { y: -nextValue } })
                )) {
                    return;
                }
            }
            applySelectionPatch({ offsetPx: { y: -value } });
        });

        centerButton.on('click', () => {
            if (suppress) return;
            const state = events.invoke('referenceImages.state') as ReferenceImagesState | null;
            const activeId = state?.activeId ?? null;
            if (activeId) {
                events.fire('referenceImages.center', activeId);
            }
        });

        const applyState = (state?: ReferenceImagesState | null) => {
            suppress = true;

            const safeState = state ?? { masterVisible: true, activeId: null, items: [] };
            const items = Array.isArray(safeState.items) ? safeState.items : [];
            const activeId = safeState.activeId ?? null;
            const active = activeId ? items.find(i => i.id === activeId) ?? null : null;

            normalizeSelection(safeState);
            rebuildList(safeState);

            const hasItems = items.length > 0;
            clearAllButton.enabled = hasItems;

            const selectedItems = items.filter(item => selectedIds.has(item.id));
            const selectionCount = selectedItems.length;
            const hasSelection = selectionCount > 0;
            const hasActive = !!active;

            groupSelect.enabled = hasActive;
            opacityInput.enabled = hasSelection;
            scaleInput.enabled = hasSelection;
            offsetX.enabled = hasSelection;
            offsetY.enabled = hasSelection;
            centerButton.enabled = hasActive;

            groupSelect.value = (active?.group ?? 'front') as any;

            const isMixedValues = (values: number[]) => {
                return values.length > 1 && values.some(value => Math.abs(value - values[0]) > 1e-3);
            };

            const setMixedValue = (input: NumericInput, value: number, mixed: boolean) => {
                input.value = value;
                if (mixed) {
                    input.class.add('mixed');
                } else {
                    input.class.remove('mixed');
                }
            };

            const activeOpacity = Math.round((active?.opacity ?? 0.7) * 100);
            const activeScale = active?.scalePct ?? 100;
            const activeOffsetX = -(active?.offsetPx?.x ?? 0);
            const activeOffsetY = -(active?.offsetPx?.y ?? 0);

            if (!hasSelection) {
                setMixedValue(opacityInput, activeOpacity, false);
                setMixedValue(scaleInput, activeScale, false);
                setMixedValue(offsetX, activeOffsetX, false);
                setMixedValue(offsetY, activeOffsetY, false);
            } else {
                const opacityValues = selectedItems.map(item => Math.round(item.opacity * 100));
                const scaleValues = selectedItems.map(item => item.scalePct);
                const offsetXValues = selectedItems.map(item => -item.offsetPx.x);
                const offsetYValues = selectedItems.map(item => -item.offsetPx.y);

                const opacityMixed = isMixedValues(opacityValues);
                const scaleMixed = isMixedValues(scaleValues);
                const offsetXMixed = isMixedValues(offsetXValues);
                const offsetYMixed = isMixedValues(offsetYValues);

                setMixedValue(opacityInput, opacityMixed ? activeOpacity : (opacityValues[0] ?? activeOpacity), opacityMixed);
                setMixedValue(scaleInput, scaleMixed ? activeScale : (scaleValues[0] ?? activeScale), scaleMixed);
                setMixedValue(offsetX, offsetXMixed ? activeOffsetX : (offsetXValues[0] ?? activeOffsetX), offsetXMixed);
                setMixedValue(offsetY, offsetYMixed ? activeOffsetY : (offsetYValues[0] ?? activeOffsetY), offsetYMixed);
            }

            const infoParts = [];
            if (active?.source?.filename) {
                infoParts.push(active.source.filename);
            } else if (active?.name) {
                infoParts.push(active.name);
            }
            if (active?.source?.appliedSize) {
                infoParts.push(`${formatInteger(active.source.appliedSize.w)}×${formatInteger(active.source.appliedSize.h)}${active.source.usedOriginal ? '' : ` (${localize('panel.reference-image.scaled')})`}`);
            }
            if (selectionCount > 1) {
                infoLabel.text = localize('panel.reference-image.multi-selected', { count: formatInteger(selectionCount) });
            } else {
                infoLabel.text = active ? infoParts.join(' / ') : localize('panel.reference-image.empty');
            }

            suppress = false;
        };

        const initialState = events.invoke('referenceImages.state') as ReferenceImagesState;
        applyState(initialState);
        events.on('referenceImages.stateChanged', (state: ReferenceImagesState) => applyState(state));

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

        body.append(actionsRow);
        body.append(lists);
        body.append(positionGroup);
        body.append(groupRow);

        this.append(panelHeader);
        this.append(body);
    }
}

export { ReferenceImagePanel };
