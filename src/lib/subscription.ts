import { resolveOrdsApiUrl } from './env-urls';
import { readIdempotencyKeyHeader } from './idempotency';

export { readIdempotencyKeyHeader };

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

export const SUBSCRIPTION_CARD_ADD_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_CARD_ADD_URL,
	'ORDS_SUBSCRIPTION_CARD_ADD_URL',
	'/workspace/subscription/card/add'
);

export const SUBSCRIPTION_CARD_CONFIRM_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_CARD_CONFIRM_URL,
	'ORDS_SUBSCRIPTION_CARD_CONFIRM_URL',
	'/workspace/subscription/card/confirm'
);

export const SUBSCRIPTION_CARDS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_CARDS_URL,
	'ORDS_SUBSCRIPTION_CARDS_URL',
	'/workspace/subscription/cards'
);

const SUBSCRIPTION_CARD_DELETE_URL_TEMPLATE = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_CARD_DELETE_URL,
	'ORDS_SUBSCRIPTION_CARD_DELETE_URL',
	'/workspace/subscription/card/:id'
);

export const SUBSCRIPTION_ACTIVATE_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_ACTIVATE_URL,
	'ORDS_SUBSCRIPTION_ACTIVATE_URL',
	'/workspace/subscription/activate'
);

export const SUBSCRIPTION_ADDON_CANCEL_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_ADDON_CANCEL_URL,
	'ORDS_SUBSCRIPTION_ADDON_CANCEL_URL',
	'/workspace/subscription/addon/cancel'
);

export const SUBSCRIPTION_INVOICES_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_INVOICES_URL,
	'ORDS_SUBSCRIPTION_INVOICES_URL',
	'/workspace/subscription/invoices'
);

export const SUBSCRIPTION_CANCEL_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_CANCEL_URL,
	'ORDS_SUBSCRIPTION_CANCEL_URL',
	'/workspace/subscription/cancel'
);

export const SUBSCRIPTION_CANCEL_UNDO_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SUBSCRIPTION_CANCEL_UNDO_URL,
	'ORDS_SUBSCRIPTION_CANCEL_UNDO_URL',
	'/workspace/subscription/cancel/undo'
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
		canceled_at: string | null;
		auto_renew: boolean;
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
			canceled_at: toNullableString(sub.canceled_at),
			auto_renew: sub.auto_renew === undefined || sub.auto_renew === null ? true : toBool(sub.auto_renew),
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
	monthly_total: number;
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
	prorate_amount: number;
	cancel_credit_amount: number;
	days_remaining: number;
	period_days: number;
	currency: string;
	billing_period: string;
}

export interface ActiveStorageAddonLine {
	code: string;
	name: string;
	quantity: number;
	price_amount: number;
	line_total: number;
	extra_bytes: number;
	cancel_credit_amount: number;
	cancelable: boolean;
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
	current_period_start: string | null;
	current_period_end: string | null;
	grace_ends_at: string | null;
	storage_used_bytes: number;
	storage_limit_bytes: number;
	supports_storage_addons: boolean;
	billing_configured: boolean;
	plan_monthly_amount: number;
	addons_monthly_amount: number;
	monthly_total: number;
	days_remaining_in_period: number;
	period_days: number;
	account_balance: number;
	next_billing_at: string | null;
	next_charge_estimate: number;
	pending_plan_code: string | null;
	pending_plan_name: string | null;
	pending_plan_change_at: string | null;
	auto_renew: boolean;
	canceled_at: string | null;
	cancel_scheduled: boolean;
	active_storage_addons: ActiveStorageAddonLine[];
}

export interface BillingInvoiceItem {
	invoice_id: number;
	invoice_type: string;
	status: string;
	amount: number;
	gross_amount: number;
	credit_applied: number;
	currency: string;
	description: string | null;
	payment_provider: string | null;
	plan_code: string | null;
	plan_name: string | null;
	created_at: string | null;
	paid_at: string | null;
	period_start: string | null;
	period_end: string | null;
	hash: string | null;
}

