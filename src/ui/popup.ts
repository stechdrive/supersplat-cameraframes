import { Button, Container, Label, TextInput } from '@playcanvas/pcui';

import { localize } from './localization';
import { Tooltips } from './tooltips';

interface ShowOptions {
    type: 'error' | 'info' | 'yesno' | 'okcancel';
    message: string;
    header?: string;
    link?: string;
    buttons?: Array<{
        label: string;
        action: string;
    }>;
}

class Popup extends Container {
    show: (options: ShowOptions) => void;
    hide: () => void;
    destroy: () => void;

    constructor(tooltips: Tooltips, args = {}) {
        args = {
            id: 'popup',
            hidden: true,
            tabIndex: -1,
            ...args
        };

        super(args);

        const dialog = new Container({
            id: 'popup-dialog'
        });

        const header = new Label({
            id: 'popup-header'
        });

        const text = new Label({
            id: 'popup-text'
        });

        const linkText = new Label({
            id: 'popup-link-text'
        });

        const linkCopy = new Button({
            id: 'popup-link-copy',
            icon: 'E351'
        });

        const linkRow = new Container({
            id: 'popup-link-row'
        });

        linkRow.append(linkText);
        linkRow.append(linkCopy);

        const okButton = new Button({
            class: 'popup-button',
            text: localize('popup.ok')
        });

        const cancelButton = new Button({
            class: 'popup-button',
            text: localize('popup.cancel')
        });

        const yesButton = new Button({
            class: 'popup-button',
            text: localize('popup.yes')
        });

        const noButton = new Button({
            class: 'popup-button',
            text: localize('popup.no')
        });

        const buttons = new Container({
            id: 'popup-buttons'
        });

        buttons.append(okButton);
        buttons.append(cancelButton);
        buttons.append(yesButton);
        buttons.append(noButton);

        dialog.append(header);
        dialog.append(text);
        dialog.append(linkRow);
        dialog.append(buttons);

        this.append(dialog);

        let okFn: () => void;
        let cancelFn: () => void;
        let yesFn: () => void;
        let noFn: () => void;
        let containerFn: () => void;
        let copyFn: () => void;
        let customButtons: Button[] = [];

        const clearCustomButtons = () => {
            customButtons.forEach(button => button.destroy());
            customButtons = [];
        };

        okButton.on('click', () => {
            okFn();
        });

        cancelButton.on('click', () => {
            cancelFn();
        });

        yesButton.on('click', () => {
            yesFn();
        });

        noButton.on('click', () => {
            noFn();
        });

        this.on('click', () => {
            containerFn();
        });

        dialog.on('click', (event) => {
            event.stopPropagation();
        });

        linkCopy.on('click', () => {
            copyFn();
        });

        this.show = (options: ShowOptions) => {
            clearCustomButtons();

            header.text = options.header;
            text.text = options.message;

            const { type, link, buttons: customActions } = options;
            const hasCustomButtons = Array.isArray(customActions) && customActions.length > 0;

            ['error', 'info', 'yesno', 'okcancel'].forEach((t) => {
                text.class[t === type ? 'add' : 'remove'](t);
            });

            // configure based on message type
            okButton.hidden = hasCustomButtons || type === 'yesno';
            cancelButton.hidden = hasCustomButtons || type !== 'okcancel';
            yesButton.hidden = hasCustomButtons || type !== 'yesno';
            noButton.hidden = hasCustomButtons || type !== 'yesno';
            this.hidden = false;

            linkRow.hidden = link === undefined;
            if (link !== undefined) {
                linkText.dom.innerHTML = `<a href='${link}' target='_blank'>${link}</a>`;
                linkCopy.icon = 'E352';
            }

            // take keyboard focus so shortcuts stop working
            this.dom.focus();

            return new Promise<{action: string, value?: string}>((resolve) => {
                customActions?.forEach(({ label, action }) => {
                    const button = new Button({
                        class: 'popup-button',
                        text: label
                    });
                    button.on('click', () => {
                        this.hide();
                        resolve({ action });
                    });
                    buttons.append(button);
                    customButtons.push(button);
                });

                okFn = () => {
                    this.hide();
                    resolve({
                        action: 'ok'
                    });
                };
                cancelFn = () => {
                    this.hide();
                    resolve({ action: 'cancel' });
                };
                yesFn = () => {
                    this.hide();
                    resolve({ action: 'yes' });
                };
                noFn = () => {
                    this.hide();
                    resolve({ action: 'no' });
                };
                containerFn = () => {
                    if (type === 'info' && link === undefined) {
                        cancelFn();
                    }
                };
                copyFn = () => {
                    navigator.clipboard.writeText(link);
                    linkCopy.icon = 'E348';
                };
            });
        };

        this.hide = () => {
            this.hidden = true;
            clearCustomButtons();
        };

        this.destroy = () => {
            this.hide();
            super.destroy();
        };

        tooltips.register(linkCopy, localize('popup.copy-to-clipboard'));
    }
}

export { ShowOptions, Popup };
