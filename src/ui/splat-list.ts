import { Container, Label, Element as PcuiElement, TextInput } from '@playcanvas/pcui';

import { SplatRenameOp } from '../edit-ops';
import { Element, ElementType } from '../element';
import { Events } from '../events';
import { Splat } from '../splat';
import deleteSvg from './svg/delete.svg';
import hiddenSvg from './svg/hidden.svg';
import shownSvg from './svg/shown.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class SplatItem extends Container {
    getName: () => string;
    setName: (value: string) => void;
    getSelected: () => boolean;
    setSelected: (value: boolean) => void;
    getVisible: () => boolean;
    setVisible: (value: boolean) => void;
    destroy: () => void;

    constructor(name: string, edit: TextInput, args = {}) {
        args = {
            ...args,
            class: ['splat-item', 'visible']
        };

        super(args);

        const text = new Label({
            class: 'splat-item-text',
            text: name
        });

        const visible = new PcuiElement({
            dom: createSvg(shownSvg),
            class: 'splat-item-visible'
        });

        const invisible = new PcuiElement({
            dom: createSvg(hiddenSvg),
            class: 'splat-item-visible',
            hidden: true
        });

        const remove = new PcuiElement({
            dom: createSvg(deleteSvg),
            class: 'splat-item-delete'
        });

        this.append(text);
        this.append(visible);
        this.append(invisible);
        this.append(remove);

        this.getName = () => {
            return text.value;
        };

        this.setName = (value: string) => {
            text.value = value;
        };

        this.getSelected = () => {
            return this.class.contains('selected');
        };

        this.setSelected = (value: boolean) => {
            if (value !== this.selected) {
                if (value) {
                    this.class.add('selected');
                    this.emit('select', this);
                } else {
                    this.class.remove('selected');
                    this.emit('unselect', this);
                }
            }
        };

        this.getVisible = () => {
            return this.class.contains('visible');
        };

        this.setVisible = (value: boolean) => {
            if (value !== this.visible) {
                visible.hidden = !value;
                invisible.hidden = value;
                if (value) {
                    this.class.add('visible');
                    this.emit('visible', this);
                } else {
                    this.class.remove('visible');
                    this.emit('invisible', this);
                }
            }
        };

        const toggleVisible = (event: MouseEvent) => {
            event.stopPropagation();
            this.visible = !this.visible;
        };

        const handleRemove = (event: MouseEvent) => {
            event.stopPropagation();
            this.emit('removeClicked', this);
        };

        // rename on double click
        text.dom.addEventListener('dblclick', (event: MouseEvent) => {
            event.stopPropagation();

            const onblur = () => {
                this.remove(edit);
                this.emit('rename', edit.value);
                edit.input.removeEventListener('blur', onblur);
                text.hidden = false;
            };

            text.hidden = true;

            this.appendAfter(edit, text);
            edit.value = text.value;
            edit.input.addEventListener('blur', onblur);
            edit.focus();
        });

        // handle clicks
        visible.dom.addEventListener('click', toggleVisible);
        invisible.dom.addEventListener('click', toggleVisible);
        remove.dom.addEventListener('click', handleRemove);

        this.destroy = () => {
            visible.dom.removeEventListener('click', toggleVisible);
            invisible.dom.removeEventListener('click', toggleVisible);
            remove.dom.removeEventListener('click', handleRemove);
        };
    }

    set name(value: string) {
        this.setName(value);
    }

    get name() {
        return this.getName();
    }

    set selected(value) {
        this.setSelected(value);
    }

    get selected() {
        return this.getSelected();
    }

    set visible(value) {
        this.setVisible(value);
    }

    get visible() {
        return this.getVisible();
    }
}

