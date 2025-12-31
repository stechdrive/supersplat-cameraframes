import { Container, Element as PcuiElement, Label, TextInput } from '@playcanvas/pcui';

import { Element, ElementType } from '../element';
import { Events } from '../events';
import { Model } from '../model';
import deleteSvg from './svg/delete.svg';
import hiddenSvg from './svg/hidden.svg';
import shownSvg from './svg/shown.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class MeshItem extends Container {
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
            class: ['mesh-item', 'visible']
        };

        super(args);

        const text = new Label({
            class: 'mesh-item-text',
            text: name
        });

        const visible = new PcuiElement({
            dom: createSvg(shownSvg),
            class: 'mesh-item-visible'
        });

        const invisible = new PcuiElement({
            dom: createSvg(hiddenSvg),
            class: 'mesh-item-visible',
            hidden: true
        });

        const remove = new PcuiElement({
            dom: createSvg(deleteSvg),
            class: 'mesh-item-delete'
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

class MeshList extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            class: 'mesh-list'
        };

        super(args);

        const items = new Map<Model, MeshItem>();
        const itemsByElement = new Map<MeshItem, Model>();
        let selectionAnchor: Model | null = null;

        const edit = new TextInput({
            id: 'mesh-edit'
        });

        events.on('scene.elementAdded', (element: Element) => {
            if (element.type === ElementType.model) {
                const model = element as Model;
                const item = new MeshItem(model.name, edit);
                this.append(item);
                items.set(model, item);
                itemsByElement.set(item, model);

                item.on('visible', () => {
                    events.fire('mesh.setVisible', model, true);
                    if (!events.invoke('selection')) {
                        events.fire('mesh.select', model);
                    }
                });
                item.on('invisible', () => {
                    events.fire('mesh.setVisible', model, false);
                });
                item.on('rename', (value: string) => {
                    events.fire('mesh.rename', model, value);
                });
            }
        });

        events.on('scene.elementRemoved', (element: Element) => {
            if (element.type === ElementType.model) {
                const model = element as Model;
                const item = items.get(model);
                if (item) {
                    this.remove(item);
                    items.delete(model);
                    itemsByElement.delete(item);
                    if (selectionAnchor === model) {
                        selectionAnchor = null;
                    }
                }
            }
        });

        events.on('selection.changed', (selection: Element, _prev: Element, list?: Element[]) => {
            const selectionList = Array.isArray(list)
                ? list
                : (events.invoke('selection.list') as Element[] | undefined) ?? [];
            const selectedModels = new Set(selectionList.filter((item): item is Model => item instanceof Model));
            items.forEach((value, key) => {
                value.selected = selectedModels.has(key);
                value.class[selection === key ? 'add' : 'remove']('active');
            });
            if (!selectionAnchor || !selectedModels.has(selectionAnchor)) {
                selectionAnchor = selection instanceof Model ? selection : (selectedModels.values().next().value ?? null);
            }
        });

        events.on('model.name', (model: Model) => {
            const item = items.get(model);
            if (item) {
                item.name = model.name;
            }
        });

        events.on('model.visibility', (model: Model) => {
            const item = items.get(model);
            if (item) {
                item.visible = model.visible;
            }
        });

        this.on('click', (item: MeshItem, event: MouseEvent) => {
            const model = itemsByElement.get(item);
            if (!model) {
                return;
            }

            const toggleKey = event.metaKey || event.ctrlKey;
            const shiftKey = event.shiftKey;
            const orderedModels = Array.from(items.keys());
            let nextSelection: Element[] | null = null;

            if (shiftKey && selectionAnchor) {
                const anchorIndex = orderedModels.indexOf(selectionAnchor);
                const clickedIndex = orderedModels.indexOf(model);
                if (anchorIndex !== -1 && clickedIndex !== -1) {
                    const start = Math.min(anchorIndex, clickedIndex);
                    const end = Math.max(anchorIndex, clickedIndex);
                    const range = orderedModels.slice(start, end + 1);
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
                events.fire('selection.set', nextSelection, model);
            } else if (toggleKey) {
                events.fire('selection.toggle', model);
            } else {
                events.fire('selection.set', [model], model);
            }

            selectionAnchor = model;
        });

        this.on('removeClicked', async (item: MeshItem) => {
            const model = itemsByElement.get(item) ?? null;

            if (!model) {
                return;
            }

            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: 'Remove Mesh',
                message: `Are you sure you want to remove '${model.name}' from the scene? This operation can not be undone.`
            });

            if (result?.action === 'yes') {
                events.fire('mesh.remove', model);
            }
        });
    }

    protected _onAppendChild(element: PcuiElement): void {
        super._onAppendChild(element);

        if (element instanceof MeshItem) {
            element.on('click', (event: MouseEvent) => {
                this.emit('click', element, event);
            });

            element.on('removeClicked', () => {
                this.emit('removeClicked', element);
            });
        }
    }

    protected _onRemoveChild(element: PcuiElement): void {
        if (element instanceof MeshItem) {
            element.unbind('click');
            element.unbind('removeClicked');
        }

        super._onRemoveChild(element);
    }
}

export { MeshItem, MeshList };
