import { resolveOrdsApiUrl } from './env-urls';

export const LOCATIONS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_LOCATIONS_URL,
	'ORDS_LOCATIONS_URL',
	'/locations'
);

export interface LocationCity {
	id_city: number;
	name: string;
}

export interface LocationDepartment {
	id_department: number;
	name: string;
}

export interface Location {
	id_location: number;
	name: string;
	address: string;
	city: LocationCity;
	department: LocationDepartment;
	latitude: number | null;
	longitude: number | null;
	is_active: 0 | 1;
	created_at: string;
}

export interface LocationsListMeta {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
}

export interface LocationsListResult {
	data: Location[];
	meta: LocationsListMeta;
}

export interface LocationFieldError {
	field: string;
	message: string;
}

export interface CreateLocationPayload {
	name: string;
	address: string;
	cit_id_city: number;
	dep_id_department: number;
	latitude?: number;
	longitude?: number;
	is_active?: 0 | 1;
}

interface LocationsFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

interface LocationsSuccessResponse {
	status: 'success';
	message?: string;
	data?: unknown;
	meta?: unknown;
	id_location?: unknown;
}

type LocationsResponseBody = LocationsSuccessResponse | LocationsFailureResponse;

type LocationRequestAction = 'list' | 'get' | 'create' | 'update' | 'delete';

export class LocationsApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: LocationFieldError[];

	constructor(message: string, status = 400, details?: unknown, fieldErrors: LocationFieldError[] = []) {
		super(message);
		this.name = 'LocationsApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableNumber = (value: unknown) => {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const parseFieldErrors = (value: unknown): LocationFieldError[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];

		const field = 'field' in item ? String(item.field || '').trim() : '';
		const message = 'message' in item ? String(item.message || '').trim() : '';

		if (!field || !message) return [];
		return [{ field, message }];
	});
};

const fallbackMessageByStatus = (status: number, action: LocationRequestAction) => {
	switch (status) {
		case 400:
		case 422:
			return 'Errores de validacion en los campos enviados.';
		case 401:
			return 'Sesion no autorizada. Inicia sesion nuevamente.';
		case 403:
			return 'No tienes permisos para realizar esta accion.';
		case 404:
			return action === 'get' ? 'Sucursal no encontrada.' : 'No se encontro el recurso solicitado.';
		case 409:
			if (action === 'create') return 'Existe un conflicto y no se pudo crear la sucursal.';
			if (action === 'delete') {
				return 'No se puede eliminar la sucursal porque esta siendo utilizada en otros registros.';
			}
			return 'Existe un conflicto al procesar la solicitud.';
		case 500:
			return 'Error interno del servidor. Intenta nuevamente.';
		default:
			if (action === 'create') return 'No fue posible crear la sucursal.';
			if (action === 'update') return 'No fue posible actualizar la sucursal.';
			if (action === 'delete') return 'No fue posible eliminar la sucursal.';
			if (action === 'get') return 'No fue posible obtener la sucursal.';
			return 'No fue posible obtener el listado de sucursales.';
	}
};

const normalizeCity = (value: unknown): LocationCity => {
	if (!value || typeof value !== 'object') {
		return {
			id_city: 0,
			name: '',
		};
	}

	const source = value as Record<string, unknown>;
	return {
		id_city: toNumber(source.id_city),
		name: String(source.name || '').trim(),
	};
};

const normalizeDepartment = (value: unknown): LocationDepartment => {
	if (!value || typeof value !== 'object') {
		return {
			id_department: 0,
			name: '',
		};
	}

	const source = value as Record<string, unknown>;
	return {
		id_department: toNumber(source.id_department),
		name: String(source.name || '').trim(),
	};
};

const normalizeLocation = (value: unknown): Location | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idLocation = toNumber(source.id_location, NaN);

	if (!Number.isFinite(idLocation)) return null;

	return {
		id_location: idLocation,
		name: String(source.name || '').trim(),
		address: String(source.address || '').trim(),
		city: normalizeCity(source.city),
		department: normalizeDepartment(source.department),
		latitude: toNullableNumber(source.latitude),
		longitude: toNullableNumber(source.longitude),
		is_active: source.is_active === 1 || source.is_active === '1' || source.is_active === true ? 1 : 0,
		created_at: String(source.created_at || ''),
	};
};