class SplatList extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            class: 'splat-list'
        };

        super(args);

        const items = new Map<Splat, SplatItem>();
        const itemsByElement = new Map<SplatItem, Splat>();
        let selectionAnchor: Splat | null = null;
        let soloMode = false;
        const savedVisibility = new Map<Splat, boolean>();

        // edit input used during renames
        const edit = new TextInput({
            id: 'splat-edit'
        });

        const collectSelectedSplats = (list?: Element[]) => {
            const selectionList = Array.isArray(list) ?
                list :
                (events.invoke('selection.list') as Element[] | undefined) ?? [];

            return new Set(selectionList.filter((item): item is Splat => item instanceof Splat));
        };

        const applySoloVisibility = (selectedSplats: ReadonlySet<Splat>) => {
            if (!soloMode) {
                return;
            }

            items.forEach((_item, splat) => {
                splat.visible = selectedSplats.has(splat);
            });
        };

        events.on('scene.elementAdded', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = new SplatItem(splat.name, edit);
                this.append(item);
                items.set(splat, item);
                itemsByElement.set(item, splat);

                if (soloMode) {
                    savedVisibility.set(splat, splat.visible);
                    splat.visible = collectSelectedSplats().has(splat);
                }

                item.on('visible', () => {
                    if (soloMode) {
                        savedVisibility.set(splat, true);
                    }

                    splat.visible = true;

                    // also select it if there is no other selection
                    if (!events.invoke('selection')) {
                        events.fire('selection', splat);
                    }
                });
                item.on('invisible', () => {
                    if (soloMode) {
                        savedVisibility.set(splat, false);
                    }
                    splat.visible = false;
                });
                item.on('rename', (value: string) => {
                    events.fire('edit.add', new SplatRenameOp(splat, value));
                });
            }
        });

        events.on('scene.elementRemoved', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = items.get(splat);
                if (item) {
                    this.remove(item);
                    items.delete(splat);
                    itemsByElement.delete(item);
                    if (selectionAnchor === splat) {
                        selectionAnchor = null;
                    }
                }
                savedVisibility.delete(splat);
            }
        });

        events.on('selection.changed', (selection: Element, _prev: Element, list?: Element[]) => {
            const selectedSplats = collectSelectedSplats(list);
            items.forEach((value, key) => {
                value.selected = selectedSplats.has(key);
                value.class[selection === key ? 'add' : 'remove']('active');
            });
            if (!selectionAnchor || !selectedSplats.has(selectionAnchor)) {
                selectionAnchor = selection instanceof Splat ? selection : (selectedSplats.values().next().value ?? null);
            }

            applySoloVisibility(selectedSplats);
        });

        events.on('scene.solo', (value: boolean) => {
            soloMode = value;

            if (soloMode) {
                items.forEach((_item, splat) => {
                    savedVisibility.set(splat, splat.visible);
                });
                applySoloVisibility(collectSelectedSplats());
            } else {
                items.forEach((_item, splat) => {
                    const wasVisible = savedVisibility.get(splat);
                    splat.visible = wasVisible !== undefined ? wasVisible : true;
                });
                savedVisibility.clear();
            }
        });

        events.on('splat.name', (splat: Splat) => {
            const item = items.get(splat);
            if (item) {
                item.name = splat.name;
            }
        });

        events.on('splat.visibility', (splat: Splat) => {
            const item = items.get(splat);
            if (item) {
                item.visible = splat.visible;
            }
        });

        this.on('click', (item: SplatItem, event: MouseEvent) => {
            const splat = itemsByElement.get(item);
            if (!splat) {
                return;
            }

            const toggleKey = event.metaKey || event.ctrlKey;
            const shiftKey = event.shiftKey;
            const orderedSplats = Array.from(items.keys());
            let nextSelection: Element[] | null = null;

            if (shiftKey && selectionAnchor) {
                const anchorIndex = orderedSplats.indexOf(selectionAnchor);
                const clickedIndex = orderedSplats.indexOf(splat);
                if (anchorIndex !== -1 && clickedIndex !== -1) {
                    const start = Math.min(anchorIndex, clickedIndex);
                    const end = Math.max(anchorIndex, clickedIndex);
                    const range = orderedSplats.slice(start, end + 1);
                    if (toggleKey) {
                        const existing = events.invoke('selection.list') as Element[];
                        const merged = existing.slice();
                        range.forEach((entry) => {
                            if (!merged.includes(entry)) {
                                merged.push(entry);
                            }
                        });
                        nextSelection = merged;
                    } else {
                        nextSelection = range;
                    }
                }
            }

            if (nextSelection) {
                events.fire('selection.set', nextSelection, splat);
            } else if (toggleKey) {
                events.fire('selection.toggle', splat);
            } else {
                events.fire('selection.set', [splat], splat);
            }

            selectionAnchor = splat;
        });

        this.on('removeClicked', async (item: SplatItem) => {
            const splat = itemsByElement.get(item);

            if (!splat) {
                return;
            }

            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: 'Remove Splat',
                message: `Are you sure you want to remove '${splat.name}' from the scene? This operation can not be undone.`
            });

            if (result?.action === 'yes') {
                splat.destroy();
            }
        });
    }

    protected _onAppendChild(element: PcuiElement): void {
        super._onAppendChild(element);

        if (element instanceof SplatItem) {
            element.on('click', (event: MouseEvent) => {
                this.emit('click', element, event);
            });

            element.on('removeClicked', () => {
                this.emit('removeClicked', element);
            });
        }
    }

    protected _onRemoveChild(element: PcuiElement): void {
        if (element instanceof SplatItem) {
            element.unbind('click');
            element.unbind('removeClicked');
        }

        super._onRemoveChild(element);
    }
}

export { SplatList, SplatItem };
