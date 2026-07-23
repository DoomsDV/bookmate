import { resolveOrdsApiUrl } from './env-urls';

export const BILLING_PROFILE_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_BILLING_PROFILE_URL,
	'ORDS_BILLING_PROFILE_URL',
	'/workspace/billing-profile'
);

export type BillingDocType = 'CI' | 'RUC';

export interface BillingProfileData {
	billing_name: string | null;
	billing_doc_type: BillingDocType;
	billing_doc_number: string | null;
	billing_email: string | null;
	is_complete: 0 | 1;
	updated_at?: string;
}

export interface BillingProfilePayload {
	billing_name: string;
	billing_doc_type: BillingDocType;
	billing_doc_number: string;
	billing_email: string;
}

interface OrdsSuccessResponse {
	status?: string;
	message?: string;
	data?: unknown;
}

export class BillingProfileApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'BillingProfileApiError';
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
		throw new BillingProfileApiError(message || fallbackMessage, response.status || 500, payload);
	}

	return payload || {};
};

const normalizeProfile = (raw: any): BillingProfileData => {
	const docType = String(raw?.billing_doc_type || '')
		.trim()
		.toUpperCase();
	return {
		billing_name: String(raw?.billing_name || '').trim() || null,
		billing_doc_type: docType === 'RUC' ? 'RUC' : 'CI',
		billing_doc_number: String(raw?.billing_doc_number || '').trim() || null,
		billing_email: String(raw?.billing_email || '').trim() || null,
		is_complete: Number(raw?.is_complete) === 1 ? 1 : 0,
		updated_at: String(raw?.updated_at || '').trim() || undefined,
	};
};

export const getBillingProfileWithOrds = async (token: string): Promise<BillingProfileData> => {
	const url = String(BILLING_PROFILE_URL || '').trim();
	if (!url) {
		throw new BillingProfileApiError('Falta configurar ORDS_BILLING_PROFILE_URL.', 500);
	}

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
		},
	});

	const data = await parseResponse(response, 'No fue posible cargar los datos de facturación.');
	return normalizeProfile((data as any).data ?? {});
};

export const saveBillingProfileWithOrds = async (
	token: string,
	payload: BillingProfilePayload
): Promise<{ message: string; data: BillingProfileData }> => {
	const url = String(BILLING_PROFILE_URL || '').trim();
	if (!url) {
		throw new BillingProfileApiError('Falta configurar ORDS_BILLING_PROFILE_URL.', 500);
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

	const data = await parseResponse(response, 'No fue posible guardar los datos de facturación.');
	return {
		message:
			String((data as any).message || '').trim() ||
			'Datos de facturación guardados correctamente.',
		data: normalizeProfile((data as any).data ?? payload),
	};
};
