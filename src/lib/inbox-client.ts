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

export const buildCobrosFocusUrl = (appointmentId?: number | null) => {
	if (!Number.isInteger(appointmentId) || (appointmentId ?? 0) <= 0) return '/panel/cobros';
	return `/panel/cobros?appointment=${appointmentId}`;
};

export const buildAppointmentFocusUrl = (
	appointmentId: number,
	actionUrl?: string | null,
	ntype?: InboxNtype | string | null
) => {
	if (String(ntype || '').toUpperCase() === 'PAYMENT') {
		return buildCobrosFocusUrl(appointmentId);
	}

	const fallback = '/panel/calendar';
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) return fallback;

	const raw = String(actionUrl || '').trim();
	try {
		const parsed = new URL(raw || fallback, 'https://hasel.app');
		const path = parsed.pathname.startsWith('/panel/calendar') ? parsed.pathname : fallback;
		const params = parsed.pathname.startsWith('/panel/calendar')
			? new URLSearchParams(parsed.search)
			: new URLSearchParams();
		params.set('appointment_id', String(appointmentId));
		const query = params.toString();
		return `${path}${query ? `?${query}` : ''}${parsed.hash}`;
	} catch {
		return `${fallback}?appointment_id=${appointmentId}`;
	}
};
