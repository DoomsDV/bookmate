const DEFAULT_SERVICES_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/services';
const DEFAULT_SERVICES_LOV_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/services/lov';

export const SERVICES_URL = import.meta.env.ORDS_SERVICES_URL ?? DEFAULT_SERVICES_URL;
export const SERVICES_LOV_URL = import.meta.env.ORDS_SERVICES_LOV_URL ?? DEFAULT_SERVICES_LOV_URL;

export interface Service {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
	is_active: 0 | 1;
	created_at: string;
}

export interface ServiceLov {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
}

export interface ServicesListMeta {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
}

export interface ServicesListResult {
	data: Service[];
	meta: ServicesListMeta;
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

interface ServiceSuccessResponse {
	status: 'success';
	data: unknown;
}

interface ServiceActionSuccessResponse {
	status: 'success';
	message?: string;
}

interface ServicesSuccessResponse {
	status: 'success';
	data: unknown[];
	meta?: unknown;
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

const fallbackMessageByStatus = (
	status: number,
	action: 'list' | 'get' | 'create' | 'update' | 'delete'
) => {
	switch (status) {
		case 400:
		case 422:
			return 'Errores de validacion en los campos enviados.';
		case 401:
			return 'Sesion no autorizada. Inicia sesion nuevamente.';
		case 403:
			return 'No tienes permisos para realizar esta accion.';
		case 404:
			return action === 'get'
				? 'Servicio no encontrado.'
				: 'No se encontro el recurso solicitado.';
		case 409:
			if (action === 'create') return 'Existe un conflicto y no se pudo crear el servicio.';
			if (action === 'delete')
				return 'No se puede eliminar el servicio porque esta siendo utilizado en otros registros.';
			return 'Existe un conflicto al procesar la solicitud.';
		case 500:
			return 'Error interno del servidor. Intenta nuevamente.';
		default:
			if (action === 'create') return 'No fue posible crear el servicio.';
			if (action === 'update') return 'No fue posible actualizar el servicio.';
			if (action === 'delete') return 'No fue posible eliminar el servicio.';
			if (action === 'get') return 'No fue posible obtener el servicio.';
			return 'No fue posible obtener el listado de servicios.';
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

const normalizeServiceLov = (value: unknown): ServiceLov | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idService = toNumber(source.id_service, NaN);
	if (!Number.isFinite(idService)) return null;

	return {
		id_service: idService,
		name: String(source.name || '').trim(),
		duration_minutes: toNumber(source.duration_minutes),
		price: toNumber(source.price),
	};
};

const normalizeMeta = (
	value: unknown,
	fallback: { page: number; limit: number; totalRecords: number }
): ServicesListMeta => {
	if (!value || typeof value !== 'object') {
		return {
			current_page: fallback.page,
			per_page: fallback.limit,
			total_records: fallback.totalRecords,
			total_pages: Math.max(1, Math.ceil(fallback.totalRecords / fallback.limit)),
		};
	}

	const source = value as Record<string, unknown>;
	const currentPage = toNumber(source.current_page, fallback.page);
	const perPage = toNumber(source.per_page, fallback.limit);
	const totalRecords = toNumber(source.total_records, fallback.totalRecords);
	const totalPages = toNumber(
		source.total_pages,
		Math.max(1, Math.ceil(Math.max(0, totalRecords) / Math.max(1, perPage)))
	);

	return {
		current_page: Math.max(1, Math.floor(currentPage)),
		per_page: Math.max(1, Math.floor(perPage)),
		total_records: Math.max(0, Math.floor(totalRecords)),
		total_pages: Math.max(1, Math.floor(totalPages)),
	};
};

const parseServicesResponse = async (
	response: Response,
	pagination: { page: number; limit: number }
): Promise<ServicesListResult> => {
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

	const normalizedServices = data.data
		.map(normalizeService)
		.filter((service): service is Service => service !== null);

	return {
		data: normalizedServices,
		meta: normalizeMeta(data.meta, {
			page: pagination.page,
			limit: pagination.limit,
			totalRecords: normalizedServices.length,
		}),
	};
};

export const listServices = async (
	token: string,
	options: { page?: number; limit?: number } = {}
): Promise<ServicesListResult> => {
	if (!token) {
		throw new ServicesApiError('Token de acceso requerido.', 401);
	}

	const page = Number.isInteger(options.page) && Number(options.page) > 0 ? Number(options.page) : 1;
	const limit =
		Number.isInteger(options.limit) && Number(options.limit) > 0 ? Number(options.limit) : 9;

	const serviceUrl = new URL(SERVICES_URL);
	serviceUrl.searchParams.set('page', String(page));
	serviceUrl.searchParams.set('limit', String(limit));

	const response = await fetch(serviceUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseServicesResponse(response, { page, limit });
};

const parseServicesLovResponse = async (response: Response): Promise<ServiceLov[]> => {
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
				'No fue posible obtener el listado de servicios activos.',
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return data.data.map(normalizeServiceLov).filter((service): service is ServiceLov => service !== null);
};

export const listServicesLovWithOrds = async (token: string): Promise<ServiceLov[]> => {
	if (!token) {
		throw new ServicesApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(SERVICES_LOV_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseServicesLovResponse(response);
};

const parseServiceResponse = async (response: Response) => {
	let data: ServiceSuccessResponse | ServicesFailureResponse | null = null;

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
		!('data' in data)
	) {
		const failureData = (data ?? {}) as ServicesFailureResponse;
		throw new ServicesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'get'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const normalized = normalizeService(data.data);
	if (!normalized) {
		throw new ServicesApiError('No fue posible interpretar el servicio solicitado.', 502);
	}

	return normalized;
};

const parseServiceActionResponse = async (
	response: Response,
	action: 'update' | 'delete'
) => {
	let data: ServiceActionSuccessResponse | ServicesFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new ServicesApiError('No fue posible interpretar la respuesta del servidor de servicios.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as ServicesFailureResponse;
		throw new ServicesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, action),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	if (typeof data.message === 'string' && data.message.trim()) {
		return { message: data.message };
	}

	return {
		message:
			action === 'update'
				? 'Servicio actualizado correctamente.'
				: 'Servicio eliminado correctamente.',
	};
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

const getServiceUrlById = (serviceId: number) => `${SERVICES_URL}/${serviceId}`;

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

export const getServiceByIdWithOrds = async (token: string, serviceId: number) => {
	if (!token) {
		throw new ServicesApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(serviceId) || serviceId <= 0) {
		throw new ServicesApiError('ID de servicio invalido.', 400);
	}

	const response = await fetch(getServiceUrlById(serviceId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseServiceResponse(response);
};

export const updateServiceWithOrds = async (
	token: string,
	serviceId: number,
	payload: CreateServicePayload
) => {
	if (!token) {
		throw new ServicesApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(serviceId) || serviceId <= 0) {
		throw new ServicesApiError('ID de servicio invalido.', 400);
	}

	const response = await fetch(getServiceUrlById(serviceId), {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseServiceActionResponse(response, 'update');
};

export const deleteServiceWithOrds = async (token: string, serviceId: number) => {
	if (!token) {
		throw new ServicesApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(serviceId) || serviceId <= 0) {
		throw new ServicesApiError('ID de servicio invalido.', 400);
	}

	const response = await fetch(getServiceUrlById(serviceId), {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseServiceActionResponse(response, 'delete');
};
