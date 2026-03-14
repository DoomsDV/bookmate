/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		token?: string;
		roleId?: number;
		userId?: number;
		organizationName?: string;
	}
}

interface BookmateAlertOptions {
	type?: 'info' | 'success' | 'warning' | 'error';
	title?: string;
	message?: string;
	confirmText?: string;
	cancelText?: string;
}

interface Window {
	BookmateAlert?: {
		alert: (options?: BookmateAlertOptions) => Promise<boolean>;
		confirm: (options?: BookmateAlertOptions) => Promise<boolean>;
	};
}

interface ImportMetaEnv {
	readonly PUBLIC_BOOKMATE_PUBLIC_DOMAIN?: string;
	readonly PUBLIC_BOOKMATE_DEFAULT_LOCATION_ID?: string;
	readonly ORDS_PUBLIC_BOOKING_URL?: string;
	readonly ORDS_DASHBOARD_URL?: string;
	readonly ORDS_AUTH_CHANGE_PASSWORD_URL?: string;
	readonly ORDS_PROFILE_ME_URL?: string;
	readonly ORDS_WORKSPACE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
