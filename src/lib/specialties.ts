const DEFAULT_SPECIALTIES_URL =
	'https://g9549f707e8ebfa-aox.adb.sa-saopaulo-1.oraclecloudapps.com/ords/bookmate/api/v1/specialties';

export const SPECIALTIES_URL = import.meta.env.ORDS_SPECIALTIES_URL ?? DEFAULT_SPECIALTIES_URL;

export interface Specialty {
	id_specialty: number;
	name: string;
	description: string;
	is_active: 0 | 1;
	created_at: string;
}

export interface SpecialtiesListMeta {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
}

export interface SpecialtiesListResult {
	data: Specialty[];
	meta: SpecialtiesListMeta;
}

export interface SpecialtyFieldError {
	field: string;
	message: string;
}

export interface CreateSpecialtyPayload {
	name: string;
	description?: string;
	is_active?: 0 | 1;
}

interface CreateSpecialtySuccessResponse {
	status: 'success';
	message?: string;
	id_specialty: number;
}

interface SpecialtySuccessResponse {
	status: 'success';
	data: unknown;
}

interface SpecialtyActionSuccessResponse {
	status: 'success';
	message?: string;
}

interface SpecialtiesSuccessResponse {
	status: 'success';
	data: unknown[];
	meta?: unknown;
}

interface SpecialtiesFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class SpecialtiesApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: SpecialtyFieldError[];

	constructor(message: string, status = 400, details?: unknown, fieldErrors: SpecialtyFieldError[] = []) {
		super(message);
		this.name = 'SpecialtiesApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const parseFieldErrors = (value: unknown): SpecialtyFieldError[] => {
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
				? 'Especialidad no encontrada.'
				: 'No se encontro el recurso solicitado.';
		case 409:
			if (action === 'create') return 'Existe un conflicto y no se pudo crear la especialidad.';
			if (action === 'delete')
				return 'No se puede eliminar la especialidad porque esta siendo utilizada en otros registros.';
			return 'Existe un conflicto al procesar la solicitud.';
		case 500:
			return 'Error interno del servidor. Intenta nuevamente.';
		default:
			if (action === 'create') return 'No fue posible crear la especialidad.';
			if (action === 'update') return 'No fue posible actualizar la especialidad.';
			if (action === 'delete') return 'No fue posible eliminar la especialidad.';
			if (action === 'get') return 'No fue posible obtener la especialidad.';
			return 'No fue posible obtener el listado de especialidades.';
	}
};

const normalizeSpecialty = (value: unknown): Specialty | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idSpecialty = toNumber(source.id_specialty, NaN);

	if (!Number.isFinite(idSpecialty)) return null;

	return {
		id_specialty: idSpecialty,
		name: String(source.name || '').trim(),
		description: String(source.description || '').trim(),
		is_active:
			source.is_active === 1 || source.is_active === '1' || source.is_active === true ? 1 : 0,
		created_at: String(source.created_at || ''),
	};
};

const normalizeMeta = (
	value: unknown,
	fallback: { page: number; limit: number; totalRecords: number }
): SpecialtiesListMeta => {
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

const parseSpecialtiesResponse = async (
	response: Response,
	pagination: { page: number; limit: number }
): Promise<SpecialtiesListResult> => {
	let data: SpecialtiesSuccessResponse | SpecialtiesFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new SpecialtiesApiError(
			'No fue posible interpretar la respuesta del servidor de especialidades.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		const failureData = (data ?? {}) as SpecialtiesFailureResponse;
		throw new SpecialtiesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'list'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const normalizedSpecialties = data.data
		.map(normalizeSpecialty)
		.filter((specialty): specialty is Specialty => specialty !== null);

	return {
		data: normalizedSpecialties,
		meta: normalizeMeta(data.meta, {
			page: pagination.page,
			limit: pagination.limit,
			totalRecords: normalizedSpecialties.length,
		}),
	};
};

export const listSpecialties = async (
	token: string,
	options: { page?: number; limit?: number } = {}
): Promise<SpecialtiesListResult> => {
	if (!token) {
		throw new SpecialtiesApiError('Token de acceso requerido.', 401);
	}

	const page = Number.isInteger(options.page) && Number(options.page) > 0 ? Number(options.page) : 1;
	const limit =
		Number.isInteger(options.limit) && Number(options.limit) > 0 ? Number(options.limit) : 9;

	const specialtyUrl = new URL(SPECIALTIES_URL);
	specialtyUrl.searchParams.set('page', String(page));
	specialtyUrl.searchParams.set('limit', String(limit));

	const response = await fetch(specialtyUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseSpecialtiesResponse(response, { page, limit });
};

const parseSpecialtyResponse = async (response: Response) => {
	let data: SpecialtySuccessResponse | SpecialtiesFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new SpecialtiesApiError(
			'No fue posible interpretar la respuesta del servidor de especialidades.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		const failureData = (data ?? {}) as SpecialtiesFailureResponse;
		throw new SpecialtiesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'get'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const normalized = normalizeSpecialty(data.data);
	if (!normalized) {
		throw new SpecialtiesApiError('No fue posible interpretar la especialidad solicitada.', 502);
	}

	return normalized;
};

const parseSpecialtyActionResponse = async (
	response: Response,
	action: 'update' | 'delete'
) => {
	let data: SpecialtyActionSuccessResponse | SpecialtiesFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new SpecialtiesApiError(
			'No fue posible interpretar la respuesta del servidor de especialidades.',
			502
		);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as SpecialtiesFailureResponse;
		throw new SpecialtiesApiError(
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
				? 'Especialidad actualizada correctamente.'
				: 'Especialidad eliminada correctamente.',
	};
};

const parseCreateSpecialtyResponse = async (response: Response) => {
	let data: CreateSpecialtySuccessResponse | SpecialtiesFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new SpecialtiesApiError(
			'No fue posible interpretar la respuesta del servidor de especialidades.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('id_specialty' in data)
	) {
		const failureData = (data ?? {}) as SpecialtiesFailureResponse;
		throw new SpecialtiesApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'create'),
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return {
		id_specialty: toNumber(data.id_specialty, 0),
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Especialidad creada correctamente.',
	};
};

const getSpecialtyUrlById = (specialtyId: number) => `${SPECIALTIES_URL}/${specialtyId}`;

export const createSpecialtyWithOrds = async (token: string, payload: CreateSpecialtyPayload) => {
	if (!token) {
		throw new SpecialtiesApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(SPECIALTIES_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseCreateSpecialtyResponse(response);
};

export const getSpecialtyByIdWithOrds = async (token: string, specialtyId: number) => {
	if (!token) {
		throw new SpecialtiesApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(specialtyId) || specialtyId <= 0) {
		throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
	}

	const response = await fetch(getSpecialtyUrlById(specialtyId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseSpecialtyResponse(response);
};

export const updateSpecialtyWithOrds = async (
	token: string,
	specialtyId: number,
	payload: CreateSpecialtyPayload
) => {
	if (!token) {
		throw new SpecialtiesApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(specialtyId) || specialtyId <= 0) {
		throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
	}

	const response = await fetch(getSpecialtyUrlById(specialtyId), {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseSpecialtyActionResponse(response, 'update');
};

export const deleteSpecialtyWithOrds = async (token: string, specialtyId: number) => {
	if (!token) {
		throw new SpecialtiesApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(specialtyId) || specialtyId <= 0) {
		throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
	}

	const response = await fetch(getSpecialtyUrlById(specialtyId), {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseSpecialtyActionResponse(response, 'delete');
};
