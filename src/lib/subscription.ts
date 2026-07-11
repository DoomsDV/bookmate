import { resolveOrdsApiUrl } from './env-urls';

export const SUBSCRIPTION_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_URL,
	'ORDS_SUBSCRIPTION_URL',
	'/workspace/subscription'
);

export const PLANS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_PLANS_URL,
	'ORDS_PLANS_URL',
	'/workspace/plans'
);

export const SUBSCRIPTION_CHECKOUT_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_CHECKOUT_URL,
	'ORDS_SUBSCRIPTION_CHECKOUT_URL',
	'/workspace/subscription/checkout'
);

export const SUBSCRIPTION_CHANGE_PLAN_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_CHANGE_PLAN_URL,
	'ORDS_SUBSCRIPTION_CHANGE_PLAN_URL',
	'/workspace/subscription/change-plan'
);

const SUBSCRIPTION_INVOICE_URL_TEMPLATE = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_INVOICE_URL,
	'ORDS_SUBSCRIPTION_INVOICE_URL',
	'/workspace/subscription/invoice/:hash'
);

export type SubscriptionEffectiveStatus =
	| 'TRIAL'
	| 'TRIAL_EXPIRED'
	| 'ACTIVE'
	| 'PAST_DUE'
	| 'READ_ONLY'
	| 'CANCELED'
	| 'FOUNDER'
	| 'NONE';

export interface SubscriptionData {
	subscription: {
		status: string;
		effective_status: SubscriptionEffectiveStatus;
		can_write: boolean;
		is_founder: boolean;
		billing_exempt: boolean;
		trial_ends_at: string | null;
		current_period_start: string | null;
		current_period_end: string | null;
		grace_ends_at: string | null;
	};
	plan: {
		code: string;
		name: string;
		price_amount: number;
		currency: string;
		billing_period: string;
	};
	storage: {
		used_bytes: number;
		limit_bytes: number;
	};
	features: string[];
}

export class SubscriptionApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'SubscriptionApiError';
		this.status = status;
		this.details = details;
	}
}

interface SubscriptionSuccessResponse {
	status: 'success';
	data?: unknown;
}

interface SubscriptionFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

const toNumber = (value: unknown, fallback = 0): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: unknown): boolean => value === 1 || value === true || value === '1';

const toStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []))
		: [];

const toNullableString = (value: unknown): string | null => {
	if (value === null || value === undefined) return null;
	const str = String(value).trim();
	return str === '' ? null : str;
};

const normalizeSubscription = (value: unknown): SubscriptionData | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const sub = (source.subscription ?? {}) as Record<string, unknown>;
	const plan = (source.plan ?? {}) as Record<string, unknown>;
	const storage = (source.storage ?? {}) as Record<string, unknown>;

	return {
		subscription: {
			status: String(sub.status || '').trim(),
			effective_status: String(sub.effective_status || 'NONE').trim() as SubscriptionEffectiveStatus,
			can_write: toBool(sub.can_write),
			is_founder: toBool(sub.is_founder),
			billing_exempt: toBool(sub.billing_exempt),
			trial_ends_at: toNullableString(sub.trial_ends_at),
			current_period_start: toNullableString(sub.current_period_start),
			current_period_end: toNullableString(sub.current_period_end),
			grace_ends_at: toNullableString(sub.grace_ends_at),
		},
		plan: {
			code: String(plan.code || '').trim(),
			name: String(plan.name || '').trim(),
			price_amount: toNumber(plan.price_amount, 0),
			currency: String(plan.currency || 'PYG').trim(),
			billing_period: String(plan.billing_period || 'MONTHLY').trim(),
		},
		storage: {
			used_bytes: toNumber(storage.used_bytes, 0),
			limit_bytes: toNumber(storage.limit_bytes, 0),
		},
		features: toStringArray(source.features),
	};
};

const parseSubscriptionResponse = async (response: Response): Promise<SubscriptionData> => {
	let data: SubscriptionSuccessResponse | SubscriptionFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new SubscriptionApiError('No fue posible interpretar la respuesta de suscripción.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		const failure = (data ?? {}) as SubscriptionFailureResponse;
		throw new SubscriptionApiError(
			(typeof failure.message === 'string' && failure.message.trim()) ||
				'No fue posible obtener la suscripción.',
			response.status || 400,
			failure.details
		);
	}

	const normalized = normalizeSubscription(data.data);
	if (!normalized) {
		throw new SubscriptionApiError('No fue posible interpretar la suscripción.', 502);
	}

	return normalized;
};