export interface BillingHistory {
	next_billing_at: string | null;
	plan_code: string;
	plan_name: string;
	plan_monthly_amount: number;
	addons_monthly_amount: number;
	monthly_total: number;
	account_balance: number;
	next_charge_estimate: number;
	invoices: BillingInvoiceItem[];
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

	const activeAddonsRaw = Array.isArray(cur.active_storage_addons) ? cur.active_storage_addons : [];

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
			current_period_start: toNullableString(cur.current_period_start),
			current_period_end: toNullableString(cur.current_period_end),
			grace_ends_at: toNullableString(cur.grace_ends_at),
			storage_used_bytes: toNumber(cur.storage_used_bytes, 0),
			storage_limit_bytes: toNumber(cur.storage_limit_bytes, 0),
			supports_storage_addons: toBool(cur.supports_storage_addons),
			billing_configured: toBool(cur.billing_configured),
			plan_monthly_amount: toNumber(cur.plan_monthly_amount, 0),
			addons_monthly_amount: toNumber(cur.addons_monthly_amount, 0),
			monthly_total: toNumber(cur.monthly_total, 0),
			days_remaining_in_period: toNumber(cur.days_remaining_in_period, 0),
			period_days: toNumber(cur.period_days, 30),
			account_balance: toNumber(cur.account_balance, 0),
			next_billing_at: toNullableString(cur.next_billing_at) || toNullableString(cur.current_period_end),
			next_charge_estimate: toNumber(
				cur.next_charge_estimate,
				Math.max(
					0,
					toNumber(cur.monthly_total, 0) - toNumber(cur.account_balance, 0)
				)
			),
			pending_plan_code: toNullableString(cur.pending_plan_code),
			pending_plan_name: toNullableString(cur.pending_plan_name),
			pending_plan_change_at: toNullableString(cur.pending_plan_change_at),
			auto_renew: cur.auto_renew === undefined || cur.auto_renew === null ? true : toBool(cur.auto_renew),
			canceled_at: toNullableString(cur.canceled_at),
			cancel_scheduled:
				toBool(cur.cancel_scheduled) ||
				String(cur.pending_plan_code || '')
					.trim()
					.toUpperCase() === 'FREE',
			active_storage_addons: activeAddonsRaw.map((item) => {
				const a = (item ?? {}) as Record<string, unknown>;
				return {
					code: String(a.code || '').trim(),
					name: String(a.name || '').trim(),
					quantity: toNumber(a.quantity, 1),
					price_amount: toNumber(a.price_amount, 0),
					line_total: toNumber(a.line_total, 0),
					extra_bytes: toNumber(a.extra_bytes, 0),
					cancel_credit_amount: toNumber(a.cancel_credit_amount, 0),
					cancelable: a.cancelable === undefined ? true : toBool(a.cancelable),
				};
			}),
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
				monthly_total: toNumber(p.monthly_total, checkoutPrice),
				currency: String(p.currency || 'PYG').trim(),
				billing_period: String(p.billing_period || 'MONTHLY').trim(),
				storage_limit_bytes: toNumber(p.storage_limit_bytes, 0),
				is_current: toBool(p.is_current),
				features: toStringArray(p.features),
			};
		}),
		storage_addons: addonsRaw.map((item) => {
			const a = (item ?? {}) as Record<string, unknown>;
			const full = toNumber(a.price_amount, 0);
			return {
				id_storage_addon: toNumber(a.id_storage_addon, 0),
				code: String(a.code || '').trim(),
				name: String(a.name || '').trim(),
				extra_bytes: toNumber(a.extra_bytes, 0),
				price_amount: full,
				prorate_amount: toNumber(a.prorate_amount, full),
				cancel_credit_amount: toNumber(a.cancel_credit_amount, 0),
				days_remaining: toNumber(a.days_remaining, 0),
				period_days: toNumber(a.period_days, 30),
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
	payload: CheckoutPayload,
	idempotencyKey?: string
): Promise<CheckoutResult> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_CHECKOUT_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
		},
		body: JSON.stringify(payload),
	});
	return parseOrdsData(response, normalizeCheckout);
};

