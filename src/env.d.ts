/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		token?: string;
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
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
