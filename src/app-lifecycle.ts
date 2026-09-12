import type { Events } from './events';
import { UpdateBanner } from './ui/update-banner';
import { WelcomeBoard } from './ui/welcome-board';

export const registerAppLifecycle = (events: Events) => {
    const welcome = new WelcomeBoard();
    const banner = new UpdateBanner();
    document.getElementById('top-container').appendChild(welcome.dom);
    document.getElementById('app-container').appendChild(banner.dom);
    events.function('welcomeBoard.show', () => welcome.show());
    events.function('welcomeBoard.hide', () => welcome.hide());
    events.function('updateBanner.show', options => banner.show(options));
    events.function('updateBanner.hide', () => banner.hide());
    if (!('serviceWorker' in navigator)) return;
    const attached = new WeakSet<ServiceWorkerRegistration>();
    let active: ServiceWorkerRegistration | null = null;
    let notified = false;
    const notify = () => {
        if (notified) return;
        notified = true;
        banner.show({
            onDismiss: () => banner.hide(),
            onReload: async () => {
                const state = events.invoke('doc.status');
                if ((state.dirty || state.packageDirty) && !await events.invoke('doc.confirmTransition')) return;
                active?.waiting?.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
            }
        });
    };
    const attach = (registration: ServiceWorkerRegistration) => {
        if (!registration || attached.has(registration)) return;
        attached.add(registration);
        active = registration;
        if (registration.waiting && navigator.serviceWorker.controller) notify();
        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            installing?.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) notify();
            });
        });
    };
    navigator.serviceWorker.ready.then(attach).catch(console.error);
    navigator.serviceWorker.getRegistration().then(attach).catch(console.error);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') active?.update().catch(console.error);
    });
};
