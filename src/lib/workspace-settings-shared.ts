import type { BusinessHours } from './business-hours';

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
	org_specialties: WorkspaceCatalogOption[];
}

export interface WorkspaceGalleryImage {
	id: number;
	url: string;
	filename?: string;
	mime_type?: string;
	sort_order: number;
}

export interface WorkspaceSettingsData {
	id_organization: number;
	name: string;
	id_org_specialty: number | null;
	id_org_specialties: number[];
	profile_slug: string;
	description: string;
	public_whatsapp: string;
	logo_url: string;
	banner_url: string;
	facebook_url: string;
	instagram_url: string;
	/** Horario comercial informativo (perfil); no afecta reservas. */
	business_hours: BusinessHours | null;
	gallery_images: WorkspaceGalleryImage[];
	time_format: string;
	theme_pref: string;
	hidden_public_price_label: string;
	unanswered_alert_action: string;
	rsi_id_slot_interval: number | null;
	rh_id_reminder_hours: number | null;
	cwh_id_cancel_wait_hours: number | null;
	booking_slot_interval_minutes: number;
	reminder_hours_before: number;
	cancel_wait_hours: number | null;
	/** Preferencia personal del admin: Y/N */
	notify_all_professionals: string;
	catalogs?: WorkspaceCatalogs;
}

export interface UpdateWorkspacePayload {
	name?: string;
	id_org_specialty?: number;
	id_org_specialties?: number[];
	profile_slug?: string;
	description?: string;
	public_whatsapp?: string;
	facebook_url?: string;
	instagram_url?: string;
	business_hours?: BusinessHours | string | null;
	time_format?: string;
	theme_pref?: string;
	hidden_public_price_label?: string;
	unanswered_alert_action?: string;
	rsi_id_slot_interval?: number;
	rh_id_reminder_hours?: number;
	cwh_id_cancel_wait_hours?: number | null;
	notify_all_professionals?: 'Y' | 'N';
	panel_theme?: string;
	logo_base64?: string;
	logo_name?: string;
	logo_mime?: string;
	banner_base64?: string;
	banner_name?: string;
	banner_mime?: string;
	clear_banner?: 0 | 1 | boolean;
	clear_logo?: 0 | 1 | boolean;
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
