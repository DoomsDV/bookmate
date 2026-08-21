import { Workbox } from 'workbox-window';

const PWA_PENDING_UPDATE_KEY = 'hasel-pwa-pending-update';

const isAuthRoute = (pathname = window.location.pathname) =>
	pathname === '/auth' || pathname.startsWith('/auth/');

/**
 * Registro PWA sin virtual:pwa-register (compatible con Astro 7 / Vite 8).
 * Usa los mismos paths que genera @vite-pwa/astro.
 */
const isJavaScriptResponse = (response: Response) => {
	const type = String(response.headers.get('content-type') || '').toLowerCase();
	return response.ok && (type.includes('javascript') || type.includes('ecmascript'));
};

export const initHaselPwaRegister = () => {
	if (!('serviceWorker' in navigator)) return;
	// En `astro dev` no hay /dev-sw.js salvo devOptions.enabled; el SSR
	// devuelve HTML y Chrome loguea "unsupported MIME type ('text/html')".
	if (import.meta.env.DEV) return;

	const swUrl = '/sw.js';
	// generateSW de Workbox emite un SW clásico con importScripts();
	// type: 'module' rompe en Chrome ("Module scripts don't support importScripts()").
	const wb = new Workbox(swUrl, {
		scope: '/',
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

	void (async () => {
		try {
			const probe = await fetch(swUrl, { method: 'GET', cache: 'no-store' });
			if (!isJavaScriptResponse(probe)) return;
			const registration = await wb.register();
			if (registration && 'update' in registration) {
				void registration.update().catch((error: unknown) => {
					console.warn('[pwa] No se pudo actualizar el service worker.', error);
				});
			}
		} catch (error) {
			console.warn('[pwa] No se pudo registrar el service worker.', error);
		}
	})();
};
