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

export interface ServiceFieldError {
	field: string;
	message: string;
}

export interface CreateServicePayload {
	name: string;
	duration_minutes: number;
	price?: number;
	is_active?: 0 | 1;
}

interface CreateServiceSuccessResponse {
	status: 'success';
	message?: string;
	id_service: number;
}

interface ServicesSuccessResponse {
	status: 'success';
	data: unknown[];
}

interface ServicesFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class ServicesApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: ServiceFieldError[];

	constructor(message: string, status = 400, details?: unknown, fieldErrors: ServiceFieldError[] = []) {
		super(message);
		this.name = 'ServicesApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const parseFieldErrors = (value: unknown): ServiceFieldError[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];

		const field = 'field' in item ? String(item.field || '').trim() : '';
		const message = 'message' in item ? String(item.message || '').trim() : '';

		if (!field || !message) return [];
		return [{ field, message }];
	});
};

const fallbackMessageByStatus = (status: number, action: 'list' | 'create') => {
	switch (status) {
		case 400:
		case 422:
			return 'Errores de validacion en los campos enviados.';
		case 401:
			return 'Sesion no autorizada. Inicia sesion nuevamente.';
		case 403:
			return 'No tienes permisos para realizar esta accion.';
		case 404:
			return 'No se encontro el recurso solicitado.';
		case 409:
			return action === 'create'
				? 'Existe un conflicto y no se pudo crear el servicio.'
				: 'Existe un conflicto al consultar los servicios.';
		case 500:
			return 'Error interno del servidor. Intenta nuevamente.';
		default:
			return action === 'create'
				? 'No fue posible crear el servicio.'
				: 'No fue posible obtener el listado de servicios.';
	}
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
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'list'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
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

const parseCreateServiceResponse = async (response: Response) => {
	let data: CreateServiceSuccessResponse | ServicesFailureResponse | null = null;

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
		!('id_service' in data)
	) {
		const failureData = (data ?? {}) as ServicesFailureResponse;
		throw new ServicesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'create'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return {
		id_service: toNumber(data.id_service, 0),
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Servicio creado correctamente.',
	};
};

export const createServiceWithOrds = async (token: string, payload: CreateServicePayload) => {
	if (!token) {
		throw new ServicesApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(SERVICES_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseCreateServiceResponse(response);
};
