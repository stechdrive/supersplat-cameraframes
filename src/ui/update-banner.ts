import { Button, Container, Label } from '@playcanvas/pcui';

import { localize } from './localization';

type UpdateBannerOptions = {
    message?: string;
    onReload?: () => void;
    onDismiss?: () => void;
};

class UpdateBanner extends Container {
    show: (options?: UpdateBannerOptions) => void;
    hide: () => void;

    constructor(args = {}) {
        args = {
            ...args,
            id: 'update-banner',
            hidden: true
        };

        super(args);

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const content = new Container({
            id: 'update-banner-content'
        });

        const message = new Label({
            id: 'update-banner-message',
            text: localize('updateBanner.message')
        });

        const actions = new Container({
            id: 'update-banner-actions'
        });

        const reloadButton = new Button({
            class: ['update-banner-button', 'update-banner-reload'],
            text: localize('updateBanner.reload')
        });

        const dismissButton = new Button({
            class: ['update-banner-button', 'update-banner-dismiss'],
            text: localize('updateBanner.dismiss')
        });

        actions.append(reloadButton);
        actions.append(dismissButton);

        content.append(message);
        content.append(actions);
        this.append(content);

        let reloadFn = () => {};
        let dismissFn = () => {};

        reloadButton.on('click', () => {
            reloadFn();
        });

        dismissButton.on('click', () => {
            dismissFn();
        });

        this.show = (options?: UpdateBannerOptions) => {
            message.text = options?.message ?? localize('updateBanner.message');
            reloadButton.text = localize('updateBanner.reload');
            dismissButton.text = localize('updateBanner.dismiss');
            reloadFn = options?.onReload ?? (() => {});
            dismissFn = options?.onDismiss ?? (() => {});
            this.hidden = false;
        };

        this.hide = () => {
            this.hidden = true;
        };
    }
}

export { UpdateBanner };
export type { UpdateBannerOptions };