export const changePlanWithOrds = async (
	token: string,
	planCode: string
): Promise<{
	plan_code: string;
	effective_status: string;
	scheduled: boolean;
	pending_plan_code: string | null;
	pending_plan_change_at: string | null;
}> => {
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
			scheduled: toBool(d.scheduled),
			pending_plan_code: toNullableString(d.pending_plan_code),
			pending_plan_change_at: toNullableString(d.pending_plan_change_at),
		};
	});
};

export const cancelSubscriptionWithOrds = async (
	token: string
): Promise<{
	plan_code: string;
	effective_status: string;
	scheduled: boolean;
	applied: boolean;
	pending_plan_code: string | null;
	pending_plan_change_at: string | null;
}> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_CANCEL_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({}),
	});
	return parseOrdsData(response, (data) => {
		const d = (data ?? {}) as Record<string, unknown>;
		return {
			plan_code: String(d.plan_code || '').trim(),
			effective_status: String(d.effective_status || '').trim(),
			scheduled: toBool(d.scheduled),
			applied: toBool(d.applied),
			pending_plan_code: toNullableString(d.pending_plan_code),
			pending_plan_change_at: toNullableString(d.pending_plan_change_at),
		};
	});
};

export const undoCancelSubscriptionWithOrds = async (
	token: string
): Promise<{
	plan_code: string;
	effective_status: string;
	pending_cleared: boolean;
}> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_CANCEL_UNDO_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({}),
	});
	return parseOrdsData(response, (data) => {
		const d = (data ?? {}) as Record<string, unknown>;
		return {
			plan_code: String(d.plan_code || '').trim(),
			effective_status: String(d.effective_status || '').trim(),
			pending_cleared: toBool(d.pending_cleared),
		};
	});
};

export const cancelStorageAddonWithOrds = async (
	token: string,
	addonCode: string
): Promise<{ credit_granted: number; account_balance: number; addon_code: string }> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_ADDON_CANCEL_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ addon_code: addonCode }),
	});
	return parseOrdsData(response, (data) => {
		const d = (data ?? {}) as Record<string, unknown>;
		return {
			addon_code: String(d.addon_code || '').trim(),
			credit_granted: toNumber(d.credit_granted, 0),
			account_balance: toNumber(d.account_balance, 0),
		};
	});
};

const normalizeBillingHistory = (value: unknown): BillingHistory => {
	const d = (value ?? {}) as Record<string, unknown>;
	const invoicesRaw = Array.isArray(d.invoices) ? d.invoices : [];
	return {
		next_billing_at: toNullableString(d.next_billing_at),
		plan_code: String(d.plan_code || '').trim(),
		plan_name: String(d.plan_name || '').trim(),
		plan_monthly_amount: toNumber(d.plan_monthly_amount, 0),
		addons_monthly_amount: toNumber(d.addons_monthly_amount, 0),
		monthly_total: toNumber(d.monthly_total, 0),
		account_balance: toNumber(d.account_balance, 0),
		next_charge_estimate: toNumber(d.next_charge_estimate, 0),
		invoices: invoicesRaw.map((item) => {
			const i = (item ?? {}) as Record<string, unknown>;
			return {
				invoice_id: toNumber(i.invoice_id, 0),
				invoice_type: String(i.invoice_type || '').trim(),
				status: String(i.status || '').trim(),
				amount: toNumber(i.amount, 0),
				gross_amount: toNumber(i.gross_amount, toNumber(i.amount, 0)),
				credit_applied: toNumber(i.credit_applied, 0),
				currency: String(i.currency || 'PYG').trim(),
				description: toNullableString(i.description),
				payment_provider: toNullableString(i.payment_provider),
				plan_code: toNullableString(i.plan_code),
				plan_name: toNullableString(i.plan_name),
				created_at: toNullableString(i.created_at),
				paid_at: toNullableString(i.paid_at),
				period_start: toNullableString(i.period_start),
				period_end: toNullableString(i.period_end),
				hash: toNullableString(i.hash),
			};
		}),
	};
};

