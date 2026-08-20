import { resolveOrdsApiUrl } from './env-urls';
import type {
	HolidayHint,
	InboxClosurePayload,
	InboxItem,
	InboxListResult,
	InboxNtype,
} from './inbox-client';

export type {
	HolidayHint,
	InboxActionType,
	InboxClosurePayload,
	InboxItem,
	InboxListResult,
	InboxNtype,
} from './inbox-client';
export { buildAppointmentFocusUrl, buildClosurePrefillUrl } from './inbox-client';

export const INBOX_LIST_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_INBOX_URL,
	'ORDS_INBOX_URL',
	'/inbox'
);

export const INBOX_UNREAD_COUNT_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_INBOX_UNREAD_COUNT_URL,
	'ORDS_INBOX_UNREAD_COUNT_URL',
	'/inbox/unread-count'
);

export const INBOX_READ_ALL_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_INBOX_READ_ALL_URL,
	'ORDS_INBOX_READ_ALL_URL',
	'/inbox/read-all'
);

export const INBOX_DISMISS_ALL_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_INBOX_DISMISS_ALL_URL,
	'ORDS_INBOX_DISMISS_ALL_URL',
	'/inbox/dismiss-all'
);

export const INBOX_HOLIDAY_HINT_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_INBOX_HOLIDAY_HINT_URL,
	'ORDS_INBOX_HOLIDAY_HINT_URL',
	'/inbox/holiday-hint'
);

export class InboxApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'InboxApiError';
		this.status = status;
		this.details = details;
	}
}

const parseResponse = async (response: Response, fallbackMessage: string) => {
	let payload: any = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	if (!response.ok || (payload && payload.status && payload.status !== 'success')) {
		const message =
			payload && typeof payload === 'object' ? String(payload.message || '').trim() : '';
		throw new InboxApiError(message || fallbackMessage, response.status || 500, payload);
	}

	return payload || {};
};

const toPositiveInt = (value: unknown, fallback = 0) => {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : fallback;
};

const normalizePayload = (raw: unknown): InboxClosurePayload | null => {
	let value: unknown = raw;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		try {
			value = JSON.parse(trimmed);
		} catch {
			return null;
		}
	}
	if (!value || typeof value !== 'object') return null;
	const obj = value as Record<string, unknown>;
	const holidayId = toPositiveInt(obj.id_holiday, 0);
	return {
		name: String(obj.name || '').trim() || undefined,
		id_holiday: holidayId || undefined,
		start_date: String(obj.start_date || '').trim() || undefined,
		end_date: String(obj.end_date || '').trim() || undefined,
		is_full_day: Number(obj.is_full_day) === 0 ? 0 : 1,
		apply_all: Number(obj.apply_all) === 0 ? 0 : 1,
	};
};

const normalizeItem = (raw: any): InboxItem | null => {
	const id = toPositiveInt(raw?.id_notification, 0);
	if (!id) return null;
	const ntypeRaw = String(raw?.ntype || 'SYSTEM').toUpperCase();
	const ntype: InboxNtype =
		ntypeRaw === 'APPOINTMENT' || ntypeRaw === 'PAYMENT' || ntypeRaw === 'HOLIDAY'
			? ntypeRaw
			: 'SYSTEM';
	const actionRaw = String(raw?.action_type || 'OPEN_URL').toUpperCase();
	return {
		id_notification: id,
		ntype,
		title: String(raw?.title || '').trim() || 'Notificación',
		body: String(raw?.body || '').trim() || null,
		action_type: actionRaw === 'OPEN_CLOSURE' ? 'OPEN_CLOSURE' : 'OPEN_URL',
		action_url: String(raw?.action_url || '').trim() || null,
		action_payload: normalizePayload(raw?.action_payload),
		appointment_id: toPositiveInt(raw?.appointment_id, 0) || null,
		holiday_id: toPositiveInt(raw?.holiday_id, 0) || null,
		campaign_id: toPositiveInt(raw?.campaign_id, 0) || null,
		read_at: String(raw?.read_at || '').trim() || null,
		created_at: String(raw?.created_at || '').trim() || null,
		unread: Number(raw?.unread) === 1 || !raw?.read_at,
	};
};

const authHeaders = (token: string): HeadersInit => ({
	Accept: 'application/json',
	Authorization: `Bearer ${token}`,
});

export const listInboxWithOrds = async (
	token: string,
	limit = 50
): Promise<InboxListResult> => {
	const url = new URL(INBOX_LIST_URL);
	url.searchParams.set('limit', String(limit));
	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: authHeaders(token),
	});
	const payload = await parseResponse(response, 'No fue posible cargar las notificaciones.');
	const rawItems = Array.isArray(payload.data) ? payload.data : [];
	return {
		items: rawItems.map(normalizeItem).filter(Boolean) as InboxItem[],
		unreadCount: toPositiveInt(payload.unread_count, 0),
	};
};

export const getInboxUnreadCountWithOrds = async (token: string): Promise<number> => {
	const response = await fetch(INBOX_UNREAD_COUNT_URL, {
		method: 'GET',
		headers: authHeaders(token),
	});
	const payload = await parseResponse(response, 'No fue posible consultar notificaciones.');
	return toPositiveInt(payload?.data?.unread_count, 0);
};

export const markInboxReadWithOrds = async (token: string, notificationId: number) => {
	const response = await fetch(`${INBOX_LIST_URL}/${notificationId}/read`, {
		method: 'POST',
		headers: {
			...authHeaders(token),
			'Content-Type': 'application/json',
		},
		body: '{}',
	});
	await parseResponse(response, 'No fue posible marcar la notificación.');
};

export const markAllInboxReadWithOrds = async (token: string) => {
	const response = await fetch(INBOX_READ_ALL_URL, {
		method: 'POST',
		headers: {
			...authHeaders(token),
			'Content-Type': 'application/json',
		},
		body: '{}',
	});
	await parseResponse(response, 'No fue posible marcar las notificaciones.');
};

export const dismissInboxWithOrds = async (token: string, notificationId: number) => {
	const response = await fetch(`${INBOX_LIST_URL}/${notificationId}/dismiss`, {
		method: 'POST',
		headers: {
			...authHeaders(token),
			'Content-Type': 'application/json',
		},
		body: '{}',
	});
	await parseResponse(response, 'No fue posible eliminar la notificación.');
};

export const dismissAllInboxWithOrds = async (token: string) => {
	const response = await fetch(INBOX_DISMISS_ALL_URL, {
		method: 'POST',
		headers: {
			...authHeaders(token),
			'Content-Type': 'application/json',
		},
		body: '{}',
	});
	await parseResponse(response, 'No fue posible eliminar las notificaciones.');
};

export const getHolidayHintWithOrds = async (token: string): Promise<HolidayHint | null> => {
	const response = await fetch(INBOX_HOLIDAY_HINT_URL, {
		method: 'GET',
		headers: authHeaders(token),
	});
	const payload = await parseResponse(response, 'No fue posible consultar el feriado.');
	const data = payload.data;
	if (!data || typeof data !== 'object') return null;
	const id = toPositiveInt(data.id_holiday, 0);
	const name = String(data.name || '').trim();
	const holidayDate = String(data.holiday_date || '').trim();
	if (!id || !name || !holidayDate) return null;
	return {
		id_holiday: id,
		name,
		holiday_date: holidayDate,
		days_until: Math.max(0, Number(data.days_until) || 0),
		closure_name: String(data.closure_name || name).trim(),
	};
};

