export type InboxNtype = 'APPOINTMENT' | 'PAYMENT' | 'HOLIDAY' | 'SYSTEM';
export type InboxActionType = 'OPEN_URL' | 'OPEN_CLOSURE';

export interface InboxClosurePayload {
	name?: string;
	id_holiday?: number;
	start_date?: string;
	end_date?: string;
	is_full_day?: number;
	apply_all?: number;
}

export interface InboxItem {
	id_notification: number;
	ntype: InboxNtype;
	title: string;
	body: string | null;
	action_type: InboxActionType;
	action_url: string | null;
	action_payload: InboxClosurePayload | null;
	appointment_id: number | null;
	holiday_id: number | null;
	campaign_id: number | null;
	read_at: string | null;
	created_at: string | null;
	unread: boolean;
}

export interface InboxListResult {
	items: InboxItem[];
	unreadCount: number;
}

export interface HolidayHint {
	id_holiday: number;
	name: string;
	holiday_date: string;
	days_until: number;
	closure_name: string;
}

export const buildClosurePrefillUrl = (hint: {
	closure_name: string;
	holiday_date: string;
	id_holiday?: number;
	orgMemberId?: number;
}) => {
	const params = new URLSearchParams({
		open_org_closure: '1',
		name: hint.closure_name,
		start: hint.holiday_date,
		end: hint.holiday_date,
		full_day: '1',
		apply_all: '1',
	});
	if (hint.id_holiday && hint.id_holiday > 0) {
		params.set('id_holiday', String(hint.id_holiday));
	}
	if (hint.orgMemberId && hint.orgMemberId > 0) {
		params.set('org_member_id', String(hint.orgMemberId));
	}
	return `/panel/locations?${params.toString()}`;
};

const PANEL_DEEP_LINK_BASE = 'https://hasel.app';

const parsePanelDeepLink = (raw: string) => {
	const trimmed = String(raw || '').trim();
	if (!trimmed) return null;
	try {
		return new URL(trimmed, PANEL_DEEP_LINK_BASE);
	} catch {
		return null;
	}
};

const isCobrosPanelPath = (pathname: string) => pathname.startsWith('/panel/cobros');

const isCalendarPanelPath = (pathname: string) => pathname.startsWith('/panel/calendar');

export const buildCobrosFocusUrl = (
	appointmentId?: number | null,
	actionUrl?: string | null
) => {
	const parsed = parsePanelDeepLink(String(actionUrl || ''));
	const params = parsed && isCobrosPanelPath(parsed.pathname)
		? new URLSearchParams(parsed.search)
		: new URLSearchParams();

	if (Number.isInteger(appointmentId) && (appointmentId ?? 0) > 0) {
		params.set('appointment', String(appointmentId));
	}

	const query = params.toString();
	return `/panel/cobros${query ? `?${query}` : ''}`;
};

export const resolvePanelDeepLink = (
	appointmentId?: number | null,
	actionUrl?: string | null,
	ntype?: InboxNtype | string | null
) => {
	const normalizedType = String(ntype || '').toUpperCase();
	const parsed = parsePanelDeepLink(String(actionUrl || ''));
	const aptId = Number.isInteger(appointmentId) && (appointmentId ?? 0) > 0 ? appointmentId : null;

	if (normalizedType === 'PAYMENT' || (parsed && isCobrosPanelPath(parsed.pathname))) {
		return buildCobrosFocusUrl(aptId, actionUrl);
	}

	const fallback = '/panel/calendar';
	if (!aptId) {
		if (parsed && (isCalendarPanelPath(parsed.pathname) || isCobrosPanelPath(parsed.pathname))) {
			return `${parsed.pathname}${parsed.search}${parsed.hash}`;
		}
		return fallback;
	}

	if (parsed && isCalendarPanelPath(parsed.pathname)) {
		const params = new URLSearchParams(parsed.search);
		params.set('appointment_id', String(aptId));
		const query = params.toString();
		return `${parsed.pathname}${query ? `?${query}` : ''}${parsed.hash}`;
	}

	return `${fallback}?appointment_id=${aptId}`;
};

export const buildAppointmentFocusUrl = (
	appointmentId: number,
	actionUrl?: string | null,
	ntype?: InboxNtype | string | null
) => resolvePanelDeepLink(appointmentId, actionUrl, ntype);
