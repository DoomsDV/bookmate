/**
 * Flags para habilitar funcionalidades en desarrollo.
 * Activar en `true` cuando estén listas para producción.
 */
export const FEATURE_FLAGS = {
	/** Panel servicios → seña / depósito (requiere Ajustes → Pagos habilitado en backend). */
	SERVICE_DEPOSIT_OPTIONS: true,
	/** Cita rápida por voz (Whisper + precarga del formulario). */
	APPOINTMENT_AI_VOICE: true,
	/** Ajustes → pestaña Pagos (SIPAP + políticas de seña). */
	PAYMENTS_SETTINGS: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

const PRODUCTION_BILLING_HOSTS = new Set(['hasel.app', 'www.hasel.app']);

function publicAppHost() {
	const raw = String(import.meta.env.PUBLIC_BOOKMATE_PUBLIC_DOMAIN ?? '').trim().toLowerCase();
	if (!raw) return '';
	try {
		return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
	} catch {
		return raw.replace(/^https?:\/\//, '').split('/')[0] ?? '';
	}
}

/**
 * UI de plan / facturación de suscripción Hasel (Pagopar plataforma).
 * Apagada en producción hasta encender el cobro. Staging y local siguen visibles.
 * Override: PUBLIC_SUBSCRIPTION_BILLING_UI=0|1
 */
export const isSubscriptionBillingUiEnabled = (): boolean => {
	const explicit = String(import.meta.env.PUBLIC_SUBSCRIPTION_BILLING_UI ?? '')
		.trim()
		.toLowerCase();
	if (explicit === '1' || explicit === 'true') return true;
	if (explicit === '0' || explicit === 'false') return false;
	return !PRODUCTION_BILLING_HOSTS.has(publicAppHost());
};

/**
 * Entitlements por plan definidos en el backend (`ref_plan_feature.feature_code`).
 * Fuente de verdad: `GET /workspace/subscription` → `data.features`.
 * Estos son los códigos canónicos del roadmap (Premium + Planes + Historial).
 */
export const PLAN_FEATURES = {
	WEB_BOOKING: 'WEB_BOOKING',
	NOTIFICATIONS: 'NOTIFICATIONS',
	CUSTOMERS: 'CUSTOMERS',
	SERVICES: 'SERVICES',
	TEAM_MULTI_BRANCH: 'TEAM_MULTI_BRANCH',
	AI_MORNING_DIGEST: 'AI_MORNING_DIGEST',
	VOICE_RECEPTION: 'VOICE_RECEPTION',
	DEPOSIT_COLLECTION: 'DEPOSIT_COLLECTION',
	APPOINTMENT_HISTORY: 'APPOINTMENT_HISTORY',
	PROFITABILITY_ANALYTICS: 'PROFITABILITY_ANALYTICS',
} as const;

export type PlanFeature = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];

/**
 * Features de complementos (addons) — no forman parte del plan Base/Premium.
 * Fuente: `GET /workspace/subscription` → `data.addon_features` / org_addon ACTIVE.
 */
export const ADDON_FEATURES = {
	ODONTOGRAM_3D: 'ODONTOGRAM_3D',
	BODY_MAP: 'BODY_MAP',
} as const;

export type AddonFeature = (typeof ADDON_FEATURES)[keyof typeof ADDON_FEATURES];

/**
 * Alineación flag de UI → entitlement de plan del backend.
 * Permite migrar (Fase 5) los gates globales `FEATURE_FLAGS` a entitlements reales
 * sin renombrar los flags existentes del frontend.
 */
export const FLAG_TO_PLAN_FEATURE: Record<FeatureFlag, PlanFeature> = {
	SERVICE_DEPOSIT_OPTIONS: PLAN_FEATURES.DEPOSIT_COLLECTION,
	APPOINTMENT_AI_VOICE: PLAN_FEATURES.VOICE_RECEPTION,
	PAYMENTS_SETTINGS: PLAN_FEATURES.DEPOSIT_COLLECTION,
};

/** ¿El plan de la organización incluye este entitlement? */
export const hasPlanFeature = (
	entitlements: readonly string[] | null | undefined,
	feature: PlanFeature
): boolean => Array.isArray(entitlements) && entitlements.includes(feature);

/**
 * ¿La funcionalidad detrás de un flag está habilitada?
 * Combina el flag de desarrollo con el entitlement del plan (si se proveen las features).
 * Si no se pasan `entitlements`, se cae al comportamiento actual (solo el flag).
 */
export const isFeatureEnabled = (
	flag: FeatureFlag,
	entitlements?: readonly string[] | null
): boolean => {
	if (!FEATURE_FLAGS[flag]) return false;
	if (entitlements === undefined || entitlements === null) return true;
	return hasPlanFeature(entitlements, FLAG_TO_PLAN_FEATURE[flag]);
};
