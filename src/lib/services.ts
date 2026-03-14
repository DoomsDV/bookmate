import { resolveOrdsApiUrl } from './env-urls';

export const SERVICES_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SERVICES_URL,
	'ORDS_SERVICES_URL',
	'/services'
);
export const SERVICES_LOV_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_SERVICES_LOV_URL,
	'ORDS_SERVICES_LOV_URL',
	'/services/lov'
);

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

interface ServicesFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

interface ServicesSuccessResponse {
	status: 'success';
	message?: string;
	data?: unknown;
	meta?: unknown;
	id_service?: unknown;
}

type ServicesResponseBody = ServicesSuccessResponse | ServicesFailureResponse;

type ServiceRequestAction = 'list' | 'listLov' | 'get' | 'create' | 'update' | 'delete';

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

const fallbackMessageByStatus = (status: number, action: ServiceRequestAction) => {
	switch (status) {
		case 400:
		case 422:
			return 'Errores de validacion en los campos enviados.';
		case 401:
			return 'Sesion no autorizada. Inicia sesion nuevamente.';
		case 403:
			return 'No tienes permisos para realizar esta accion.';
		case 404:
			return action === 'get' ? 'Servicio no encontrado.' : 'No se encontro el recurso solicitado.';
		case 409:
			if (action === 'create') return 'Existe un conflicto y no se pudo crear el servicio.';
			if (action === 'delete') {
				return 'No se puede eliminar el servicio porque esta siendo utilizado en otros registros.';
			}
			return 'Existe un conflicto al procesar la solicitud.';
		case 500:
			return 'Error interno del servidor. Intenta nuevamente.';
		default:
			if (action === 'create') return 'No fue posible crear el servicio.';
			if (action === 'update') return 'No fue posible actualizar el servicio.';
			if (action === 'delete') return 'No fue posible eliminar el servicio.';
			if (action === 'get') return 'No fue posible obtener el servicio.';
			if (action === 'listLov') return 'No fue posible obtener el listado de servicios activos.';
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

const resolveErrorMessage = (body: ServicesResponseBody, status: number, action: ServiceRequestAction) => {
	if (typeof body?.message === 'string' && body.message.trim()) {
		return body.message;
	}
	return fallbackMessageByStatus(status, action);
};

const isSuccessResponse = (body: ServicesResponseBody | null): body is ServicesSuccessResponse => {
	return Boolean(body && typeof body === 'object' && body.status === 'success');
};

const getServiceUrlById = (serviceId: number) => `${SERVICES_URL}/${serviceId}`;

export class ServicesClient {
	private token: string;

	constructor(token: string) {
		if (!token) {
			throw new ServicesApiError('Token de acceso requerido.', 401);
		}
		this.token = token;
	}

	private async request(
		url: string,
		options: RequestInit,
		action: ServiceRequestAction
	): Promise<{ response: Response; data: ServicesSuccessResponse }> {
		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: 'application/json',
				...(options.headers || {}),
			},
		});

		let body: ServicesResponseBody | null = null;
		try {
			body = (await response.json()) as ServicesResponseBody;
		} catch {
			throw new ServicesApiError('No fue posible interpretar la respuesta del servidor de servicios.', 502);
		}

		if (!response.ok || !isSuccessResponse(body)) {
			const status = response.status || 400;
			const failureData: ServicesFailureResponse =
				!body || typeof body !== 'object'
					? {}
					: body.status === 'success'
						? { message: body.message }
						: body;

			throw new ServicesApiError(
				resolveErrorMessage(failureData, status, action),
				status,
				failureData.details,
				parseFieldErrors(failureData.errors)
			);
		}

		return { response, data: body };
	}

	async list(page = 1, limit = 9): Promise<ServicesListResult> {
		const safePage = Number.isInteger(page) && page > 0 ? page : 1;
		const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 9;

		const serviceUrl = new URL(SERVICES_URL);
		serviceUrl.searchParams.set('page', String(safePage));
		serviceUrl.searchParams.set('limit', String(safeLimit));

		const { response, data } = await this.request(serviceUrl.toString(), { method: 'GET' }, 'list');
		if (!Array.isArray(data.data)) {
			throw new ServicesApiError(fallbackMessageByStatus(response.status || 400, 'list'), response.status || 400);
		}

		const normalizedServices = data.data
			.map(normalizeService)
			.filter((service): service is Service => service !== null);

		return {
			data: normalizedServices,
			meta: normalizeMeta(data.meta, {
				page: safePage,
				limit: safeLimit,
				totalRecords: normalizedServices.length,
			}),
		};
	}

	async listLov(): Promise<ServiceLov[]> {
		const { response, data } = await this.request(SERVICES_LOV_URL, { method: 'GET' }, 'listLov');
		if (!Array.isArray(data.data)) {
			throw new ServicesApiError(
				fallbackMessageByStatus(response.status || 400, 'listLov'),
				response.status || 400
			);
		}

		return data.data.map(normalizeServiceLov).filter((service): service is ServiceLov => service !== null);
	}

	async getById(serviceId: number): Promise<Service> {
		if (!Number.isInteger(serviceId) || serviceId <= 0) {
			throw new ServicesApiError('ID de servicio invalido.', 400);
		}

		const { data } = await this.request(getServiceUrlById(serviceId), { method: 'GET' }, 'get');
		const normalized = normalizeService(data.data);
		if (!normalized) {
			throw new ServicesApiError('No fue posible interpretar el servicio solicitado.', 502);
		}

		return normalized;
	}

	async create(payload: CreateServicePayload): Promise<{ id_service: number; message: string }> {
		const { response, data } = await this.request(
			SERVICES_URL,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			},
			'create'
		);

		if (!('id_service' in data)) {
			throw new ServicesApiError(
				fallbackMessageByStatus(response.status || 400, 'create'),
				response.status || 400
			);
		}

		return {
			id_service: toNumber(data.id_service, 0),
			message:
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Servicio creado correctamente.',
		};
	}

	async update(serviceId: number, payload: CreateServicePayload): Promise<{ message: string }> {
		if (!Number.isInteger(serviceId) || serviceId <= 0) {
			throw new ServicesApiError('ID de servicio invalido.', 400);
		}

		const { data } = await this.request(
			getServiceUrlById(serviceId),
			{
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			},
			'update'
		);

		return {
			message:
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Servicio actualizado correctamente.',
		};
	}

	async delete(serviceId: number): Promise<{ message: string }> {
		if (!Number.isInteger(serviceId) || serviceId <= 0) {
			throw new ServicesApiError('ID de servicio invalido.', 400);
		}

		const { data } = await this.request(getServiceUrlById(serviceId), { method: 'DELETE' }, 'delete');

		return {
			message:
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Servicio eliminado correctamente.',
		};
	}
}

export const listServices = async (
	token: string,
	options: { page?: number; limit?: number } = {}
): Promise<ServicesListResult> => {
	const apiClient = new ServicesClient(token);
	return apiClient.list(options.page, options.limit);
};

export const listServicesLovWithOrds = async (token: string): Promise<ServiceLov[]> => {
	const apiClient = new ServicesClient(token);
	return apiClient.listLov();
};

export const createServiceWithOrds = async (token: string, payload: CreateServicePayload) => {
	const apiClient = new ServicesClient(token);
	return apiClient.create(payload);
};

export const getServiceByIdWithOrds = async (token: string, serviceId: number) => {
	const apiClient = new ServicesClient(token);
	return apiClient.getById(serviceId);
};

export const updateServiceWithOrds = async (
	token: string,
	serviceId: number,
	payload: CreateServicePayload
) => {
	const apiClient = new ServicesClient(token);
	return apiClient.update(serviceId, payload);
};

export const deleteServiceWithOrds = async (token: string, serviceId: number) => {
	const apiClient = new ServicesClient(token);
	return apiClient.delete(serviceId);
};

