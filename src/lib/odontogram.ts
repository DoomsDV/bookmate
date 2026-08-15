import { resolveOrdsApiUrl } from './env-urls';

const ODONTOGRAM_URL_TEMPLATE = resolveOrdsApiUrl(
	import.meta.env.ORDS_CUSTOMER_ODONTOGRAM_URL,
	'ORDS_CUSTOMER_ODONTOGRAM_URL',
	'/workspace/customers/:id/odontogram'
);

export const getOdontogramUrl = (customerId: number | string) =>
	ODONTOGRAM_URL_TEMPLATE.replace(':id', encodeURIComponent(String(customerId)));

export type OdontogramFindingCode = 'CARIES' | 'RESTORATION' | 'EXTRACTION' | 'CROWN';

export interface OdontogramFaces {
	occlusal: boolean;
	vestibular: boolean;
	palatal: boolean;
	mesial: boolean;
	distal: boolean;
}

export interface OdontogramEvent {
	id_event: number;
	tooth_fdi: number;
	finding_code: OdontogramFindingCode;
	notes: string | null;
	created_at: string;
	faces: OdontogramFaces;
}

export interface OdontogramTooth {
	tooth_fdi: number;
	finding_code: OdontogramFindingCode;
	notes: string | null;
	created_at: string;
	faces: OdontogramFaces;
}

export interface OdontogramChart {
	entitled: boolean;
	teeth: OdontogramTooth[];
	events: OdontogramEvent[];
}

export interface AddOdontogramEventPayload {
	tooth_fdi: number;
	finding_code: OdontogramFindingCode;
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

const FINDING_CODES = new Set<OdontogramFindingCode>([
	'CARIES',
	'RESTORATION',
	'EXTRACTION',
	'CROWN',
]);

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

const normalizeFindingCode = (value: unknown): OdontogramFindingCode | null => {
	const code = String(value || '').trim().toUpperCase() as OdontogramFindingCode;
	return FINDING_CODES.has(code) ? code : null;
};

const normalizeTooth = (value: unknown): OdontogramTooth | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const toothFdi = toNumber(source.tooth_fdi, NaN);
	const findingCode = normalizeFindingCode(source.finding_code);
	if (!Number.isInteger(toothFdi) || toothFdi <= 0 || !findingCode) return null;

	return {
		tooth_fdi: toothFdi,
		finding_code: findingCode,
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
		notes: tooth.notes,
		created_at: tooth.created_at,
		faces: tooth.faces,
	};
};

const normalizeChart = (value: unknown): OdontogramChart => {
	const source = (value ?? {}) as Record<string, unknown>;
	const teethRaw = Array.isArray(source.teeth) ? source.teeth : [];
	const eventsRaw = Array.isArray(source.events) ? source.events : [];

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
