import { resolveOrdsApiUrl } from './env-urls';

const OPS_DISPUTES_BASE = resolveOrdsApiUrl(
	import.meta.env.ORDS_OPS_DISPUTES_URL,
	'ORDS_OPS_DISPUTES_URL',
	'/ops/disputes'
);

const OPS_ORGS_BASE = resolveOrdsApiUrl(
	import.meta.env.ORDS_OPS_ORGS_URL,
	'ORDS_OPS_ORGS_URL',
	'/ops/orgs'
);

export type OpsResolutionCode = 'SETTLED' | 'DISMISS' | 'ADVERSE' | 'ISSUE_CREDIT';

export class OpsApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'OpsApiError';
		this.status = status;
		this.details = details;
	}
}

const parseResponse = async (response: Response, fallbackMessage: string) => {
	let payload: { status?: string; message?: string; data?: unknown } | null = null;
	try {
		payload = (await response.json()) as { status?: string; message?: string; data?: unknown };
	} catch {
		payload = null;
	}

	if (!response.ok || (payload && payload.status && payload.status !== 'success')) {
		const message =
			payload && typeof payload === 'object' ? String(payload.message || '').trim() : '';
		throw new OpsApiError(message || fallbackMessage, response.status || 500, payload);
	}

	return payload || {};
};

export const resolveOpsDisputeWithOrds = async (
	token: string,
	disputeId: number,
	payload: { resolution_code: OpsResolutionCode; notes?: string }
) => {
	if (!Number.isInteger(disputeId) || disputeId <= 0) {
		throw new OpsApiError('ID de disputa inválido.', 400);
	}

	const response = await fetch(`${OPS_DISPUTES_BASE}/${disputeId}/resolve`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			resolution_code: payload.resolution_code,
			notes: String(payload.notes || '').trim() || null,
		}),
	});

	const result = await parseResponse(response, 'No fue posible resolver la disputa.');
	return {
		message: String(result.message || 'Disputa resuelta.').trim(),
		data: result.data || null,
	};
};

export const restoreOpsEnforcementWithOrds = async (
	token: string,
	orgId: number,
	reason: string
) => {
	if (!Number.isInteger(orgId) || orgId <= 0) {
		throw new OpsApiError('ID de organización inválido.', 400);
	}
	const trimmed = String(reason || '').trim();
	if (trimmed.length < 5) {
		throw new OpsApiError('Indica un motivo de al menos 5 caracteres.', 400);
	}

	const response = await fetch(`${OPS_ORGS_BASE}/${orgId}/enforcement/restore`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ reason: trimmed }),
	});

	const result = await parseResponse(response, 'No fue posible restaurar las sanciones.');
	return {
		message: String(result.message || 'Sanciones restauradas.').trim(),
		data: result.data || null,
	};
};
