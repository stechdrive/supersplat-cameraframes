import { Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { recentFiles } from '../recent-files';
import { ShortcutManager } from '../shortcut-manager';
import { canUseWebGPU } from '../webgpu';
import { localize } from './localization';
import { MenuPanel, MenuItem } from './menu-panel';
import arrowSvg from './svg/arrow.svg';
import collapseSvg from './svg/collapse.svg';
import selectDelete from './svg/delete.svg';
import sceneExport from './svg/export.svg';
import sceneImport from './svg/import.svg';
import sceneNew from './svg/new.svg';
import sceneOpen from './svg/open.svg';
import scenePublish from './svg/publish.svg';
import sceneSave from './svg/save.svg';
import selectAll from './svg/select-all.svg';
import selectDuplicate from './svg/select-duplicate.svg';
import selectInverse from './svg/select-inverse.svg';
import selectLock from './svg/select-lock.svg';
import selectNone from './svg/select-none.svg';
import selectSeparate from './svg/select-separate.svg';
import selectUnlock from './svg/select-unlock.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement
    });
};

const getOpenRecentItems = async (events: Events) => {
    const files = await recentFiles.get();
    const items: MenuItem[] = files.map((file) => {
        return {
            text: file.name,
            onSelect: () => events.invoke('doc.openRecent', file.handle)
        };
    });

    if (items.length > 0) {
        items.push({}); // separator
        items.push({
            text: localize('menu.file.open-recent.clear'),
            icon: createSvg(selectDelete),
            onSelect: () => recentFiles.clear()
        });
    }

    return items;
};

type DocStatus = {
    name?: string | null;
    stateDirty?: boolean;
    packageDirty?: boolean;
};

