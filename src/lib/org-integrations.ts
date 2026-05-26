import { resolveOrdsApiUrl } from './env-urls';

export const ORG_INTEGRATIONS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_ORG_INTEGRATIONS_URL,
	'ORDS_ORG_INTEGRATIONS_URL',
	'/org-integrations'
);

export interface PagoparIntegrationPayload {
	provider: 'pagopar';
	public_key: string;
	private_key: string;
}

export interface PagoparIntegrationData {
	provider: 'pagopar';
	public_key: string;
	private_key_configured: boolean;
	is_active?: 0 | 1;
	updated_at?: string;
}

interface OrdsSuccessResponse {
	status?: string;
	message?: string;
	data?: unknown;
}

interface OrdsFailureResponse {
	status?: string;
	message?: string;
	errors?: unknown;
	details?: unknown;
}

export class OrgIntegrationsApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: { field: string; message: string }[];

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'OrgIntegrationsApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = [];
	}
}

const requireEnv = (value: string, envName: string) => {
	const trimmed = String(value || '').trim();
	if (!trimmed) throw new Error(`Missing required environment variable: ${envName}`);
	return trimmed;
};

const buildProviderUrl = (provider: string) => {
	const base = String(ORG_INTEGRATIONS_URL || '').trim();
	if (!base) return '';
	return `${base.replace(/\/+$/, '')}/${encodeURIComponent(provider)}`;
};

const parseResponse = async (response: Response, fallbackMessage: string) => {
	let payload: OrdsSuccessResponse | OrdsFailureResponse | null = null;
	try {
		payload = (await response.json()) as any;
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message = payload && typeof payload === 'object' ? String((payload as any).message || '') : '';
		throw new OrgIntegrationsApiError(message || fallbackMessage, response.status || 500, payload);
	}

	return payload || {};
};

export const getPagoparIntegrationWithOrds = async (token: string): Promise<PagoparIntegrationData> => {
	const url = buildProviderUrl('pagopar');
	if (!url) {
		throw new OrgIntegrationsApiError('Falta configurar ORDS_ORG_INTEGRATIONS_URL.', 500);
	}

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
		},
	});

	const data = await parseResponse(response, 'No fue posible cargar la integración de Pagopar.');
	const raw = (data as any).data ?? null;
	if (!raw || typeof raw !== 'object') {
		throw new OrgIntegrationsApiError('Respuesta inválida del servidor.', 502, data);
	}

	return {
		provider: 'pagopar',
		public_key: String((raw as any).public_key || '').trim(),
		private_key_configured: Boolean((raw as any).private_key_configured),
		is_active: Number((raw as any).is_active) === 0 ? 0 : 1,
		updated_at: String((raw as any).updated_at || '').trim() || undefined,
	};
};

export const savePagoparIntegrationWithOrds = async (token: string, payload: PagoparIntegrationPayload) => {
	const url = buildProviderUrl('pagopar');
	if (!url) {
		throw new OrgIntegrationsApiError('Falta configurar ORDS_ORG_INTEGRATIONS_URL.', 500);
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

	const data = await parseResponse(response, 'No fue posible guardar la integración de Pagopar.');
	return {
		message: String((data as any).message || '').trim() || 'Integración guardada correctamente.',
	};
};

export const deletePagoparIntegrationWithOrds = async (token: string) => {
	const url = buildProviderUrl('pagopar');
	if (!url) {
		throw new OrgIntegrationsApiError('Falta configurar ORDS_ORG_INTEGRATIONS_URL.', 500);
	}

	const response = await fetch(url, {
		method: 'DELETE',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
		},
	});

	const data = await parseResponse(response, 'No fue posible eliminar la integración de Pagopar.');
	return {
		message: String((data as any).message || '').trim() || 'Integración eliminada correctamente.',
	};
};

