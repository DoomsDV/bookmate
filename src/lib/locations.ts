const DEFAULT_LOCATIONS_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/locations';

export const LOCATIONS_URL = import.meta.env.ORDS_LOCATIONS_URL ?? DEFAULT_LOCATIONS_URL;

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

interface CreateLocationSuccessResponse {
	status: 'success';
	message?: string;
	id_location: number;
}

interface LocationSuccessResponse {
	status: 'success';
	data: unknown;
}

interface LocationActionSuccessResponse {
	status: 'success';
	message?: string;
}

interface LocationsSuccessResponse {
	status: 'success';
	data: unknown[];
	meta?: unknown;
}

interface LocationsFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

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
				? 'Sucursal no encontrada.'
				: 'No se encontro el recurso solicitado.';
		case 409:
			if (action === 'create') return 'Existe un conflicto y no se pudo crear la sucursal.';
			if (action === 'delete')
				return 'No se puede eliminar la sucursal porque esta siendo utilizada en otros registros.';
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

const parseLocationsResponse = async (
	response: Response,
	pagination: { page: number; limit: number }
): Promise<LocationsListResult> => {
	let data: LocationsSuccessResponse | LocationsFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new LocationsApiError('No fue posible interpretar la respuesta del servidor de sucursales.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		const failureData = (data ?? {}) as LocationsFailureResponse;
		throw new LocationsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'list'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const normalizedLocations = data.data
		.map(normalizeLocation)
		.filter((location): location is Location => location !== null);

	return {
		data: normalizedLocations,
		meta: normalizeMeta(data.meta, {
			page: pagination.page,
			limit: pagination.limit,
			totalRecords: normalizedLocations.length,
		}),
	};
};

export const listLocations = async (
	token: string,
	options: { page?: number; limit?: number } = {}
): Promise<LocationsListResult> => {
	if (!token) {
		throw new LocationsApiError('Token de acceso requerido.', 401);
	}

	const page = Number.isInteger(options.page) && Number(options.page) > 0 ? Number(options.page) : 1;
	const limit =
		Number.isInteger(options.limit) && Number(options.limit) > 0 ? Number(options.limit) : 9;

	const locationUrl = new URL(LOCATIONS_URL);
	locationUrl.searchParams.set('page', String(page));
	locationUrl.searchParams.set('limit', String(limit));

	const response = await fetch(locationUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseLocationsResponse(response, { page, limit });
};

const parseLocationResponse = async (response: Response) => {
	let data: LocationSuccessResponse | LocationsFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new LocationsApiError('No fue posible interpretar la respuesta del servidor de sucursales.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		const failureData = (data ?? {}) as LocationsFailureResponse;
		throw new LocationsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'get'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const normalized = normalizeLocation(data.data);
	if (!normalized) {
		throw new LocationsApiError('No fue posible interpretar la sucursal solicitada.', 502);
	}

	return normalized;
};

const parseLocationActionResponse = async (
	response: Response,
	action: 'update' | 'delete'
) => {
	let data: LocationActionSuccessResponse | LocationsFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new LocationsApiError('No fue posible interpretar la respuesta del servidor de sucursales.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as LocationsFailureResponse;
		throw new LocationsApiError(
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
				? 'Sucursal actualizada correctamente.'
				: 'Sucursal eliminada correctamente.',
	};
};

const parseCreateLocationResponse = async (response: Response) => {
	let data: CreateLocationSuccessResponse | LocationsFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new LocationsApiError('No fue posible interpretar la respuesta del servidor de sucursales.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('id_location' in data)
	) {
		const failureData = (data ?? {}) as LocationsFailureResponse;
		throw new LocationsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'create'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return {
		id_location: toNumber(data.id_location, 0),
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Sucursal creada correctamente.',
	};
};

const getLocationUrlById = (locationId: number) => `${LOCATIONS_URL}/${locationId}`;

export const createLocationWithOrds = async (token: string, payload: CreateLocationPayload) => {
	if (!token) {
		throw new LocationsApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(LOCATIONS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseCreateLocationResponse(response);
};

export const getLocationByIdWithOrds = async (token: string, locationId: number) => {
	if (!token) {
		throw new LocationsApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(locationId) || locationId <= 0) {
		throw new LocationsApiError('ID de sucursal invalido.', 400);
	}

	const response = await fetch(getLocationUrlById(locationId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseLocationResponse(response);
};

export const updateLocationWithOrds = async (
	token: string,
	locationId: number,
	payload: CreateLocationPayload
) => {
	if (!token) {
		throw new LocationsApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(locationId) || locationId <= 0) {
		throw new LocationsApiError('ID de sucursal invalido.', 400);
	}

	const response = await fetch(getLocationUrlById(locationId), {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseLocationActionResponse(response, 'update');
};

export const deleteLocationWithOrds = async (token: string, locationId: number) => {
	if (!token) {
		throw new LocationsApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(locationId) || locationId <= 0) {
		throw new LocationsApiError('ID de sucursal invalido.', 400);
	}

	const response = await fetch(getLocationUrlById(locationId), {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseLocationActionResponse(response, 'delete');
};
