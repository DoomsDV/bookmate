// Cliente HTTP del firmador esign (SIFEN) — ver c:\Users\HP\Desktop\firmador\docs\openapi-emision.yaml
//
// Ambiente SIFEN (test/prod) lo determina exclusivamente el prefijo de ESIGN_API_KEY
// (sk_test_... vs sk_prod_...), nunca la URL. Por ahora localhost y staging siempre
// usan una key de TEST (ver .env.development); en producción queda vacía hasta tener
// certificado/timbrado real cargado en el panel esign — mientras esté vacía, la
// integración se comporta como "no configurada" (ver isEsignConfigured) y no debe
// romper ningún flujo de pago que la invoque.

import { resolveOrdsApiUrl } from './env-urls';

const ESIGN_API_BASE_URL = String(import.meta.env.ESIGN_API_BASE_URL || 'https://api-staging.etick.uno').replace(/\/+$/, '');
const ESIGN_API_KEY = String(import.meta.env.ESIGN_API_KEY || '').trim();

export const isEsignConfigured = () => ESIGN_API_KEY.length > 0;

// ORDS interno (X-Service-Token, sin JWT de usuario) — ver
// aox-dev/migrations/20260810_subscription_einvoice_ords.sql.
export const ESIGN_INTERNAL_INVOICES_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_ESIGN_INTERNAL_INVOICES_URL,
	'ORDS_ESIGN_INTERNAL_INVOICES_URL',
	'/internal/subscription-invoices'
);

export class EsignApiError extends Error {
	status: number;
	code?: string;
	details?: unknown;

	constructor(message: string, status = 502, code?: string, details?: unknown) {
		super(message);
		this.name = 'EsignApiError';
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

export type EsignReceptorTipo = 'ci' | 'ruc' | 'innominado' | 'extranjero';

export interface EsignReceptor {
	tipo: EsignReceptorTipo;
	documento?: string;
	dv?: number;
	tipoContribuyente?: number;
	tipoOperacion?: number;
	nombre?: string;
	pais?: string;
	desPais?: string;
	tipoIdentificacion?: number;
}

export interface EsignItem {
	codigo?: string;
	descripcion: string;
	cantidad: number;
	precioUnitario: number;
	afectacionIVA: 1 | 2 | 3 | 4;
	tasaIVA: 10 | 5 | 0;
	unidadMedida?: number;
	desUnidadMedida?: string;
	propIVA?: number;
}

export interface CreateEsignDocumentPayload {
	tipo: 'fe' | 'nce' | 'nde';
	condicion: 'contado' | 'credito';
	plazo?: string;
	datos_operacion?: {
		establecimiento?: string;
		punto_expedicion?: string;
	};
	receptor?: EsignReceptor;
	moneda: string;
	tipoCambio?: number | null;
	items: EsignItem[];
	cdcRef?: string;
	motivo?: number;
}

export interface EsignDocumentResult {
	cdc: string;
	estado: 'APROBADO' | 'RECHAZADO' | 'FIRMADO';
	codRes?: string;
	protAut?: string;
	mensaje?: string;
	qr?: string;
	numeroDocumento?: string;
	ambiente?: string;
}

export interface EsignKudeStatus {
	cdc: string;
	estado: 'pending' | 'ready';
	kudeUrl?: string | null;
}

interface EsignEnvelope<T> {
	success: boolean;
	data: T | null;
	error?: { code?: string; message?: string } | null;
}

const requireApiKey = () => {
	if (!isEsignConfigured()) {
		throw new EsignApiError('ESIGN_API_KEY no configurada.', 500, 'ESIGN_NOT_CONFIGURED');
	}
	return ESIGN_API_KEY;
};

const parseEnvelope = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
	let payload: EsignEnvelope<T> | null = null;
	try {
		payload = (await response.json()) as EsignEnvelope<T>;
	} catch {
		payload = null;
	}

	// El firmador responde 200/201 tanto para APROBADO como para RECHAZADO
	// (el detalle va en data.estado); solo tratamos como error HTTP los
	// status realmente fuera de 2xx (401/403/422/502) o payload sin data.
	if (!response.ok || !payload || payload.success === false || !payload.data) {
		const message = payload?.error?.message || fallbackMessage;
		throw new EsignApiError(message, response.status || 502, payload?.error?.code, payload);
	}

	return payload.data;
};

export const createEsignDocument = async (
	payload: CreateEsignDocumentPayload
): Promise<EsignDocumentResult> => {
	const apiKey = requireApiKey();

	const response = await fetch(`${ESIGN_API_BASE_URL}/v1/documents`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(payload),
	});

	return parseEnvelope<EsignDocumentResult>(response, 'No fue posible emitir la Factura Electrónica.');
};

// Callback hacia los endpoints internos ORDS (protegidos por X-Service-Token,
// ver PKG_AOX_SUBSCRIPTION_BILLING_API.pr_assert_service_token). Se usa tanto
// para confirmar el resultado de la emisión como para reportar el KuDE listo.
export const callEsignInternalOrds = async <T = unknown>(
	path: string,
	init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> => {
	const serviceToken = String(import.meta.env.ESIGN_CALLBACK_SERVICE_TOKEN || '').trim();
	if (!serviceToken) {
		throw new EsignApiError('ESIGN_CALLBACK_SERVICE_TOKEN no configurado.', 500, 'ESIGN_TOKEN_NOT_CONFIGURED');
	}

	const url = `${ESIGN_INTERNAL_INVOICES_URL}${path}`;
	const response = await fetch(url, {
		method: init.method || 'GET',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'X-Service-Token': serviceToken,
		},
		body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
	});

	let payload: any = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	if (!response.ok) {
		throw new EsignApiError(
			String(payload?.message || `ORDS respondió HTTP ${response.status} en ${path}.`),
			response.status,
			'ORDS_INTERNAL_ERROR',
			payload
		);
	}

	return (payload?.data ?? payload) as T;
};

export const getEsignKudeStatus = async (cdc: string): Promise<EsignKudeStatus> => {
	const apiKey = requireApiKey();
	const cleanCdc = String(cdc || '').trim();
	if (!cleanCdc) {
		throw new EsignApiError('Falta el CDC para consultar el KuDE.', 400, 'MISSING_CDC');
	}

	const response = await fetch(`${ESIGN_API_BASE_URL}/v1/documents/${encodeURIComponent(cleanCdc)}/kude`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
	});

	return parseEnvelope<EsignKudeStatus>(response, 'No fue posible consultar el KuDE.');
};
