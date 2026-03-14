import { resolveOrdsApiUrl } from './env-urls';

export const DEPARTMENTS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_DEPARTMENTS_URL,
	'ORDS_DEPARTMENTS_URL',
	'/departments'
);

export interface Department {
	id_department: number;
	description: string;
}

export interface City {
	id_city: number;
	description: string;
}

interface CatalogSuccessResponse {
	status: 'success';
	data: unknown[];
}

interface CatalogFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

export class CatalogApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'CatalogApiError';
		this.status = status;
		this.details = details;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDepartment = (value: unknown): Department | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idDepartment = toNumber(source.id_department, NaN);
	if (!Number.isFinite(idDepartment)) return null;

	return {
		id_department: idDepartment,
		description: String(source.description || '').trim(),
	};
};

const normalizeCity = (value: unknown): City | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idCity = toNumber(source.id_city, NaN);
	if (!Number.isFinite(idCity)) return null;

	return {
		id_city: idCity,
		description: String(source.description || '').trim(),
	};
};

const parseCatalogListResponse = async (response: Response, fallbackMessage: string) => {
	let data: CatalogSuccessResponse | CatalogFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new CatalogApiError('No fue posible interpretar la respuesta del servidor de catalogos.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		const failureData = (data ?? {}) as CatalogFailureResponse;
		throw new CatalogApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) || fallbackMessage,
			response.status || 400,
			failureData.details
		);
	}

	return data.data;
};

export const listDepartmentsWithOrds = async () => {
	const response = await fetch(DEPARTMENTS_URL, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
		},
	});

	const rawItems = await parseCatalogListResponse(
		response,
		'No fue posible obtener los departamentos.'
	);
	return rawItems
		.map(normalizeDepartment)
		.filter((department): department is Department => department !== null);
};

export const listCitiesByDepartmentWithOrds = async (departmentId: number) => {
	if (!Number.isInteger(departmentId) || departmentId <= 0) {
		throw new CatalogApiError('ID de departamento invalido.', 400);
	}

	const response = await fetch(`${DEPARTMENTS_URL}/${departmentId}/cities`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
		},
	});

	const rawItems = await parseCatalogListResponse(
		response,
		'No fue posible obtener las ciudades del departamento seleccionado.'
	);
	return rawItems.map(normalizeCity).filter((city): city is City => city !== null);
};
