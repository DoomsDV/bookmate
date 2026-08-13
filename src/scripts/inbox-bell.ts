import { buildClosurePrefillUrl, type InboxItem, type InboxNtype } from '../lib/inbox-client';
import { subscribeInboxForegroundMessages } from './firebase-messaging';

const POLL_MS = 30_000;
const GLOBAL_KEY = '__haselInboxBell';

type InboxState = {
	items: InboxItem[];
	unreadCount: number;
	inflight: Promise<void> | null;
	cachedAt: number;
	listenersBound: boolean;
	pollTimer: number | null;
};

declare global {
	interface Window {
		[GLOBAL_KEY]?: InboxState;
	}
}

const getState = (): InboxState => {
	if (!window[GLOBAL_KEY]) {
		window[GLOBAL_KEY] = {
			items: [],
			unreadCount: 0,
			inflight: null,
			cachedAt: 0,
			listenersBound: false,
			pollTimer: null,
		};
	}
	return window[GLOBAL_KEY]!;
};

const iconForType = (ntype: InboxNtype) => {
	if (ntype === 'APPOINTMENT') return 'event';
	if (ntype === 'PAYMENT') return 'payments';
	if (ntype === 'HOLIDAY') return 'celebration';
	return 'campaign';
};

const escapeHtml = (value: string) =>
	String(value).replace(/[&<>"']/g, (ch) => {
		switch (ch) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			default:
				return '&#39;';
		}
	});

const formatRelative = (iso: string | null) => {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return '';
	const sec = Math.round((Date.now() - then) / 1000);
	if (sec < 45) return 'ahora';
	if (sec < 3600) return `hace ${Math.max(1, Math.floor(sec / 60))} min`;
	if (sec < 86400) return `hace ${Math.max(1, Math.floor(sec / 3600))} h`;
	if (sec < 172800) return 'ayer';
	return new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: 'short' }).format(new Date(iso));
};

const applyBadge = (count: number) => {
	const unread = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
	document.querySelectorAll<HTMLElement>('[data-inbox-badge]').forEach((el) => {
		if (unread > 0) {
			el.textContent = unread > 99 ? '99+' : String(unread);
			el.hidden = false;
			el.setAttribute('aria-hidden', 'false');
		} else {
			el.textContent = '';
			el.hidden = true;
			el.setAttribute('aria-hidden', 'true');
		}
	});
	document.querySelectorAll<HTMLElement>('[data-inbox-trigger]').forEach((el) => {
		el.setAttribute(
			'aria-label',
			unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'
		);
	});
};

const renderList = (state: InboxState) => {
	document.querySelectorAll<HTMLElement>('[data-inbox-list]').forEach((list) => {
		const empty = list.parentElement?.querySelector<HTMLElement>('[data-inbox-empty]');
		if (state.items.length === 0) {
			list.innerHTML = '';
			empty?.removeAttribute('hidden');
			return;
		}
		empty?.setAttribute('hidden', '');
		list.innerHTML = state.items
			.map((item) => {
				const unreadClass = item.unread ? ' is-unread' : '';
				return `<button type="button" class="inbox-item${unreadClass}" data-inbox-item="${item.id_notification}">
					<span class="inbox-item__icon material-symbols-rounded" aria-hidden="true">${iconForType(item.ntype)}</span>
					<span class="inbox-item__body">
						<span class="inbox-item__title">${escapeHtml(item.title)}</span>
						${item.body ? `<span class="inbox-item__text">${escapeHtml(item.body)}</span>` : ''}
						<span class="inbox-item__time">${escapeHtml(formatRelative(item.created_at))}</span>
					</span>
					${item.unread ? '<span class="inbox-item__dot" aria-hidden="true"></span>' : ''}
				</button>`;
			})
			.join('');
	});

	document.querySelectorAll<HTMLButtonElement>('[data-inbox-mark-all]').forEach((btn) => {
		btn.hidden = state.unreadCount === 0;
	});
};

const toAppPath = (raw: string | null) => {
	if (!raw) return '/panel/calendar';
	const trimmed = raw.trim();
	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
	try {
		const parsed = new URL(trimmed, window.location.origin);
		return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/panel/calendar';
	} catch {
		return '/panel/calendar';
	}
};

