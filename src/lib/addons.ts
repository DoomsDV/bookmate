import { resolveOrdsApiUrl } from './env-urls';

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
}

export interface AddonsCatalog {
	addons_billing_live: boolean;
	items: ModuleAddonItem[];
	active_items: ModuleAddonItem[];
	available_items: ModuleAddonItem[];
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

const normalizeModuleAddonItem = (value: unknown): ModuleAddonItem | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const id = toNumber(source.id_addon, NaN);
	if (!Number.isInteger(id) || id <= 0) return null;

	const grantTypeRaw = toNullableString(source.grant_type);
	const statusRaw = toNullableString(source.status);

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
		grant_type:
			grantTypeRaw === 'PREVIEW' || grantTypeRaw === 'PAID' ? grantTypeRaw : null,
		status:
			statusRaw === 'ACTIVE' || statusRaw === 'CANCELED' || statusRaw === 'EXPIRED'
				? statusRaw
				: null,
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

const parseOrdsData = async <T>(response: Response, normalize: (data: unknown) => T): Promise<T> => {
	let body: AddonSuccessResponse | AddonFailureResponse | null = null;
	try {
		body = await response.json();
	} catch {
		throw new AddonApiError('No fue posible interpretar la respuesta del servidor.', 502);
	}

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

export const activateAddonWithOrds = async (
	token: string,
	addonCode: string
): Promise<ModuleAddonItem> => {
	if (!token) throw new AddonApiError('Token de acceso requerido.', 401);

	const code = String(addonCode || '').trim().toUpperCase();
	if (!code) throw new AddonApiError('Falta el código del complemento.', 400);

	const response = await fetch(ADDONS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ addon_code: code }),
	});

	return parseOrdsData(response, (data) => {
		const normalized = normalizeModuleAddonItem(data);
		if (!normalized) {
			throw new AddonApiError('No fue posible interpretar el complemento activado.', 502);
		}
		return normalized;
	});
};

export const cancelAddonWithOrds = async (
	token: string,
	addonCode: string
): Promise<ModuleAddonItem> => {
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

	return parseOrdsData(response, (data) => {
		const normalized = normalizeModuleAddonItem(data);
		if (!normalized) {
			throw new AddonApiError('No fue posible interpretar el complemento cancelado.', 502);
		}
		return normalized;
	});
};
