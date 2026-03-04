const DEFAULT_SERVICES_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/services';

export const SERVICES_URL = import.meta.env.ORDS_SERVICES_URL ?? DEFAULT_SERVICES_URL;

export interface Service {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
	is_active: 0 | 1;
	created_at: string;
}

interface ServicesSuccessResponse {
	status: 'success';
	data: unknown[];
}

interface ServicesFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

export class ServicesApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'ServicesApiError';
		this.status = status;
		this.details = details;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeService = (value: unknown): Service | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idService = toNumber(source.id_service, NaN);

	if (!Number.isFinite(idService)) return null;

	return {
		id_service: idService,
		name: String(source.name || '').trim(),
		duration_minutes: toNumber(source.duration_minutes),
		price: toNumber(source.price),
		is_active: source.is_active === 1 || source.is_active === '1' || source.is_active === true ? 1 : 0,
		created_at: String(source.created_at || ''),
	};
};

const parseServicesResponse = async (response: Response) => {
	let data: ServicesSuccessResponse | ServicesFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new ServicesApiError('No fue posible interpretar la respuesta del servidor de servicios.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		const failureData = (data ?? {}) as ServicesFailureResponse;
		throw new ServicesApiError(
			failureData.message || 'No fue posible obtener el listado de servicios.',
			response.status || 400,
			failureData.details
		);
	}

	return data.data
		.map(normalizeService)
		.filter((service): service is Service => service !== null);
};

export const listServices = async (token: string) => {
	if (!token) {
		throw new ServicesApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(SERVICES_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseServicesResponse(response);
};