const openItem = (item: InboxItem) => {
	if (item.action_type === 'OPEN_CLOSURE') {
		const payload = item.action_payload || {};
		const holidayDate = payload.start_date || payload.end_date || '';
		if (window.location.pathname.startsWith('/panel/locations')) {
			document.dispatchEvent(
				new CustomEvent('hasel:open-org-closure', {
					detail: {
						name: payload.name || '',
						startDate: payload.start_date || holidayDate,
						endDate: payload.end_date || holidayDate,
						fullDay: payload.is_full_day !== 0,
						applyAll: payload.apply_all !== 0,
					},
				})
			);
			return;
		}
		window.location.assign(
			buildClosurePrefillUrl({
				closure_name: payload.name || 'Feriado nacional',
				holiday_date: holidayDate,
			})
		);
		return;
	}

	const path = toAppPath(item.action_url);
	if (path === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
	window.location.assign(path);
};

const fetchInbox = async (options?: { force?: boolean }) => {
	const state = getState();
	const now = Date.now();
	if (!options?.force && state.cachedAt && now - state.cachedAt < 8_000 && state.inflight) {
		return state.inflight;
	}
	if (!options?.force && state.cachedAt && now - state.cachedAt < 8_000) {
		applyBadge(state.unreadCount);
		renderList(state);
		return;
	}
	if (state.inflight) return state.inflight;

	state.inflight = (async () => {
		try {
			const response = await fetch('/api/inbox?limit=50', { headers: { Accept: 'application/json' } });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload?.status !== 'success') return;
			const items = Array.isArray(payload.data) ? (payload.data as InboxItem[]) : [];
			state.items = items.map((item) => ({
				...item,
				unread: Boolean(item.unread) || !item.read_at,
			}));
			state.unreadCount = Number(payload.unread_count || 0) || 0;
			state.cachedAt = Date.now();
			applyBadge(state.unreadCount);
			renderList(state);
		} catch {
			/* ignore */
		} finally {
			state.inflight = null;
		}
	})();

	return state.inflight;
};

const markRead = async (id: number) => {
	const state = getState();
	const item = state.items.find((row) => row.id_notification === id);
	if (item?.unread) {
		item.unread = false;
		item.read_at = new Date().toISOString();
		state.unreadCount = Math.max(0, state.unreadCount - 1);
		applyBadge(state.unreadCount);
		renderList(state);
	}
	try {
		await fetch(`/api/inbox/${id}/read`, { method: 'POST', headers: { Accept: 'application/json' } });
	} catch {
		/* ignore */
	}
};

const markAllRead = async () => {
	const state = getState();
	state.items = state.items.map((item) => ({ ...item, unread: false, read_at: item.read_at || new Date().toISOString() }));
	state.unreadCount = 0;
	applyBadge(0);
	renderList(state);
	try {
		await fetch('/api/inbox/read-all', { method: 'POST', headers: { Accept: 'application/json' } });
	} catch {
		/* ignore */
	}
};

const closeInboxMenus = () => {
	document.querySelectorAll<HTMLDetailsElement>('[data-inbox-menu]').forEach((menu) => {
		menu.removeAttribute('open');
	});
};

const startPolling = () => {
	const state = getState();
	if (state.pollTimer !== null) return;
	state.pollTimer = window.setInterval(() => {
		if (document.visibilityState !== 'visible') return;
		void fetchInbox({ force: true });
	}, POLL_MS);
};

export const initInboxBell = () => {
	const state = getState();
	void fetchInbox();
	void subscribeInboxForegroundMessages();
	startPolling();

	if (state.listenersBound) return;
	state.listenersBound = true;

	document.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) return;

		const markAll = target.closest<HTMLButtonElement>('[data-inbox-mark-all]');
		if (markAll) {
			event.preventDefault();
			void markAllRead();
			return;
		}

		const itemBtn = target.closest<HTMLButtonElement>('[data-inbox-item]');
		if (itemBtn) {
			event.preventDefault();
			const id = Number(itemBtn.getAttribute('data-inbox-item') || 0);
			const item = getState().items.find((row) => row.id_notification === id);
			if (!item) return;
			void markRead(id).then(() => openItem(item));
			closeInboxMenus();
			return;
		}

		document.querySelectorAll<HTMLDetailsElement>('[data-inbox-menu]').forEach((menu) => {
			if (!menu.contains(target)) menu.removeAttribute('open');
		});
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') closeInboxMenus();
	});

	document.addEventListener('hasel:inbox-changed', () => {
		void fetchInbox({ force: true });
	});

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void fetchInbox({ force: true });
	});

	document.addEventListener('astro:page-load', () => {
		void fetchInbox();
	});
};
