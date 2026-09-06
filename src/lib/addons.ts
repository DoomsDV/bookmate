import { resolveOrdsApiUrl } from './env-urls';
import { readIdempotencyKeyHeader } from './idempotency';

export { readIdempotencyKeyHeader };

export const ADDONS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_ADDONS_URL,
	'ORDS_ADDONS_URL',
	'/workspace/addons'
);

export const ADDONS_CANCEL_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_ADDONS_CANCEL_URL,
	'ORDS_ADDONS_CANCEL_URL',
	'/workspace/addons/cancel'
);

export type ModuleAddonGrantType = 'PREVIEW' | 'PAID';
export type ModuleAddonStatus = 'ACTIVE' | 'CANCELED' | 'EXPIRED';
export type AddonCancelRefundType = 'nce' | 'credit' | 'none';

export interface ModuleAddonItem {
	id_addon: number;
	code: string;
	name: string;
	short_description: string | null;
	feature_code: string;
	price_amount: number;
	currency: string;
	billing_period: string;
	audience_code: string | null;
	eligible: boolean;
	is_active_for_org: boolean;
	grant_type: ModuleAddonGrantType | null;
	status: ModuleAddonStatus | null;
	/** Cobro proporcional de alta mid-cycle. Ausente si ORDS aún no lo envía. */
	prorate_amount: number | null;
	days_remaining: number | null;
	/** Crédito/NCE estimado al cancelar. 0 si PREVIEW o si ORDS no lo envía. */
	cancel_credit_amount: number;
	cancel_refund_type: AddonCancelRefundType;
}

export interface AddonsCatalog {
	addons_billing_live: boolean;
	items: ModuleAddonItem[];
	active_items: ModuleAddonItem[];
	available_items: ModuleAddonItem[];
}

/**
 * Respuesta de POST /workspace/addons.
 * Con ADDONS_BILLING_LIVE=0 el backend sigue devolviendo el ítem (PREVIEW).
 * Con live=1 debe espejar /subscription/activate: invoice_id, hash, requires_polling, payment_status.
 */
export interface AddonActivateResult {
	invoice_id: number | null;
	hash: string;
	status: string;
	payment_status: string | null;
	requires_polling: boolean;
	target_type: string;
	addon: ModuleAddonItem | null;
}

export interface AddonCancelResult {
	addon_code: string;
	addon_name: string | null;
	credit_granted: number;
	nce_amount: number;
	nce_queued: boolean;
	account_balance: number | null;
	addon: ModuleAddonItem | null;
}

export class AddonApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'AddonApiError';
		this.status = status;
		this.details = details;
	}
}

interface AddonSuccessResponse {
	status: 'success';
	data?: unknown;
}

interface AddonFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

const toNumber = (value: unknown, fallback = 0): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: unknown): boolean => value === 1 || value === true || value === '1';

const toNullableString = (value: unknown): string | null => {
	if (value === null || value === undefined) return null;
	const str = String(value).trim();
	return str === '' ? null : str;
};

const toNullableAmount = (value: unknown): number | null => {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const toRefundType = (
	value: unknown,
	grantType: ModuleAddonGrantType | null
): AddonCancelRefundType => {
	const raw = String(value || '')
		.trim()
		.toLowerCase();
	if (raw === 'nce' || raw === 'credit' || raw === 'none') return raw;
	return grantType === 'PREVIEW' ? 'none' : 'credit';
};

const normalizeModuleAddonItem = (value: unknown): ModuleAddonItem | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const id = toNumber(source.id_addon, NaN);
	if (!Number.isInteger(id) || id <= 0) return null;

	const grantTypeRaw = toNullableString(source.grant_type);
	const statusRaw = toNullableString(source.status);
	const grantType: ModuleAddonGrantType | null =
		grantTypeRaw === 'PREVIEW' || grantTypeRaw === 'PAID' ? grantTypeRaw : null;

	return {
		id_addon: id,
		code: String(source.code || '').trim(),
		name: String(source.name || '').trim(),
		short_description: toNullableString(source.short_description),
		feature_code: String(source.feature_code || '').trim(),
		price_amount: toNumber(source.price_amount, 0),
		currency: String(source.currency || 'PYG').trim(),
		billing_period: String(source.billing_period || 'MONTHLY').trim(),
		audience_code: toNullableString(source.audience_code),
		eligible: toBool(source.eligible),
		is_active_for_org: toBool(source.is_active_for_org),
		grant_type: grantType,
		status:
			statusRaw === 'ACTIVE' || statusRaw === 'CANCELED' || statusRaw === 'EXPIRED'
				? statusRaw
				: null,
		prorate_amount: toNullableAmount(source.prorate_amount),
		days_remaining: toNullableAmount(source.days_remaining),
		cancel_credit_amount: toNumber(source.cancel_credit_amount, 0),
		cancel_refund_type: toRefundType(source.cancel_refund_type, grantType),
	};
};

const normalizeAddonList = (value: unknown): ModuleAddonItem[] => {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const normalized = normalizeModuleAddonItem(item);
		return normalized ? [normalized] : [];
	});
};