class Menu extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'menu'
        };

        super(args);

        const menuStrip = new Container({
            id: 'menu-strip'
        });

        const menubar = new Container({
            id: 'menu-bar'
        });

        menubar.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const scene = new Label({
            text: localize('menu.file'),
            class: 'menu-option'
        });

        const render = new Label({
            text: localize('menu.render'),
            class: 'menu-option'
        });

        const selection = new Label({
            text: localize('menu.select'),
            class: 'menu-option'
        });

        const help = new Label({
            text: localize('menu.help'),
            class: 'menu-option'
        });

        const setCollapsed = (collapsed: boolean) => {
            document.body.classList[collapsed ? 'add' : 'remove']('collapsed');
        };

        const toggleCollapsed = () => {
            setCollapsed(!document.body.classList.contains('collapsed'));
        };

        // 起動時は折りたたみ状態で開始
        setCollapsed(true);

        const collapse = createSvg(collapseSvg);
        collapse.dom.classList.add('menu-icon');
        collapse.dom.setAttribute('id', 'menu-collapse');
        collapse.dom.addEventListener('click', toggleCollapsed);

        const arrow = createSvg(arrowSvg);
        arrow.dom.classList.add('menu-icon');
        arrow.dom.setAttribute('id', 'menu-arrow');
        arrow.dom.addEventListener('click', toggleCollapsed);

        const buttonsContainer = new Container({
            id: 'menu-bar-options'
        });
        buttonsContainer.append(scene);
        buttonsContainer.append(selection);
        buttonsContainer.append(render);
        buttonsContainer.append(help);
        buttonsContainer.append(collapse);
        buttonsContainer.append(arrow);

        menubar.append(buttonsContainer);

        const docChip = new Container({
            id: 'doc-chip'
        });

        const docChipName = new Label({
            id: 'doc-chip-name'
        });

        const docChipDirty = new Label({
            id: 'doc-chip-dirty',
            text: '*',
            hidden: true
        });

        const docChipPackage = new Label({
            id: 'doc-chip-package',
            text: 'PKG',
            hidden: true
        });

        docChip.append(docChipName);
        docChip.append(docChipDirty);
        docChip.append(docChipPackage);

        const updateDocChip = (status?: DocStatus) => {
            const resolvedStatus = status ?? (
                events.functions.has('doc.status') ?
                    events.invoke('doc.status') as DocStatus :
                    null
            );

            const displayName = (typeof resolvedStatus?.name === 'string' && resolvedStatus.name.length > 0) ?
                resolvedStatus.name :
                localize('doc.status.untitled');
            const hasStateDirty = resolvedStatus?.stateDirty === true;
            const hasPackageDirty = resolvedStatus?.packageDirty === true;

            docChipName.text = displayName;
            docChipDirty.hidden = !hasStateDirty;
            docChipPackage.hidden = !hasPackageDirty;

            const titleLines = [displayName];
            if (hasStateDirty) {
                titleLines.push(localize('doc.status.tooltip.working-dirty'));
            }
            if (hasPackageDirty) {
                titleLines.push(localize('doc.status.tooltip.package-dirty'));
            }
            docChip.dom.title = titleLines.join('\n');
        };

        events.on('doc.name', () => updateDocChip());
        events.on('doc.statusChanged', (status: DocStatus) => updateDocChip(status));
        events.on('app.bootstrapComplete', () => updateDocChip());
        updateDocChip();

        menuStrip.append(menubar);
        menuStrip.append(docChip);

        // Get the shortcut manager for displaying keyboard shortcuts
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const canExportWebGpuFormats = async () => {
            if (events.invoke('scene.empty')) {
                return false;
            }
            return await canUseWebGPU();
        };
        const hasProjectSplats = () => (((events.invokeOptional('scene.allSplats') as any[])?.length ?? 0) > 0);

        const exportMenuPanel = new MenuPanel([{
            text: localize('menu.file.export.ply'),
            icon: createSvg(sceneExport),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('scene.export', 'ply')
        }, {
            text: localize('menu.file.export.splat'),
            icon: createSvg(sceneExport),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('scene.export', 'splat')
        }, {
            text: localize('menu.file.export.sog'),
            icon: createSvg(sceneExport),
            isEnabled: canExportWebGpuFormats,
            onSelect: () => events.invoke('scene.export', 'sog')
        }, {
            // separator
        }, {
            text: localize('menu.file.export.viewer', { ellipsis: true }),
            icon: createSvg(sceneExport),
            isEnabled: canExportWebGpuFormats,
            onSelect: () => events.invoke('scene.export', 'viewer')
        }]);

        const openRecentMenuPanel = new MenuPanel([]);

        const fileMenuPanel = new MenuPanel([{
            text: localize('menu.file.new'),
            icon: createSvg(sceneNew),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: () => events.invoke('doc.new')
        }, {
            text: localize('menu.file.open'),
            icon: createSvg(sceneOpen),
            onSelect: async () => {
                await events.invoke('doc.open');
            }
        }, {
            text: localize('menu.file.open-recent'),
            icon: createSvg(sceneOpen),
            subMenu: openRecentMenuPanel,
            isEnabled: async () => {
                // refresh open recent menu items when the parent menu is opened
                try {
                    const items = await getOpenRecentItems(events);
                    openRecentMenuPanel.setItems(items);
                    return items.length > 0;
                } catch (error) {
                    console.error('Failed to load recent files:', error);
                    return false;
                }
            }
        }, {
            // separator
        }, {
            text: localize('menu.file.save'),
            icon: createSvg(sceneSave),
            extra: shortcutManager.formatShortcut('doc.save'),
            isEnabled: () => true,
            onSelect: async () => await events.invoke('doc.save')
        }, {
            text: localize('menu.file.save-package'),
            icon: createSvg(sceneSave),
            extra: shortcutManager.formatShortcut('doc.savePackage'),
            isEnabled: () => true,
            onSelect: async () => await events.invoke('doc.savePackage')
        }, {
            text: localize('menu.file.save-package-as', { ellipsis: true }),
            icon: createSvg(sceneSave),
            isEnabled: () => true,
            onSelect: async () => await events.invoke('doc.savePackageAs')
        }, {
            text: localize('menu.file.save-package-sog-all', { ellipsis: true }),
            icon: createSvg(sceneSave),
            isEnabled: hasProjectSplats,
            onSelect: async () => await events.invoke('doc.savePackageSogAll')
        }, {
            text: localize('menu.file.clear-working-state', { ellipsis: true }),
            icon: createSvg(selectDelete),
            isEnabled: async () => {
                const stats = await events.invoke('doc.localWorkingStateStats') as {
                    projectCount?: number;
                } | null;
                return (stats?.projectCount ?? 0) > 0;
            },
            onSelect: async () => await events.invoke('doc.clearLocalWorkingState')
        }, {
            // separator
        }, {
            text: localize('menu.file.import', { ellipsis: true }),
            icon: createSvg(sceneImport),
            onSelect: async () => {
                await events.invoke('scene.import');
            }
        }, {
            text: localize('menu.file.export'),
            icon: createSvg(sceneExport),
            subMenu: exportMenuPanel
        }, {
            text: localize('menu.file.publish', { ellipsis: true }),
            icon: createSvg(scenePublish),
            isEnabled: () => !events.invoke('scene.empty'),
            onSelect: async () => await events.invoke('show.publishSettingsDialog')
        }]);

        const hasActiveSplat = () => events.invokeOptional('selection.splatActive');
        const hasSplatSelection = () => events.invoke('selection.splats');

        const selectionMenuPanel = new MenuPanel([{
            text: localize('menu.select.all'),
            icon: createSvg(selectAll),
            extra: shortcutManager.formatShortcut('select.all'),
            isEnabled: hasActiveSplat,
            onSelect: () => events.fire('select.all')
        }, {
            text: localize('menu.select.none'),
            icon: createSvg(selectNone),
            extra: shortcutManager.formatShortcut('select.none'),
            isEnabled: hasActiveSplat,
            onSelect: () => events.fire('select.none')
        }, {
            text: localize('menu.select.invert'),
            icon: createSvg(selectInverse),
            extra: shortcutManager.formatShortcut('select.invert'),
            isEnabled: hasActiveSplat,
            onSelect: () => events.fire('select.invert')
        }, {
            // separator
        }, {
            text: localize('menu.select.lock'),
            icon: createSvg(selectLock),
            extra: shortcutManager.formatShortcut('select.hide'),
            isEnabled: hasSplatSelection,
            onSelect: () => events.fire('select.hide')
        }, {
            text: localize('menu.select.unlock'),
            icon: createSvg(selectUnlock),
            extra: shortcutManager.formatShortcut('select.unhide'),
            isEnabled: hasActiveSplat,
            onSelect: () => events.fire('select.unhide')
        }, {
            text: localize('menu.select.delete'),
            icon: createSvg(selectDelete),
            extra: shortcutManager.formatShortcut('select.delete'),
            isEnabled: hasSplatSelection,
            onSelect: () => events.fire('select.delete')
        }, {
            text: localize('menu.select.reset'),
            isEnabled: hasActiveSplat,
            onSelect: () => events.fire('scene.reset')
        }, {
            // separator
        }, {
            text: localize('menu.select.duplicate'),
            icon: createSvg(selectDuplicate),
            isEnabled: hasSplatSelection,
            onSelect: () => events.fire('select.duplicate')
        }, {
            text: localize('menu.select.separate'),
            icon: createSvg(selectSeparate),
            isEnabled: hasSplatSelection,
            onSelect: () => events.fire('select.separate')
        }]);

        const renderMenuPanel = new MenuPanel([{
            text: localize('menu.render.image', { ellipsis: true }),
            icon: createSvg(sceneExport),
            isEnabled: () => false,
            onSelect: async () => await events.invoke('show.imageSettingsDialog')
        }, {
            text: localize('menu.render.video', { ellipsis: true }),
            icon: createSvg(sceneExport),
            isEnabled: () => false,
            onSelect: async () => await events.invoke('show.videoSettingsDialog')
        }]);

        const videoTutorialsMenuPanel = new MenuPanel([{
            text: localize('menu.help.video-tutorials.basics'),
            icon: 'E261',
            onSelect: () => window.open('https://youtu.be/MwzaEM2I55I', '_blank')?.focus()
        }, {
            text: localize('menu.help.video-tutorials.in-depth'),
            icon: 'E261',
            onSelect: () => window.open('https://youtu.be/J37rTieKgJ8', '_blank')?.focus()
        }]);

        const helpMenuPanel = new MenuPanel([{
            text: localize('menu.help.video-tutorials'),
            icon: 'E261',
            subMenu: videoTutorialsMenuPanel
        }, {
            text: localize('menu.help.user-guide'),
            icon: 'E232',
            onSelect: () => window.open('https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/', '_blank')?.focus()
        }, {
            text: localize('menu.help.shortcuts'),
            icon: 'E136',
            onSelect: () => events.fire('show.shortcuts')
        }, {
            // separator
        }, {
            text: localize('menu.help.discord'),
            icon: 'E233',
            onSelect: () => window.open('https://discord.gg/T3pnhRTTAY', '_blank')?.focus()
        }, {
            text: localize('menu.help.forum'),
            icon: 'E432',
            onSelect: () => window.open('https://forum.playcanvas.com', '_blank')?.focus()
        }, {
            // separator
        }, {
            text: localize('menu.help.github-repo'),
            icon: 'E259',
            onSelect: () => window.open('https://github.com/playcanvas/supersplat', '_blank')?.focus()
        }, {
            text: localize('menu.help.log-issue'),
            icon: 'E336',
            onSelect: () => window.open('https://github.com/playcanvas/supersplat/issues', '_blank')?.focus()
        }, {
            // separator
        }, {
            text: localize('menu.help.about'),
            icon: 'E138',
            onSelect: () => events.fire('show.about')
        }]);

        this.append(menuStrip);
        this.append(fileMenuPanel);
        this.append(openRecentMenuPanel);
        this.append(exportMenuPanel);
        this.append(selectionMenuPanel);
        this.append(renderMenuPanel);
        this.append(videoTutorialsMenuPanel);
        this.append(helpMenuPanel);

        const options: { dom: HTMLElement, menuPanel: MenuPanel }[] = [{
            dom: scene.dom,
            menuPanel: fileMenuPanel
        }, {
            dom: selection.dom,
            menuPanel: selectionMenuPanel
        }, {
            dom: render.dom,
            menuPanel: renderMenuPanel
        }, {
            dom: help.dom,
            menuPanel: helpMenuPanel
        }];

        options.forEach((option) => {
            const activate = () => {
                option.menuPanel.position(option.dom, 'bottom', 2);
                options.forEach((opt) => {
                    opt.menuPanel.hidden = opt !== option;
                });
            };

            option.dom.addEventListener('pointerdown', (event: PointerEvent) => {
                if (!option.menuPanel.hidden) {
                    option.menuPanel.hidden = true;
                } else {
                    activate();
                }
            });

            option.dom.addEventListener('pointerenter', (event: PointerEvent) => {
                if (!options.every(opt => opt.menuPanel.hidden)) {
                    activate();
                }
            });
        });

        const checkEvent = (event: PointerEvent) => {
            if (!this.dom.contains(event.target as Node)) {
                options.forEach((opt) => {
                    opt.menuPanel.hidden = true;
                });
            }
        };

        window.addEventListener('pointerdown', checkEvent, true);
        window.addEventListener('pointerup', checkEvent, true);
    }
}

export { Menu };
