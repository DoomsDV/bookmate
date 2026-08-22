import { resolveOrdsApiUrl } from './env-urls';
import {
	normalizeFindingCode as normalizeCatalogFindingCode,
	normalizeVisualKind,
	type OdontogramClinicalPhase,
	type OdontogramVisualKind,
} from './odontogram-catalog';

const ODONTOGRAM_URL_TEMPLATE = resolveOrdsApiUrl(
	import.meta.env.ORDS_CUSTOMER_ODONTOGRAM_URL,
	'ORDS_CUSTOMER_ODONTOGRAM_URL',
	'/workspace/customers/:id/odontogram'
);

export const getOdontogramUrl = (customerId: number | string) =>
	ODONTOGRAM_URL_TEMPLATE.replace(':id', encodeURIComponent(String(customerId)));

export const getOdontogramVoidUrl = (customerId: number | string, eventId: number | string) =>
	`${getOdontogramUrl(customerId)}/${encodeURIComponent(String(eventId))}/void`;

export type { OdontogramClinicalPhase, OdontogramVisualKind };

export type OdontogramFindingCode = string;

export interface OdontogramFaces {
	occlusal: boolean;
	vestibular: boolean;
	palatal: boolean;
	mesial: boolean;
	distal: boolean;
}

export interface OdontogramCatalogItem {
	code: string;
	label: string;
	clinical_phase: OdontogramClinicalPhase;
	needs_faces: boolean;
	color: string | null;
	visual_kind: OdontogramVisualKind;
	priority_rank: number;
}

export interface OdontogramEvent {
	id_event: number;
	tooth_fdi: number;
	finding_code: string;
	clinical_phase: OdontogramClinicalPhase;
	notes: string | null;
	created_at: string;
	faces: OdontogramFaces;
}

export interface OdontogramTooth {
	tooth_fdi: number;
	finding_code: string;
	clinical_phase: OdontogramClinicalPhase;
	notes: string | null;
	created_at: string;
	faces: OdontogramFaces;
}

export interface OdontogramChart {
	entitled: boolean;
	teeth: OdontogramTooth[];
	events: OdontogramEvent[];
	catalog: OdontogramCatalogItem[];
}

export interface AddOdontogramEventPayload {
	tooth_fdi: number;
	finding_code: string;
	notes?: string | null;
	faces: OdontogramFaces;
}

export class OdontogramApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'OdontogramApiError';
		this.status = status;
		this.details = details;
	}
}

interface OdontogramSuccessResponse {
	status: 'success';
	data?: unknown;
}

interface OdontogramFailureResponse {
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

const normalizeFaces = (value: unknown): OdontogramFaces => {
	const source = (value ?? {}) as Record<string, unknown>;
	return {
		occlusal: toBool(source.occlusal),
		vestibular: toBool(source.vestibular),
		palatal: toBool(source.palatal),
		mesial: toBool(source.mesial),
		distal: toBool(source.distal),
	};
};

const normalizeClinicalPhase = (value: unknown): OdontogramClinicalPhase => {
	const phase = String(value || '').trim().toUpperCase();
	if (phase === 'PREEXISTING' || phase === 'PLAN') return phase;
	return 'FINDING';
};

const normalizeCatalogItem = (value: unknown): OdontogramCatalogItem | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const code = normalizeCatalogFindingCode(source.code ?? source.finding_code);
	if (!code) return null;
	return {
		code,
		label: String(source.label || code).trim() || code,
		clinical_phase: normalizeClinicalPhase(source.clinical_phase),
		needs_faces: toBool(source.needs_faces),
		color: toNullableString(source.color),
		visual_kind: normalizeVisualKind(source.visual_kind),
		priority_rank: toNumber(source.priority_rank, 50),
	};
};

const normalizeTooth = (value: unknown): OdontogramTooth | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const toothFdi = toNumber(source.tooth_fdi, NaN);
	const findingCode = normalizeCatalogFindingCode(source.finding_code);
	if (!Number.isInteger(toothFdi) || toothFdi <= 0 || !findingCode) return null;

	return {
		tooth_fdi: toothFdi,
		finding_code: findingCode,
		clinical_phase: normalizeClinicalPhase(source.clinical_phase),
		notes: toNullableString(source.notes),
		created_at: String(source.created_at || '').trim(),
		faces: normalizeFaces(source.faces),
	};
};

const normalizeEvent = (value: unknown): OdontogramEvent | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const idEvent = toNumber(source.id_event, NaN);
	const tooth = normalizeTooth(source);
	if (!Number.isInteger(idEvent) || idEvent <= 0 || !tooth) return null;

	return {
		id_event: idEvent,
		tooth_fdi: tooth.tooth_fdi,
		finding_code: tooth.finding_code,
		clinical_phase: tooth.clinical_phase,
		notes: tooth.notes,
		created_at: tooth.created_at,
		faces: tooth.faces,
	};
};