const normalizeMeta = (
	value: unknown,
	fallback: { page: number; limit: number; totalRecords: number }
): LocationsListMeta => {
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

const resolveErrorMessage = (body: LocationsResponseBody, status: number, action: LocationRequestAction) => {
	if (typeof body?.message === 'string' && body.message.trim()) {
		return body.message;
	}
	return fallbackMessageByStatus(status, action);
};

const isSuccessResponse = (body: LocationsResponseBody | null): body is LocationsSuccessResponse => {
	return Boolean(body && typeof body === 'object' && body.status === 'success');
};

const getLocationUrlById = (locationId: number) => `${LOCATIONS_URL}/${locationId}`;

export class LocationsClient {
	private token: string;

	constructor(token: string) {
		if (!token) {
			throw new LocationsApiError('Token de acceso requerido.', 401);
		}
		this.token = token;
	}

	private async request(
		url: string,
		options: RequestInit,
		action: LocationRequestAction
	): Promise<{ response: Response; data: LocationsSuccessResponse }> {
		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: 'application/json',
				...(options.headers || {}),
			},
		});

		let body: LocationsResponseBody | null = null;
		try {
			body = (await response.json()) as LocationsResponseBody;
		} catch {
			throw new LocationsApiError('No fue posible interpretar la respuesta del servidor de sucursales.', 502);
		}

		if (!response.ok || !isSuccessResponse(body)) {
			const status = response.status || 400;
			const failureData: LocationsFailureResponse =
				!body || typeof body !== 'object'
					? {}
					: body.status === 'success'
						? { message: body.message }
						: body;

			throw new LocationsApiError(
				resolveErrorMessage(failureData, status, action),
				status,
				failureData.details,
				parseFieldErrors(failureData.errors)
			);
		}

		return { response, data: body };
	}

	async list(page = 1, limit = 9): Promise<LocationsListResult> {
		const safePage = Number.isInteger(page) && page > 0 ? page : 1;
		const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 9;

		const locationUrl = new URL(LOCATIONS_URL);
		locationUrl.searchParams.set('page', String(safePage));
		locationUrl.searchParams.set('limit', String(safeLimit));

		const { response, data } = await this.request(locationUrl.toString(), { method: 'GET' }, 'list');
		if (!Array.isArray(data.data)) {
			throw new LocationsApiError(
				fallbackMessageByStatus(response.status || 400, 'list'),
				response.status || 400
			);
		}

		const normalizedLocations = data.data
			.map(normalizeLocation)
			.filter((location): location is Location => location !== null);

		return {
			data: normalizedLocations,
			meta: normalizeMeta(data.meta, {
				page: safePage,
				limit: safeLimit,
				totalRecords: normalizedLocations.length,
			}),
		};
	}

	async getById(locationId: number): Promise<Location> {
		if (!Number.isInteger(locationId) || locationId <= 0) {
			throw new LocationsApiError('ID de sucursal invalido.', 400);
		}

		const { data } = await this.request(getLocationUrlById(locationId), { method: 'GET' }, 'get');
		const normalized = normalizeLocation(data.data);
		if (!normalized) {
			throw new LocationsApiError('No fue posible interpretar la sucursal solicitada.', 502);
		}
		return normalized;
	}

	async create(payload: CreateLocationPayload): Promise<{ id_location: number; message: string }> {
		const { response, data } = await this.request(
			LOCATIONS_URL,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			},
			'create'
		);

		if (!('id_location' in data)) {
			throw new LocationsApiError(
				fallbackMessageByStatus(response.status || 400, 'create'),
				response.status || 400
			);
		}

		return {
			id_location: toNumber(data.id_location, 0),
			message:
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Sucursal creada correctamente.',
		};
	}

	async update(locationId: number, payload: CreateLocationPayload): Promise<{ message: string }> {
		if (!Number.isInteger(locationId) || locationId <= 0) {
			throw new LocationsApiError('ID de sucursal invalido.', 400);
		}

		const { data } = await this.request(
			getLocationUrlById(locationId),
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
					: 'Sucursal actualizada correctamente.',
		};
	}

	async delete(locationId: number): Promise<{ message: string }> {
		if (!Number.isInteger(locationId) || locationId <= 0) {
			throw new LocationsApiError('ID de sucursal invalido.', 400);
		}

		const { data } = await this.request(getLocationUrlById(locationId), { method: 'DELETE' }, 'delete');
		return {
			message:
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Sucursal eliminada correctamente.',
		};
	}
}

export const listLocations = async (
	token: string,
	options: { page?: number; limit?: number } = {}
): Promise<LocationsListResult> => {
	const apiClient = new LocationsClient(token);
	return apiClient.list(options.page, options.limit);
};

export const createLocationWithOrds = async (token: string, payload: CreateLocationPayload) => {
	const apiClient = new LocationsClient(token);
	return apiClient.create(payload);
};

export const getLocationByIdWithOrds = async (token: string, locationId: number) => {
	const apiClient = new LocationsClient(token);
	return apiClient.getById(locationId);
};

export const updateLocationWithOrds = async (
	token: string,
	locationId: number,
	payload: CreateLocationPayload
) => {
	const apiClient = new LocationsClient(token);
	return apiClient.update(locationId, payload);
};

export const deleteLocationWithOrds = async (token: string, locationId: number) => {
	const apiClient = new LocationsClient(token);
	return apiClient.delete(locationId);
};
