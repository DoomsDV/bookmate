import { resolveOrdsApiUrl } from './env-urls';

export const PAYMENT_SETTINGS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_PAYMENT_SETTINGS_URL,
	'ORDS_PAYMENT_SETTINGS_URL',
	'/workspace/payment-settings'
);

export type RefundPolicy = 'FLEXIBLE' | 'MODERATE' | 'STRICT';

export interface SipapBankOption {
	id_bank: number;
	code: string;
	name: string;
}

export interface PaymentSettingsData {
	deposits_enabled: 0 | 1;
	refund_policy: RefundPolicy | null;
	bank_id: number | null;
	bank_name: string | null;
	account_holder: string | null;
	document_id: string | null;
	bank_alias: string | null;
	banks: SipapBankOption[];
	plan_allows_deposits: 0 | 1 | boolean;
	refund_strike_count?: number;
	deposits_suspended?: 0 | 1;
	deposits_suspended_reason?: string | null;
	deposits_suspended_at?: string | null;
	max_refund_strikes?: number;
	updated_at?: string;
}

export interface PaymentSettingsPayload {
	deposits_enabled: 0 | 1;
	refund_policy?: RefundPolicy | null;
	bank_id?: number | null;
	account_holder?: string | null;
	document_id?: string | null;
	bank_alias?: string | null;
}

interface OrdsSuccessResponse {
	status?: string;
	message?: string;
	data?: unknown;
}

export class PaymentSettingsApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'PaymentSettingsApiError';
		this.status = status;
		this.details = details;
	}
}

const parseResponse = async (response: Response, fallbackMessage: string) => {
	let payload: OrdsSuccessResponse | null = null;
	try {
		payload = (await response.json()) as OrdsSuccessResponse;
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message =
			payload && typeof payload === 'object' ? String(payload.message || '').trim() : '';
		throw new PaymentSettingsApiError(message || fallbackMessage, response.status || 500, payload);
	}

	return payload || {};
};

const normalizeBanks = (raw: unknown): SipapBankOption[] => {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item: any) => ({
			id_bank: Number(item?.id_bank || 0),
			code: String(item?.code || '').trim(),
			name: String(item?.name || '').trim(),
		}))
		.filter((item) => item.id_bank > 0 && item.name);
};

const normalizeSettings = (raw: any): PaymentSettingsData => {
	const policy = String(raw?.refund_policy || '')
		.trim()
		.toUpperCase();
	const refundPolicy =
		policy === 'FLEXIBLE' || policy === 'MODERATE' || policy === 'STRICT'
			? (policy as RefundPolicy)
			: null;
	const bankId = Number(raw?.bank_id || 0);

	return {
		deposits_enabled: Number(raw?.deposits_enabled) === 1 ? 1 : 0,
		refund_policy: refundPolicy,
		bank_id: bankId > 0 ? bankId : null,
		bank_name: String(raw?.bank_name || '').trim() || null,
		account_holder: String(raw?.account_holder || '').trim() || null,
		document_id: String(raw?.document_id || '').trim() || null,
		bank_alias: String(raw?.bank_alias || '').trim() || null,
		banks: normalizeBanks(raw?.banks),
		plan_allows_deposits:
			raw?.plan_allows_deposits === true || Number(raw?.plan_allows_deposits) === 1 ? 1 : 0,
		refund_strike_count: Number(raw?.refund_strike_count) || 0,
		deposits_suspended: Number(raw?.deposits_suspended) === 1 ? 1 : 0,
		deposits_suspended_reason: String(raw?.deposits_suspended_reason || '').trim() || null,
		deposits_suspended_at: String(raw?.deposits_suspended_at || '').trim() || null,
		max_refund_strikes: Number(raw?.max_refund_strikes) || 3,
		updated_at: String(raw?.updated_at || '').trim() || undefined,
	};
};

export const getPaymentSettingsWithOrds = async (token: string): Promise<PaymentSettingsData> => {
	const url = String(PAYMENT_SETTINGS_URL || '').trim();
	if (!url) {
		throw new PaymentSettingsApiError('Falta configurar ORDS_PAYMENT_SETTINGS_URL.', 500);
	}

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
		},
	});

	const data = await parseResponse(response, 'No fue posible cargar la configuración de cobros.');
	return normalizeSettings((data as any).data ?? {});
};

export const savePaymentSettingsWithOrds = async (
	token: string,
	payload: PaymentSettingsPayload
): Promise<{ message: string; data: PaymentSettingsData }> => {
	const url = String(PAYMENT_SETTINGS_URL || '').trim();
	if (!url) {
		throw new PaymentSettingsApiError('Falta configurar ORDS_PAYMENT_SETTINGS_URL.', 500);
	}

	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(payload),
	});

	const data = await parseResponse(response, 'No fue posible guardar la configuración de cobros.');
	return {
		message:
			String((data as any).message || '').trim() ||
			'Configuración de cobros guardada correctamente.',
		data: normalizeSettings((data as any).data ?? payload),
	};
};
