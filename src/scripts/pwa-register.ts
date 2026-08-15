import { Workbox } from 'workbox-window';

const PWA_PENDING_UPDATE_KEY = 'hasel-pwa-pending-update';

const isAuthRoute = (pathname = window.location.pathname) =>
	pathname === '/auth' || pathname.startsWith('/auth/');

/**
 * Registro PWA sin virtual:pwa-register (compatible con Astro 7 / Vite 8).
 * Usa los mismos paths que genera @vite-pwa/astro.
 */
export const initHaselPwaRegister = () => {
	if (!('serviceWorker' in navigator)) return;

	const swUrl = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js';
	const wb = new Workbox(swUrl, {
		scope: '/',
		type: import.meta.env.DEV ? 'classic' : 'module',
	});

	let shouldReload = false;

	const applyUpdate = async () => {
		shouldReload = true;
		await wb.messageSkipWaiting();
	};

	wb.addEventListener('controlling', () => {
		if (shouldReload) window.location.reload();
	});

	wb.addEventListener('waiting', () => {
		if (isAuthRoute()) {
			try {
				sessionStorage.setItem(PWA_PENDING_UPDATE_KEY, '1');
			} catch {
				/* ignore */
			}
			return;
		}
		void applyUpdate();
	});

	const flushPendingUpdate = () => {
		if (isAuthRoute()) return;
		try {
			if (sessionStorage.getItem(PWA_PENDING_UPDATE_KEY) !== '1') return;
			sessionStorage.removeItem(PWA_PENDING_UPDATE_KEY);
		} catch {
			return;
		}
		void applyUpdate();
	};

	document.addEventListener('astro:after-swap', flushPendingUpdate);
	document.addEventListener('astro:page-load', flushPendingUpdate);

	void wb.register().catch(() => {
		/* SW no disponible en este entorno */
	});
};
