/**
 * Single-flight + TTL corto para /api/cobros/pending-count.
 * SideNav (badges) y dashboard (alerta) comparten la misma promesa para no martillar ORDS.
 */

const CACHE_TTL_MS = 30_000;
const GLOBAL_KEY = '__haselCobrosPendingBadge';

type PendingState = {
	inflight: Promise<number | null> | null;
	cachedCount: number | null;
	cachedAt: number;
	listenersBound: boolean;
};

declare global {
	interface Window {
		[GLOBAL_KEY]?: PendingState;
	}
}

const getState = (): PendingState => {
	if (!window[GLOBAL_KEY]) {
		window[GLOBAL_KEY] = {
			inflight: null,
			cachedCount: null,
			cachedAt: 0,
			listenersBound: false,
		};
	}
	return window[GLOBAL_KEY]!;
};

const applyNavBadges = (count: number) => {
	const badges = document.querySelectorAll<HTMLElement>('[data-cobros-nav-badge]');
	badges.forEach((el) => {
		if (count > 0) {
			el.textContent = count > 99 ? '99+' : String(count);
			el.classList.remove('hidden');
			el.classList.add('inline-flex');
		} else {
			el.textContent = '';
			el.classList.add('hidden');
			el.classList.remove('inline-flex');
		}
	});
};

const hideNavBadges = () => {
	document.querySelectorAll<HTMLElement>('[data-cobros-nav-badge]').forEach((el) => {
		el.classList.add('hidden');
		el.classList.remove('inline-flex');
		el.textContent = '';
	});
};

export const fetchCobrosPendingCount = async (options?: {
	force?: boolean;
}): Promise<number | null> => {
	const hasFeature = window.HaselSubscription?.hasFeature?.('DEPOSIT_COLLECTION');
	if (hasFeature === false) {
		hideNavBadges();
		return null;
	}

	const state = getState();
	const now = Date.now();
	if (
		!options?.force &&
		state.cachedCount !== null &&
		now - state.cachedAt < CACHE_TTL_MS
	) {
		return state.cachedCount;
	}

	if (state.inflight) {
		return state.inflight;
	}

	state.inflight = (async () => {
		try {
			const response = await fetch('/api/cobros/pending-count', {
				headers: { Accept: 'application/json' },
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload?.status !== 'success') {
				return null;
			}
			const count = Number(payload?.data?.pending_count || 0);
			const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
			state.cachedCount = safe;
			state.cachedAt = Date.now();
			return safe;
		} catch {
			return null;
		} finally {
			state.inflight = null;
		}
	})();

	return state.inflight;
};

export const refreshCobrosNavBadges = async (options?: { force?: boolean }) => {
	const badges = document.querySelectorAll<HTMLElement>('[data-cobros-nav-badge]');
	if (!badges.length) return;

	const hasFeature = window.HaselSubscription?.hasFeature?.('DEPOSIT_COLLECTION');
	if (hasFeature === false) {
		hideNavBadges();
		return;
	}

	const count = await fetchCobrosPendingCount(options);
	if (count === null) return;
	applyNavBadges(count);
};

export const initCobrosPendingBadge = () => {
	const state = getState();
	if (!state.listenersBound) {
		state.listenersBound = true;
		document.addEventListener('hasel:subscription', () => {
			const hasFeature = window.HaselSubscription?.hasFeature?.('DEPOSIT_COLLECTION');
			if (hasFeature === false) {
				hideNavBadges();
				state.cachedCount = 0;
				state.cachedAt = Date.now();
				return;
			}
			// Soft refresh: reutiliza cache/inflight de la carga inicial.
			void refreshCobrosNavBadges();
		});
		document.addEventListener('hasel:cobros-changed', () => {
			void refreshCobrosNavBadges({ force: true });
		});
		document.addEventListener('astro:page-load', () => {
			void refreshCobrosNavBadges();
		});
	}

	// Si la suscripción aún no llegó, esperar el evento (evita fetch + force duplicado).
	if (window.HaselSubscription) {
		void refreshCobrosNavBadges();
	}
};
