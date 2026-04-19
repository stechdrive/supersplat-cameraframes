import { Button, Container, Element, Label } from '@playcanvas/pcui';

import { localize } from './localization';

class WelcomeBoard extends Container {
    show: () => void;
    hide: () => void;

    constructor(args = {}) {
        args = {
            id: 'welcome-board',
            hidden: true,
            ...args
        };

        super(args);

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const dialog = new Container({
            id: 'welcome-board-dialog'
        });

        const copy = new Container({
            id: 'welcome-board-copy'
        });

        const linePrimary = new Label({
            class: 'welcome-board-line'
        });

        const lineSecondary = new Label({
            class: 'welcome-board-line'
        });

        const link = new Element({
            dom: 'a',
            id: 'welcome-board-link'
        });

        const actions = new Container({
            id: 'welcome-board-actions'
        });

        const closeButton = new Button({
            class: 'welcome-board-button',
            text: localize('welcomeBoard.dismiss')
        });

        copy.append(linePrimary);
        copy.append(lineSecondary);
        dialog.append(copy);
        dialog.append(link);
        actions.append(closeButton);
        dialog.append(actions);
        this.append(dialog);

        dialog.on('click', (event) => {
            event.stopPropagation();
        });

        closeButton.on('click', () => {
            this.hide();
        });

        link.dom.addEventListener('click', () => {
            this.hide();
        });

        this.show = () => {
            linePrimary.text = localize('welcomeBoard.message.primary');
            lineSecondary.text = localize('welcomeBoard.message.secondary');
            closeButton.text = localize('welcomeBoard.dismiss');

            const anchor = link.dom as HTMLAnchorElement;
            anchor.href = localize('welcomeBoard.link');
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.textContent = localize('welcomeBoard.link');

            this.hidden = false;
        };

        this.hide = () => {
            this.hidden = true;
        };
    }
}

export { WelcomeBoard };
