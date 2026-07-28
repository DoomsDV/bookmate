import { resolveOrdsApiUrl } from './env-urls';

export const COBROS_LIST_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_COBROS_URL,
	'ORDS_COBROS_URL',
	'/workspace/payments'
);

export const COBROS_PENDING_COUNT_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_COBROS_PENDING_COUNT_URL,
	'ORDS_COBROS_PENDING_COUNT_URL',
	'/workspace/payments/pending-count'
);

export type CobrosStatusFilter = 'all' | 'pending' | 'approved' | 'refunded' | 'expired';
export type CobrosDatePreset = 'this_month' | 'last_month' | 'custom';

export interface CobroItem {
	id_transaction: number;
	id_appointment: number;
	start_time?: string | null;
	customer_name?: string | null;
	service_name?: string | null;
	amount: number;
	currency: string;
	payment_status?: string | null;
	ocr_status?: string | null;
	ui_status?: 'pending' | 'approved' | 'other' | 'refund_pending' | 'refund_sent' | 'refund_awaiting_alias' | string;
	payment_reference?: string | null;
	receipt_url?: string | null;
	ocr_reference?: string | null;
	ocr_amount?: number | null;
	ocr_confidence?: number | null;
	receipt_uploaded_at?: string | null;
	created_at?: string | null;
	reject_reason?: string | null;
	refund_status?: string | null;
	refund_amount?: number | null;
	refund_alias?: string | null;
	refund_claim_open?: number | null;
	refund_sla_breached?: number | null;
}

export interface CobrosListMeta {
	total: number;
	page: number;
	limit: number;
	pending_count: number;
}

export interface CobrosListResult {
	items: CobroItem[];
	meta: CobrosListMeta;
}

export interface CobrosListQuery {
	status?: CobrosStatusFilter;
	date_preset?: CobrosDatePreset;
	date_from?: string;
	date_to?: string;
	page?: number;
	limit?: number;
}

export class CobrosApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'CobrosApiError';
		this.status = status;
		this.details = details;
	}
}

const parseResponse = async (response: Response, fallbackMessage: string) => {
	let payload: any = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	if (!response.ok || (payload && payload.status && payload.status !== 'success')) {
		const message =
			payload && typeof payload === 'object' ? String(payload.message || '').trim() : '';
		throw new CobrosApiError(message || fallbackMessage, response.status || 500, payload);
	}

	return payload || {};
};

const toPositiveInt = (value: unknown, fallback = 0) => {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : fallback;
};

const normalizeItem = (raw: any): CobroItem | null => {
	const id = toPositiveInt(raw?.id_transaction, 0);
	if (!id) return null;
	return {
		id_transaction: id,
		id_appointment: toPositiveInt(raw?.id_appointment, 0),
		start_time: String(raw?.start_time || '').trim() || null,
		customer_name: String(raw?.customer_name || '').trim() || null,
		service_name: String(raw?.service_name || '').trim() || null,
		amount: Number(raw?.amount ?? 0) || 0,
		currency: String(raw?.currency || 'PYG').trim() || 'PYG',
		payment_status: String(raw?.payment_status || '').trim() || null,
		ocr_status: String(raw?.ocr_status || '').trim() || null,
		ui_status: String(raw?.ui_status || '').trim() || 'other',
		payment_reference: String(raw?.payment_reference || '').trim() || null,
		receipt_url: String(raw?.receipt_url || '').trim() || null,
		ocr_reference: String(raw?.ocr_reference || '').trim() || null,
		ocr_amount: Number(raw?.ocr_amount ?? NaN) || null,
		ocr_confidence: Number(raw?.ocr_confidence ?? NaN) || null,
		receipt_uploaded_at: String(raw?.receipt_uploaded_at || '').trim() || null,
		created_at: String(raw?.created_at || '').trim() || null,
		reject_reason: String(raw?.reject_reason || '').trim() || null,
		refund_status: String(raw?.refund_status || '').trim() || null,
		refund_amount: Number(raw?.refund_amount ?? NaN) || null,
		refund_alias: String(raw?.refund_alias || '').trim() || null,
		refund_claim_open: Number(raw?.refund_claim_open ?? 0) || 0,
		refund_sla_breached: Number(raw?.refund_sla_breached ?? 0) || 0,
	};
};

export const listCobrosWithOrds = async (
	token: string,
	query: CobrosListQuery = {}
): Promise<CobrosListResult> => {
	const url = new URL(COBROS_LIST_URL);
	url.searchParams.set('status_filter', query.status || 'all');
	url.searchParams.set('date_preset', query.date_preset || 'this_month');
	if (query.date_from) url.searchParams.set('date_from', query.date_from);
	if (query.date_to) url.searchParams.set('date_to', query.date_to);
	url.searchParams.set('page', String(query.page || 1));
	url.searchParams.set('limit', String(query.limit || 9));

	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
		},
	});

	const payload = await parseResponse(response, 'No fue posible cargar los cobros.');
	const rawItems = Array.isArray(payload.data) ? payload.data : [];
	const items = rawItems.map(normalizeItem).filter(Boolean) as CobroItem[];
	const metaRaw = payload.meta || {};

	return {
		items,
		meta: {
			total: toPositiveInt(metaRaw.total, items.length),
			page: toPositiveInt(metaRaw.page, query.page || 1),
			limit: toPositiveInt(metaRaw.limit, query.limit || 9),
			pending_count: toPositiveInt(metaRaw.pending_count, 0),
		},
	};
};

export const getCobrosPendingCountWithOrds = async (token: string): Promise<number> => {
	const response = await fetch(COBROS_PENDING_COUNT_URL, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
		},
	});

	const payload = await parseResponse(response, 'No fue posible consultar pendientes.');
	const data = payload.data || {};
	return toPositiveInt(data.pending_count, 0);
};

export const approveCobroWithOrds = async (token: string, transactionId: number) => {
	const response = await fetch(`${COBROS_LIST_URL}/${transactionId}/approve`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: '{}',
	});

	const payload = await parseResponse(response, 'No fue posible aprobar el cobro.');
	return {
		message: String(payload.message || 'Seña aprobada.').trim(),
		data: payload.data || null,
	};
};

export const rejectCobroWithOrds = async (
	token: string,
	transactionId: number,
	reason?: string
) => {
	const response = await fetch(`${COBROS_LIST_URL}/${transactionId}/reject`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ reason: reason || null }),
	});

	const payload = await parseResponse(response, 'No fue posible rechazar el comprobante.');
	return {
		message: String(payload.message || 'Comprobante rechazado.').trim(),
		data: payload.data || null,
	};
};

export const markRefundSentWithOrds = async (token: string, transactionId: number) => {
	const response = await fetch(`${COBROS_LIST_URL}/${transactionId}/mark-refund-sent`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: '{}',
	});

	const payload = await parseResponse(response, 'No fue posible marcar el reembolso como enviado.');
	return {
		message: String(payload.message || 'Reembolso marcado como enviado.').trim(),
		data: payload.data || null,
	};
};

export const waiveRefundWithOrds = async (
	token: string,
	transactionId: number,
	reason: string
) => {
	const response = await fetch(`${COBROS_LIST_URL}/${transactionId}/waive-refund`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ reason }),
	});

	const payload = await parseResponse(response, 'No fue posible renunciar al reembolso.');
	return {
		message: String(payload.message || 'Reembolso renunciado.').trim(),
		data: payload.data || null,
	};
};
