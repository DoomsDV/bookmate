export type InboxNtype = 'APPOINTMENT' | 'PAYMENT' | 'HOLIDAY' | 'SYSTEM';
export type InboxActionType = 'OPEN_URL' | 'OPEN_CLOSURE';

export interface InboxClosurePayload {
	name?: string;
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
	if (hint.orgMemberId && hint.orgMemberId > 0) {
		params.set('org_member_id', String(hint.orgMemberId));
	}
	return `/panel/locations?${params.toString()}`;
};