export const getSubscriptionWithOrds = async (token: string): Promise<SubscriptionData> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);

	const response = await fetch(SUBSCRIPTION_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseSubscriptionResponse(response);
};

// ---------------------------------------------------------------------------
// Fase 5: catálogo comercial, checkout Pagopar de suscripción y cambio de plan.
// ---------------------------------------------------------------------------

export interface PlanCatalogItem {
	id_plan: number;
	code: string;
	name: string;
	price_amount: number;
	checkout_price_amount: number;
	founder_discount_percent: number;
	currency: string;
	billing_period: string;
	storage_limit_bytes: number;
	is_current: boolean;
	features: string[];
}

export interface StorageAddonItem {
	id_storage_addon: number;
	code: string;
	name: string;
	extra_bytes: number;
	price_amount: number;
	currency: string;
	billing_period: string;
}

export interface SubscriptionCurrentSnapshot {
	plan_code: string;
	plan_name: string;
	status: string;
	effective_status: SubscriptionEffectiveStatus;
	can_write: boolean;
	is_founder: boolean;
	billing_exempt: boolean;
	founder_discount_percent: number;
	trial_ends_at: string | null;
	current_period_end: string | null;
	grace_ends_at: string | null;
	storage_used_bytes: number;
	storage_limit_bytes: number;
	supports_storage_addons: boolean;
	billing_configured: boolean;
}

export interface PlansCatalog {
	current: SubscriptionCurrentSnapshot;
	plans: PlanCatalogItem[];
	storage_addons: StorageAddonItem[];
}

export interface CheckoutResult {
	hash: string;
	checkout_url: string;
	invoice_id: number;
	amount: number;
	currency: string;
	target_type: 'PLAN' | 'STORAGE_ADDON';
	forma_pago: number;
}

export interface InvoiceStatus {
	invoice_id: number;
	invoice_type: string;
	status: 'PENDING' | 'PAID' | 'FAILED' | 'VOID';
	amount: number;
	currency: string;
	description: string | null;
	plan_code: string | null;
	paid_at: string | null;
	hash: string;
	effective_status: SubscriptionEffectiveStatus;
}

export interface CheckoutPayload {
	target_type: 'PLAN' | 'STORAGE_ADDON';
	plan_code?: string;
	addon_code?: string;
	forma_pago?: number;
}

const parseOrdsData = async <T>(response: Response, normalize: (data: unknown) => T): Promise<T> => {
	let body: SubscriptionSuccessResponse | SubscriptionFailureResponse | null = null;
	try {
		body = await response.json();
	} catch {
		throw new SubscriptionApiError('No fue posible interpretar la respuesta del servidor.', 502);
	}

	// El módulo ORDS `hasel` responde HTTP 200 con `status:"error"` en el cuerpo:
	// nos guiamos por el campo `status`, no por el código HTTP.
	if (!body || typeof body !== 'object' || body.status !== 'success' || !('data' in body)) {
		const failure = (body ?? {}) as SubscriptionFailureResponse;
		throw new SubscriptionApiError(
			(typeof failure.message === 'string' && failure.message.trim()) ||
				'No fue posible completar la solicitud.',
			response.status && response.status >= 400 ? response.status : 400,
			failure.details
		);
	}

	return normalize((body as SubscriptionSuccessResponse).data);
};

