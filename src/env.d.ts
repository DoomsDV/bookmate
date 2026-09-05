/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url' {
	const workerUrl: string;
	export default workerUrl;
}

declare namespace App {
    interface Locals {
        token?: string;
        roleId?: number;
        userId?: number;
        organizationName?: string;
        organizationLogoUrl?: string;
    }
}

interface BookmateAlertOptions {
    type?: 'info' | 'success' | 'warning' | 'error';
    title?: string;
    message?: string;
    /** HTML controlado por la app (no input de usuario). */
    messageHtml?: string;
    /** Material Symbol name override. */
    icon?: string;
    confirmText?: string;
    cancelText?: string;
}

interface BookmateFlashDetail {
    message: string;
    type?: 'success' | 'error' | 'info' | 'warning';
    autoHideMs?: number;
}

interface Window {
    BookmateAlert?: {
        alert: (options?: BookmateAlertOptions) => Promise<boolean>;
        confirm: (options?: BookmateAlertOptions) => Promise<boolean>;
    };
    BookmateFlash?: {
        show: (detail: BookmateFlashDetail) => void;
    };
    HaselSubscription?: {
        features: string[];
        addonFeatures: string[];
        eligibleAddonFeatures: string[];
        hasFeature: (code: string) => boolean;
        hasAddon: (code: string) => boolean;
        [key: string]: unknown;
    };
}

interface ImportMetaEnv {
    readonly ORDS_API_BASE_URL?: string;
    readonly ORDS_PUBLIC_API_BASE_URL?: string;
    readonly ORDS_AI_BASE_URL?: string;
    readonly ORDS_PUBLIC_USER_PROFILE_URL?: string;
    readonly ORDS_PUBLIC_BOOKING_URL?: string;
    readonly PUBLIC_VALIDATE_CUSTOMER_URL?: string;
    readonly ORDS_PUBLIC_RESERVATION_URL?: string;
    readonly ORDS_PUBLIC_LOCATION_URL?: string;

    readonly ORDS_AUTH_LOGIN_URL?: string;
    readonly ORDS_AUTH_REFRESH_URL?: string;
    readonly ORDS_AUTH_LOGOUT_URL?: string;
    readonly ORDS_AUTH_CHANGE_PASSWORD_URL?: string;
    readonly ORDS_AUTH_REGISTER_URL?: string;
    readonly ORDS_FORGOT_PASSWORD_URL?: string;
    readonly ORDS_RESET_PASSWORD_URL?: string;
    readonly ORDS_VERIFY_EMAIL_URL?: string;
    readonly ORDS_RESEND_VERIFICATION_CODE_URL?: string;

    readonly ORDS_DASHBOARD_URL?: string;
    readonly AI_SUMMARIZATION_URL?: string;
    readonly ORDS_AI_VOICE_APPOINTMENT_DRAFT?: string;
    readonly ORDS_AI_SEND_CHAT?: string;
    readonly ORDS_AI_GET_CHAT_SESSION?: string;
    readonly ORDS_AI_GET_CHAT_MESSAGES?: string;
    readonly ORDS_AI_DELETE_CHAT_SESSION?: string;
    readonly ORDS_AI_ATC_ASK?: string;
    readonly ORDS_PROFILE_ME_URL?: string;
    readonly ORDS_PROFILE_PUBLIC_SLUG_SUGGEST_URL?: string;
    readonly ORDS_WORKSPACE_URL?: string;
    readonly ORDS_DEPARTMENTS_URL?: string;
    readonly ORDS_ROLES_URL?: string;
    readonly ORDS_SPECIALTIES_URL?: string;
    readonly ORDS_ORG_SPECIALTIES_URL?: string;
    readonly ORDS_SERVICES_URL?: string;
    readonly ORDS_SERVICES_LOV_URL?: string;
    readonly ORDS_LOCATIONS_URL?: string;
    readonly ORDS_PROFESSIONALS_URL?: string;
    readonly ORDS_PROFESSIONALS_SLUG_SUGGEST_URL?: string;
    readonly ORDS_APPOINTMENTS_URL?: string;
    readonly ORDS_APPOINTMENTS_CALENDAR_URL?: string;
    readonly ORDS_CUSTOMERS_URL?: string;
    readonly ORDS_COBROS_URL?: string;
    readonly ORDS_COBROS_PENDING_COUNT_URL?: string;
    readonly ORDS_INBOX_URL?: string;
    readonly ORDS_INBOX_UNREAD_COUNT_URL?: string;
    readonly ORDS_INBOX_READ_ALL_URL?: string;
    readonly ORDS_INBOX_HOLIDAY_HINT_URL?: string;
    readonly ORDS_DAYS_URL?: string;
    readonly ORDS_PROFESSIONALS_LOV_URL?: string;
    readonly ORDS_LOCATIONS_LOV_URL?: string;
    readonly ORDS_INTEGRATIONS_URL?: string;
    readonly FCM_SUSCRIBE_URL?: string;
    readonly FCM_UNSUSCRIBE_URL?: string;
    readonly GOOGLE_CLIENT_ID?: string;
    readonly GOOGLE_CLIENT_SECRET?: string;
    readonly GOOGLE_REDIRECT_URI?: string;

    readonly ESIGN_API_BASE_URL?: string;
    readonly ESIGN_API_KEY?: string;
    readonly ESIGN_CALLBACK_SERVICE_TOKEN?: string;
    readonly CRON_SECRET?: string;

    readonly PUBLIC_BOOKMATE_PUBLIC_DOMAIN?: string;
    readonly PUBLIC_SUBSCRIPTION_BILLING_UI?: string;
    readonly PUBLIC_BOOKMATE_PROFILE_PLACEHOLDER_IMAGE_URL?: string;
    readonly PUBLIC_G_MAPS_API_KEY?: string;
    readonly PUBLIC_G_MAPS_API_KEYS?: string;
    readonly PUBLIC_STADIA_MAPS_KEY?: string;
    readonly PUBLIC_ODONTOGRAM_GLB_URL?: string;
    readonly PUBLIC_FIREBASE_API_KEY?: string;
    readonly PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
    readonly PUBLIC_FIREBASE_PROJECT_ID?: string;
    readonly PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
    readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
    readonly PUBLIC_FIREBASE_APP_ID?: string;
    readonly PUBLIC_FIREBASE_MEASUREMENT_ID?: string;
    readonly PUBLIC_FIREBASE_VAPID_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
