export interface WorkspaceCatalogOption {
	id: number;
	label: string;
	minutes?: number;
	hours?: number;
}

export interface WorkspaceCatalogs {
	slot_intervals: WorkspaceCatalogOption[];
	reminder_hours: WorkspaceCatalogOption[];
	cancel_wait_hours: WorkspaceCatalogOption[];
}

export interface WorkspaceSettingsData {
	id_organization: number;
	name: string;
	profile_slug: string;
	description: string;
	public_whatsapp: string;
	logo_url: string;
	time_format: string;
	theme_pref: string;
	unanswered_alert_action: string;
	rsi_id_slot_interval: number | null;
	rh_id_reminder_hours: number | null;
	cwh_id_cancel_wait_hours: number | null;
	booking_slot_interval_minutes: number;
	reminder_hours_before: number;
	cancel_wait_hours: number | null;
	catalogs?: WorkspaceCatalogs;
}

export interface UpdateWorkspacePayload {
	name?: string;
	profile_slug?: string;
	description?: string;
	public_whatsapp?: string;
	time_format?: string;
	theme_pref?: string;
	unanswered_alert_action?: string;
	rsi_id_slot_interval?: number;
	rh_id_reminder_hours?: number;
	cwh_id_cancel_wait_hours?: number | null;
	panel_theme?: string;
	logo_base64?: string;
	logo_name?: string;
	logo_mime?: string;
}

export interface WorkspaceFieldError {
	field: string;
	message: string;
}

export const getReminderHoursValue = (
	catalogs: WorkspaceCatalogs | undefined,
	id: number | null
) => {
	if (!catalogs || !id) return 0;
	const match = catalogs.reminder_hours.find((item) => item.id === id);
	return match?.hours ?? 0;
};

export const getCancelWaitOptionsForReminder = (
	catalogs: WorkspaceCatalogs | undefined,
	reminderHoursId: number | null
) => {
	if (!catalogs) return [];
	const reminderHours = getReminderHoursValue(catalogs, reminderHoursId);
	if (reminderHours <= 0) return catalogs.cancel_wait_hours;
	return catalogs.cancel_wait_hours.filter(
		(option) => (option.hours ?? 0) > 0 && (option.hours ?? 0) < reminderHours
	);
};