const normalizePlansCatalog = (value: unknown): PlansCatalog => {
	const source = (value ?? {}) as Record<string, unknown>;
	const cur = (source.current ?? {}) as Record<string, unknown>;
	const plansRaw = Array.isArray(source.plans) ? source.plans : [];
	const addonsRaw = Array.isArray(source.storage_addons) ? source.storage_addons : [];

	return {
		current: {
			plan_code: String(cur.plan_code || '').trim(),
			plan_name: String(cur.plan_name || '').trim(),
			status: String(cur.status || '').trim(),
			effective_status: String(cur.effective_status || 'NONE').trim() as SubscriptionEffectiveStatus,
			can_write: toBool(cur.can_write),
			is_founder: toBool(cur.is_founder),
			billing_exempt: toBool(cur.billing_exempt),
			founder_discount_percent: toNumber(cur.founder_discount_percent, 0),
			trial_ends_at: toNullableString(cur.trial_ends_at),
			current_period_end: toNullableString(cur.current_period_end),
			grace_ends_at: toNullableString(cur.grace_ends_at),
			storage_used_bytes: toNumber(cur.storage_used_bytes, 0),
			storage_limit_bytes: toNumber(cur.storage_limit_bytes, 0),
			supports_storage_addons: toBool(cur.supports_storage_addons),
			billing_configured: toBool(cur.billing_configured),
		},
		plans: plansRaw.map((item) => {
			const p = (item ?? {}) as Record<string, unknown>;
			const listPrice = toNumber(p.price_amount, 0);
			const checkoutPrice = toNumber(p.checkout_price_amount, listPrice);
			return {
				id_plan: toNumber(p.id_plan, 0),
				code: String(p.code || '').trim(),
				name: String(p.name || '').trim(),
				price_amount: listPrice,
				checkout_price_amount: checkoutPrice,
				founder_discount_percent: toNumber(p.founder_discount_percent, 0),
				currency: String(p.currency || 'PYG').trim(),
				billing_period: String(p.billing_period || 'MONTHLY').trim(),
				storage_limit_bytes: toNumber(p.storage_limit_bytes, 0),
				is_current: toBool(p.is_current),
				features: toStringArray(p.features),
			};
		}),
		storage_addons: addonsRaw.map((item) => {
			const a = (item ?? {}) as Record<string, unknown>;
			return {
				id_storage_addon: toNumber(a.id_storage_addon, 0),
				code: String(a.code || '').trim(),
				name: String(a.name || '').trim(),
				extra_bytes: toNumber(a.extra_bytes, 0),
				price_amount: toNumber(a.price_amount, 0),
				currency: String(a.currency || 'PYG').trim(),
				billing_period: String(a.billing_period || 'MONTHLY').trim(),
			};
		}),
	};
};

const normalizeCheckout = (value: unknown): CheckoutResult => {
	const d = (value ?? {}) as Record<string, unknown>;
	const url = String(d.checkout_url || '').trim();
	if (!url) throw new SubscriptionApiError('El proveedor de pago no devolvió una URL de checkout.', 502);
	return {
		hash: String(d.hash || '').trim(),
		checkout_url: url,
		invoice_id: toNumber(d.invoice_id, 0),
		amount: toNumber(d.amount, 0),
		currency: String(d.currency || 'PYG').trim(),
		target_type: (String(d.target_type || 'PLAN').trim() as 'PLAN' | 'STORAGE_ADDON'),
		forma_pago: toNumber(d.forma_pago, 9),
	};
};

const normalizeInvoiceStatus = (value: unknown): InvoiceStatus => {
	const d = (value ?? {}) as Record<string, unknown>;
	return {
		invoice_id: toNumber(d.invoice_id, 0),
		invoice_type: String(d.invoice_type || '').trim(),
		status: (String(d.status || 'PENDING').trim() as InvoiceStatus['status']),
		amount: toNumber(d.amount, 0),
		currency: String(d.currency || 'PYG').trim(),
		description: toNullableString(d.description),
		plan_code: toNullableString(d.plan_code),
		paid_at: toNullableString(d.paid_at),
		hash: String(d.hash || '').trim(),
		effective_status: String(d.effective_status || 'NONE').trim() as SubscriptionEffectiveStatus,
	};
};

export const getPlansWithOrds = async (token: string): Promise<PlansCatalog> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(PLANS_URL, {
		method: 'GET',
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	});
	return parseOrdsData(response, normalizePlansCatalog);
};

export const createSubscriptionCheckoutWithOrds = async (
	token: string,
	payload: CheckoutPayload
): Promise<CheckoutResult> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_CHECKOUT_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	});
	return parseOrdsData(response, normalizeCheckout);
};

export const changePlanWithOrds = async (
	token: string,
	planCode: string
): Promise<{ plan_code: string; effective_status: string }> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_CHANGE_PLAN_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ plan_code: planCode }),
	});
	return parseOrdsData(response, (data) => {
		const d = (data ?? {}) as Record<string, unknown>;
		return {
			plan_code: String(d.plan_code || '').trim(),
			effective_status: String(d.effective_status || '').trim(),
		};
	});
};

export const getInvoiceStatusWithOrds = async (
	token: string,
	hash: string
): Promise<InvoiceStatus> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const safeHash = encodeURIComponent(String(hash || '').trim());
	const url = SUBSCRIPTION_INVOICE_URL_TEMPLATE.replace(':hash', safeHash);
	const response = await fetch(url, {
		method: 'GET',
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	});
	return parseOrdsData(response, normalizeInvoiceStatus);
};