const normalizeChart = (value: unknown): OdontogramChart => {
	const source = (value ?? {}) as Record<string, unknown>;
	const teethRaw = Array.isArray(source.teeth) ? source.teeth : [];
	const eventsRaw = Array.isArray(source.events) ? source.events : [];
	const catalogRaw = Array.isArray(source.catalog) ? source.catalog : [];

	return {
		entitled: toBool(source.entitled),
		teeth: teethRaw.flatMap((item) => {
			const normalized = normalizeTooth(item);
			return normalized ? [normalized] : [];
		}),
		events: eventsRaw.flatMap((item) => {
			const normalized = normalizeEvent(item);
			return normalized ? [normalized] : [];
		}),
		catalog: catalogRaw.flatMap((item) => {
			const normalized = normalizeCatalogItem(item);
			return normalized ? [normalized] : [];
		}),
	};
};

const parseOrdsData = async <T>(response: Response, normalize: (data: unknown) => T): Promise<T> => {
	let body: OdontogramSuccessResponse | OdontogramFailureResponse | null = null;
	try {
		body = await response.json();
	} catch {
		throw new OdontogramApiError('No fue posible interpretar la respuesta del servidor.', 502);
	}

	if (!body || typeof body !== 'object' || body.status !== 'success' || !('data' in body)) {
		const failure = (body ?? {}) as OdontogramFailureResponse;
		throw new OdontogramApiError(
			(typeof failure.message === 'string' && failure.message.trim()) ||
				'No fue posible completar la solicitud.',
			response.status && response.status >= 400 ? response.status : 400,
			failure.details
		);
	}

	return normalize((body as OdontogramSuccessResponse).data);
};

export const getOdontogramWithOrds = async (
	token: string,
	customerId: number
): Promise<OdontogramChart> => {
	if (!token) throw new OdontogramApiError('Token de acceso requerido.', 401);
	if (!Number.isInteger(customerId) || customerId <= 0) {
		throw new OdontogramApiError('ID de cliente inválido.', 400);
	}

	const response = await fetch(getOdontogramUrl(customerId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseOrdsData(response, normalizeChart);
};

export const addOdontogramEventWithOrds = async (
	token: string,
	customerId: number,
	payload: AddOdontogramEventPayload
): Promise<OdontogramEvent> => {
	if (!token) throw new OdontogramApiError('Token de acceso requerido.', 401);
	if (!Number.isInteger(customerId) || customerId <= 0) {
		throw new OdontogramApiError('ID de cliente inválido.', 400);
	}

	const response = await fetch(getOdontogramUrl(customerId), {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			tooth_fdi: payload.tooth_fdi,
			finding_code: payload.finding_code,
			notes: payload.notes ?? null,
			faces: {
				occlusal: payload.faces.occlusal ? 1 : 0,
				vestibular: payload.faces.vestibular ? 1 : 0,
				palatal: payload.faces.palatal ? 1 : 0,
				mesial: payload.faces.mesial ? 1 : 0,
				distal: payload.faces.distal ? 1 : 0,
			},
		}),
	});

	return parseOrdsData(response, (data) => {
		const normalized = normalizeEvent(data);
		if (!normalized) {
			throw new OdontogramApiError('No fue posible interpretar el evento del odontograma.', 502);
		}
		return normalized;
	});
};

export const voidOdontogramEventWithOrds = async (
	token: string,
	customerId: number,
	eventId: number
): Promise<void> => {
	if (!token) throw new OdontogramApiError('Token de acceso requerido.', 401);
	if (!Number.isInteger(customerId) || customerId <= 0) {
		throw new OdontogramApiError('ID de cliente inválido.', 400);
	}
	if (!Number.isInteger(eventId) || eventId <= 0) {
		throw new OdontogramApiError('Evento de odontograma inválido.', 400);
	}

	const response = await fetch(getOdontogramVoidUrl(customerId, eventId), {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: '{}',
	});

	let body: OdontogramSuccessResponse | OdontogramFailureResponse | null = null;
	try {
		body = await response.json();
	} catch {
		throw new OdontogramApiError('No fue posible interpretar la respuesta del servidor.', 502);
	}

	if (!body || typeof body !== 'object' || body.status !== 'success') {
		const failure = (body ?? {}) as OdontogramFailureResponse;
		throw new OdontogramApiError(
			(typeof failure.message === 'string' && failure.message.trim()) ||
				'No fue posible anular el registro del odontograma.',
			response.status && response.status >= 400 ? response.status : 400,
			failure.details
		);
	}
};
