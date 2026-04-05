/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/client" />

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
    readonly ORDS_API_BASE_URL?: string;
    readonly ORDS_PUBLIC_API_BASE_URL?: string;
    readonly ORDS_PUBLIC_BOOKING_URL?: string;

    readonly ORDS_AUTH_LOGIN_URL?: string;
    readonly ORDS_AUTH_REFRESH_URL?: string;
    readonly ORDS_AUTH_LOGOUT_URL?: string;
    readonly ORDS_AUTH_CHANGE_PASSWORD_URL?: string;

    readonly ORDS_DASHBOARD_URL?: string;
    readonly ORDS_PROFILE_ME_URL?: string;
    readonly ORDS_WORKSPACE_URL?: string;
    readonly ORDS_ORGANIZATION_CURRENT_URL?: string;
    readonly ORDS_DEPARTMENTS_URL?: string;
    readonly ORDS_ROLES_URL?: string;
    readonly ORDS_SPECIALTIES_URL?: string;
    readonly ORDS_SERVICES_URL?: string;
    readonly ORDS_SERVICES_LOV_URL?: string;
    readonly ORDS_LOCATIONS_URL?: string;
    readonly ORDS_PROFESSIONALS_URL?: string;
    readonly ORDS_PROFESSIONALS_SLUG_SUGGEST_URL?: string;
    readonly ORDS_APPOINTMENTS_URL?: string;
    readonly ORDS_APPOINTMENTS_CALENDAR_URL?: string;
    readonly ORDS_DAYS_URL?: string;
    readonly ORDS_PROFESSIONALS_LOV_URL?: string;
    readonly ORDS_LOCATIONS_LOV_URL?: string;

    readonly PUBLIC_BOOKMATE_PUBLIC_DOMAIN?: string;
    readonly PUBLIC_BOOKMATE_DEFAULT_LOCATION_ID?: string;
    readonly PUBLIC_BOOKMATE_PROFILE_PLACEHOLDER_IMAGE_URL?: string;
    readonly PUBLIC_G_MAPS_API_KEY?: string;
    readonly PUBLIC_G_MAPS_API_KEYS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}