const normalizeAddonsCatalog = (value: unknown): AddonsCatalog => {
	const source = (value ?? {}) as Record<string, unknown>;
	const items = normalizeAddonList(source.items);
	const hasSplit =
		Array.isArray(source.active_items) || Array.isArray(source.available_items);
	const activeItems = hasSplit
		? normalizeAddonList(source.active_items)
		: items.filter((item) => item.is_active_for_org);
	const availableItems = hasSplit
		? normalizeAddonList(source.available_items)
		: items.filter((item) => !item.is_active_for_org);

	return {
		addons_billing_live: toBool(source.addons_billing_live),
		items,
		active_items: activeItems,
		available_items: availableItems,
	};
};

const looksLikeAddonItem = (source: Record<string, unknown>): boolean => {
	const id = toNumber(source.id_addon, NaN);
	return Number.isInteger(id) && id > 0 && String(source.code || '').trim() !== '';
};

const normalizeAddonActivate = (value: unknown): AddonActivateResult => {
	const source = (value ?? {}) as Record<string, unknown>;
	const nestedAddon = normalizeModuleAddonItem(source.addon);
	const inlineAddon = looksLikeAddonItem(source) ? normalizeModuleAddonItem(source) : null;
	const addon = nestedAddon || inlineAddon;
	const hash = String(source.hash || '').trim();
	const invoiceRaw = toNumber(source.invoice_id, NaN);
	const invoiceId = Number.isInteger(invoiceRaw) && invoiceRaw > 0 ? invoiceRaw : null;
	const status = String(source.status || addon?.status || (hash ? 'PENDING' : 'ACTIVE')).trim();

	return {
		invoice_id: invoiceId,
		hash,
		status,
		payment_status: toNullableString(source.payment_status) || (status ? status : null),
		requires_polling:
			source.requires_polling === undefined ? Boolean(hash) : toBool(source.requires_polling),
		target_type: String(source.target_type || 'MODULE_ADDON').trim() || 'MODULE_ADDON',
		addon,
	};
};

const normalizeAddonCancel = (value: unknown): AddonCancelResult => {
	const source = (value ?? {}) as Record<string, unknown>;
	const addon = looksLikeAddonItem(source) ? normalizeModuleAddonItem(source) : null;
	return {
		addon_code: String(source.addon_code || addon?.code || '').trim(),
		addon_name: toNullableString(source.addon_name) || addon?.name || null,
		credit_granted: toNumber(source.credit_granted, 0),
		nce_amount: toNumber(source.nce_amount, 0),
		nce_queued: toBool(source.nce_queued),
		account_balance:
			source.account_balance == null || source.account_balance === ''
				? null
				: toNumber(source.account_balance, 0),
		addon,
	};
};

const parseOrdsData = async <T>(response: Response, normalize: (data: unknown) => T): Promise<T> => {
	let body: AddonSuccessResponse | AddonFailureResponse | null = null;
	try {
		body = await response.json();
	} catch {
		throw new AddonApiError('No fue posible interpretar la respuesta del servidor.', 502);
	}

	// 200 y 201 son éxito (201 = PENDING/Pagopar). El cobro se decide por el body, no por HTTP.
	if (!body || typeof body !== 'object' || body.status !== 'success' || !('data' in body)) {
		const failure = (body ?? {}) as AddonFailureResponse;
		throw new AddonApiError(
			(typeof failure.message === 'string' && failure.message.trim()) ||
				'No fue posible completar la solicitud.',
			response.status && response.status >= 400 ? response.status : 400,
			failure.details
		);
	}

	return normalize((body as AddonSuccessResponse).data);
};

/** ORDS: 201 si PENDING/requires_polling; 200 si PAID inmediato o preview. */
export const ordsActivateHttpStatus = (response: Response): number =>
	response.status === 201 ? 201 : 200;

export const listAddonsWithOrds = async (token: string): Promise<AddonsCatalog> => {
	if (!token) throw new AddonApiError('Token de acceso requerido.', 401);

	const response = await fetch(ADDONS_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseOrdsData(response, normalizeAddonsCatalog);
};

/**
 * Activa o cobra un complemento de módulo.
 * Reenvía `Idempotency-Key` a ORDS (`HTTP_IDEMPOTENCY_KEY` → `pr_activate_module_addon`).
 */
export const activateAddonWithOrds = async (
	token: string,
	addonCode: string,
	idempotencyKey?: string
): Promise<{ data: AddonActivateResult; httpStatus: number }> => {
	if (!token) throw new AddonApiError('Token de acceso requerido.', 401);

	const code = String(addonCode || '').trim().toUpperCase();
	if (!code) throw new AddonApiError('Falta el código del complemento.', 400);

	const response = await fetch(ADDONS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
		},
		body: JSON.stringify({ addon_code: code }),
	});

	const data = await parseOrdsData(response, normalizeAddonActivate);
	return { data, httpStatus: ordsActivateHttpStatus(response) };
};

export const cancelAddonWithOrds = async (
	token: string,
	addonCode: string
): Promise<AddonCancelResult> => {
	if (!token) throw new AddonApiError('Token de acceso requerido.', 401);

	const code = String(addonCode || '').trim().toUpperCase();
	if (!code) throw new AddonApiError('Falta el código del complemento.', 400);

	const response = await fetch(ADDONS_CANCEL_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ addon_code: code }),
	});

	return parseOrdsData(response, normalizeAddonCancel);
};