export const listInvoicesWithOrds = async (token: string): Promise<BillingHistory> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_INVOICES_URL, {
		method: 'GET',
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	});
	return parseOrdsData(response, normalizeBillingHistory);
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

// ---------------------------------------------------------------------------
// Pago recurrente: catastro de tarjeta (uPay), gestión y activación.
// ---------------------------------------------------------------------------

export interface PaymentCard {
	id: number;
	provider: string;
	brand: string | null;
	masked_number: string | null;
	card_type: string | null;
	issuer: string | null;
	is_default: boolean;
}

export interface AddCardResult {
	id_form: string;
	iframe_url: string;
	provider: string;
	return_url: string;
}

export interface ActivateResult {
	invoice_id: number | null;
	hash: string;
	status: string;
	target_type: string;
	requires_polling: boolean;
}

const normalizeCards = (value: unknown): PaymentCard[] => {
	const source = (value ?? {}) as Record<string, unknown>;
	const cardsRaw = Array.isArray(source.cards) ? source.cards : [];
	return cardsRaw.map((item) => {
		const c = (item ?? {}) as Record<string, unknown>;
		return {
			id: toNumber(c.id, 0),
			provider: String(c.provider || 'uPay').trim(),
			brand: toNullableString(c.brand),
			masked_number: toNullableString(c.masked_number),
			card_type: toNullableString(c.card_type),
			issuer: toNullableString(c.issuer),
			is_default: toBool(c.is_default),
		};
	});
};

const normalizeAddCard = (value: unknown): AddCardResult => {
	const d = (value ?? {}) as Record<string, unknown>;
	const iframe = String(d.iframe_url || '').trim();
	if (!iframe) throw new SubscriptionApiError('Pagopar no devolvió el formulario de tarjeta.', 502);
	return {
		id_form: String(d.id_form || '').trim(),
		iframe_url: iframe,
		provider: String(d.provider || 'uPay').trim(),
		return_url: String(d.return_url || '').trim(),
	};
};

const normalizeActivate = (value: unknown): ActivateResult => {
	const d = (value ?? {}) as Record<string, unknown>;
	const hash = String(d.hash || '').trim();
	return {
		invoice_id: d.invoice_id == null || d.invoice_id === '' ? null : toNumber(d.invoice_id, 0),
		hash,
		status: String(d.status || 'PENDING').trim(),
		target_type: String(d.target_type || 'PLAN').trim(),
		requires_polling: d.requires_polling === undefined ? Boolean(hash) : toBool(d.requires_polling),
	};
};

export const addCardWithOrds = async (
	token: string,
	provider?: string
): Promise<AddCardResult> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_CARD_ADD_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(provider ? { provider } : {}),
	});
	return parseOrdsData(response, normalizeAddCard);
};

export const confirmCardWithOrds = async (token: string): Promise<PaymentCard[]> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_CARD_CONFIRM_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({}),
	});
	return parseOrdsData(response, normalizeCards);
};

export const listCardsWithOrds = async (token: string): Promise<PaymentCard[]> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_CARDS_URL, {
		method: 'GET',
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	});
	return parseOrdsData(response, normalizeCards);
};

export const deleteCardWithOrds = async (token: string, cardId: number): Promise<void> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const url = SUBSCRIPTION_CARD_DELETE_URL_TEMPLATE.replace(':id', encodeURIComponent(String(cardId)));
	const response = await fetch(url, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
	});
	await parseOrdsData(response, () => undefined);
};

export const activateSubscriptionWithOrds = async (
	token: string,
	payload: { target_type?: 'PLAN' | 'STORAGE_ADDON'; plan_code?: string; addon_code?: string },
	idempotencyKey?: string
): Promise<ActivateResult> => {
	if (!token) throw new SubscriptionApiError('Token de acceso requerido.', 401);
	const response = await fetch(SUBSCRIPTION_ACTIVATE_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
		},
		body: JSON.stringify(payload),
	});
	return parseOrdsData(response, normalizeActivate);
};
