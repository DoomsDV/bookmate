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

interface SpecialtiesFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

interface SpecialtiesSuccessResponse {
	status: 'success';
	message?: string;
	data?: unknown;
	meta?: unknown;
	id_specialty?: unknown;
}

type SpecialtiesResponseBody = SpecialtiesSuccessResponse | SpecialtiesFailureResponse;

type SpecialtyRequestAction = 'list' | 'get' | 'create' | 'update' | 'delete';

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

const fallbackMessageByStatus = (status: number, action: SpecialtyRequestAction) => {
	switch (status) {
		case 400:
		case 422:
			return 'Errores de validacion en los campos enviados.';
		case 401:
			return 'Sesion no autorizada. Inicia sesion nuevamente.';
		case 403:
			return 'No tienes permisos para realizar esta accion.';
		case 404:
			return action === 'get' ? 'Especialidad no encontrada.' : 'No se encontro el recurso solicitado.';
		case 409:
			if (action === 'create') return 'Existe un conflicto y no se pudo crear la especialidad.';
			if (action === 'delete') {
				return 'No se puede eliminar la especialidad porque esta siendo utilizada en otros registros.';
			}
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
		is_active: source.is_active === 1 || source.is_active === '1' || source.is_active === true ? 1 : 0,
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

const resolveErrorMessage = (body: SpecialtiesResponseBody, status: number, action: SpecialtyRequestAction) => {
	if (typeof body?.message === 'string' && body.message.trim()) {
		return body.message;
	}
	return fallbackMessageByStatus(status, action);
};

const isSuccessResponse = (body: SpecialtiesResponseBody | null): body is SpecialtiesSuccessResponse => {
	return Boolean(body && typeof body === 'object' && body.status === 'success');
};

const getSpecialtyUrlById = (specialtyId: number) => `${SPECIALTIES_URL}/${specialtyId}`;

export class SpecialtiesClient {
	private token: string;

	constructor(token: string) {
		if (!token) {
			throw new SpecialtiesApiError('Token de acceso requerido.', 401);
		}
		this.token = token;
	}

	private async request(
		url: string,
		options: RequestInit,
		action: SpecialtyRequestAction
	): Promise<{ response: Response; data: SpecialtiesSuccessResponse }> {
		const response = await fetch(url, {
			...options,
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: 'application/json',
				...(options.headers || {}),
			},
		});

		let body: SpecialtiesResponseBody | null = null;
		try {
			body = (await response.json()) as SpecialtiesResponseBody;
		} catch {
			throw new SpecialtiesApiError(
				'No fue posible interpretar la respuesta del servidor de especialidades.',
				502
			);
		}

		if (!response.ok || !isSuccessResponse(body)) {
			const status = response.status || 400;
			const failureData: SpecialtiesFailureResponse =
				!body || typeof body !== 'object'
					? {}
					: body.status === 'success'
						? { message: body.message }
						: body;

			throw new SpecialtiesApiError(
				resolveErrorMessage(failureData, status, action),
				status,
				failureData.details,
				parseFieldErrors(failureData.errors)
			);
		}

		return { response, data: body };
	}

	async list(page = 1, limit = 9): Promise<SpecialtiesListResult> {
		const safePage = Number.isInteger(page) && page > 0 ? page : 1;
		const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 9;

		const specialtyUrl = new URL(SPECIALTIES_URL);
		specialtyUrl.searchParams.set('page', String(safePage));
		specialtyUrl.searchParams.set('limit', String(safeLimit));

		const { response, data } = await this.request(specialtyUrl.toString(), { method: 'GET' }, 'list');
		if (!Array.isArray(data.data)) {
			throw new SpecialtiesApiError(
				fallbackMessageByStatus(response.status || 400, 'list'),
				response.status || 400
			);
		}

		const normalizedSpecialties = data.data
			.map(normalizeSpecialty)
			.filter((specialty): specialty is Specialty => specialty !== null);

		return {
			data: normalizedSpecialties,
			meta: normalizeMeta(data.meta, {
				page: safePage,
				limit: safeLimit,
				totalRecords: normalizedSpecialties.length,
			}),
		};
	}

	async getById(specialtyId: number): Promise<Specialty> {
		if (!Number.isInteger(specialtyId) || specialtyId <= 0) {
			throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
		}

		const { data } = await this.request(getSpecialtyUrlById(specialtyId), { method: 'GET' }, 'get');
		const normalized = normalizeSpecialty(data.data);
		if (!normalized) {
			throw new SpecialtiesApiError('No fue posible interpretar la especialidad solicitada.', 502);
		}
		return normalized;
	}

	async create(payload: CreateSpecialtyPayload): Promise<{ id_specialty: number; message: string }> {
		const { response, data } = await this.request(
			SPECIALTIES_URL,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			},
			'create'
		);

		if (!('id_specialty' in data)) {
			throw new SpecialtiesApiError(
				fallbackMessageByStatus(response.status || 400, 'create'),
				response.status || 400
			);
		}

		return {
			id_specialty: toNumber(data.id_specialty, 0),
			message:
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Especialidad creada correctamente.',
		};
	}

	async update(specialtyId: number, payload: CreateSpecialtyPayload): Promise<{ message: string }> {
		if (!Number.isInteger(specialtyId) || specialtyId <= 0) {
			throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
		}

		const { data } = await this.request(
			getSpecialtyUrlById(specialtyId),
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
					: 'Especialidad actualizada correctamente.',
		};
	}

	async delete(specialtyId: number): Promise<{ message: string }> {
		if (!Number.isInteger(specialtyId) || specialtyId <= 0) {
			throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
		}

		const { data } = await this.request(getSpecialtyUrlById(specialtyId), { method: 'DELETE' }, 'delete');

		return {
			message:
				typeof data.message === 'string' && data.message.trim()
					? data.message
					: 'Especialidad eliminada correctamente.',
		};
	}
}

export const listSpecialties = async (
	token: string,
	options: { page?: number; limit?: number } = {}
): Promise<SpecialtiesListResult> => {
	const apiClient = new SpecialtiesClient(token);
	return apiClient.list(options.page, options.limit);
};

export const createSpecialtyWithOrds = async (token: string, payload: CreateSpecialtyPayload) => {
	const apiClient = new SpecialtiesClient(token);
	return apiClient.create(payload);
};

export const getSpecialtyByIdWithOrds = async (token: string, specialtyId: number) => {
	const apiClient = new SpecialtiesClient(token);
	return apiClient.getById(specialtyId);
};

export const updateSpecialtyWithOrds = async (
	token: string,
	specialtyId: number,
	payload: CreateSpecialtyPayload
) => {
	const apiClient = new SpecialtiesClient(token);
	return apiClient.update(specialtyId, payload);
};

export const deleteSpecialtyWithOrds = async (token: string, specialtyId: number) => {
	const apiClient = new SpecialtiesClient(token);
	return apiClient.delete(specialtyId);
};
