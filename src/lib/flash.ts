export type FlashMessageType = 'success' | 'error' | 'info' | 'warning';

export type FlashMessageDetail = {
	message: string;
	type?: FlashMessageType;
	autoHideMs?: number;
};

const FLASH_NAV_STASH_KEY = 'bookmate_flash_nav_stash';

const pendingFlashMessages: FlashMessageDetail[] = [];

function normalizeFlashDetail(detail: FlashMessageDetail): FlashMessageDetail | null {
	const message = String(detail.message || '').trim();
	if (!message) return null;

	return {
		message,
		type: detail.type ?? 'success',
		autoHideMs: detail.autoHideMs ?? 5000,
	};
}

/** Guarda el mensaje para mostrarlo tras una navegación con View Transitions. */
export function stashFlashForNavigation(detail: FlashMessageDetail) {
	if (typeof window === 'undefined') return;
	const payload = normalizeFlashDetail(detail);
	if (!payload) return;
	sessionStorage.setItem(FLASH_NAV_STASH_KEY, JSON.stringify(payload));
}

/** Lee y borra el mensaje guardado para la siguiente vista. */
export function consumeStashedFlash(): FlashMessageDetail | null {
	if (typeof window === 'undefined') return null;

	const raw = sessionStorage.getItem(FLASH_NAV_STASH_KEY);
	sessionStorage.removeItem(FLASH_NAV_STASH_KEY);
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as FlashMessageDetail;
		return normalizeFlashDetail(parsed);
	} catch {
		return null;
	}
}

/** Vacía mensajes emitidos antes de que FlashMessage registrara su handler. */
export function drainPendingFlashMessages() {
	if (!window.BookmateFlash?.show) return;

	while (pendingFlashMessages.length > 0) {
		const next = pendingFlashMessages.shift();
		if (next) window.BookmateFlash.show(next);
	}
}

export function showFlashMessage(detail: FlashMessageDetail) {
	if (typeof window === 'undefined') return;

	const payload = normalizeFlashDetail(detail);
	if (!payload) return;

	if (window.BookmateFlash?.show) {
		window.BookmateFlash.show(payload);
		return;
	}

	pendingFlashMessages.push(payload);
	document.dispatchEvent(
		new CustomEvent('bookmate:flash', {
			detail: payload,
		})
	);
}

/** Quita parámetros legacy de la barra de direcciones (enlaces antiguos o marcadores). */
export function stripFlashParamsFromUrl() {
	if (typeof window === 'undefined') return;

	const url = new URL(window.location.href);
	let changed = false;

	if (url.searchParams.has('flash_message')) {
		url.searchParams.delete('flash_message');
		changed = true;
	}
	if (url.searchParams.has('flash_type')) {
		url.searchParams.delete('flash_type');
		changed = true;
	}
	if (!changed) return;

	window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Recarga la vista y muestra el toast al terminar la transición (sin params en URL). */
export async function reloadPageWithFlash(detail: FlashMessageDetail) {
	if (typeof window === 'undefined') return;

	stashFlashForNavigation(detail);

	const { navigate } = await import('astro:transitions/client');
	const url = new URL(window.location.href);
	url.searchParams.delete('flash_message');
	url.searchParams.delete('flash_type');
	await navigate(`${url.pathname}${url.search}${url.hash}`);
}
