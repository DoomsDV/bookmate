import { resolveOrdsApiUrl } from './env-urls';

export const LOCATION_CLOSURES_BASE = resolveOrdsApiUrl(
	import.meta.env.ORDS_LOCATIONS_URL,
	'ORDS_LOCATIONS_URL',
	'/locations'
);

export const ORG_CLOSURES_URL = resolveOrdsApiUrl(
	undefined,
	'ORDS_ORG_CLOSURES_URL',
	'/closures/org'
);

export type LocationClosureScope = 'LOCATION' | 'ORG';

export interface LocationClosure {
	id_location_closure: number;
	loc_id_location: number | null;
	name: string;
	start_date: string;
	end_date: string;
	is_full_day: 0 | 1;
	start_time: string | null;
	end_time: string | null;
	closure_group_id: string | null;
	scope: LocationClosureScope;
	location_count?: number;
}

export interface CreateLocationClosurePayload {
	name: string;
	start_date: string;
	end_date: string;
	is_full_day: 0 | 1;
	start_time?: string | null;
	end_time?: string | null;
	apply_all_locations?: 0 | 1;
	location_ids?: number[];
}

export interface LocationClosureFieldError {
	field: string;
	message: string;
}

interface ApiSuccess<T> {
	status: 'success';
	message?: string;
	data?: T;
	inserted_ids?: unknown;
	closure_group_id?: string;
	deleted_count?: number;
}

interface ApiFailure {
	status?: string;
	message?: string;
	errors?: unknown;
}

export class LocationClosuresApiError extends Error {
	status: number;
	fieldErrors: LocationClosureFieldError[];

	constructor(message: string, status = 400, fieldErrors: LocationClosureFieldError[] = []) {
		super(message);
		this.name = 'LocationClosuresApiError';
		this.status = status;
		this.fieldErrors = fieldErrors;
	}
}

const parseErrors = (value: unknown): LocationClosureFieldError[] => {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const field = 'field' in item ? String((item as Record<string, unknown>).field || '').trim() : '';
		const message = 'message' in item ? String((item as Record<string, unknown>).message || '').trim() : '';
		if (!field || !message) return [];
		return [{ field, message }];
	});
};

const toNullable = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const normalizeClosure = (value: unknown): LocationClosure | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const id = Number(source.id_location_closure);
	if (!Number.isFinite(id) || id <= 0) return null;
	const scopeRaw = String(source.scope || '').toUpperCase();
	const scope: LocationClosureScope = scopeRaw === 'ORG' ? 'ORG' : 'LOCATION';
	return {
		id_location_closure: id,
		loc_id_location:
			source.loc_id_location !== undefined && source.loc_id_location !== null
				? Number(source.loc_id_location)
				: null,
		name: String(source.name || '').trim(),
		start_date: String(source.start_date || ''),
		end_date: String(source.end_date || ''),
		is_full_day: source.is_full_day === 1 || source.is_full_day === '1' ? 1 : 0,
		start_time: toNullable(source.start_time),
		end_time: toNullable(source.end_time),
		closure_group_id: toNullable(source.closure_group_id),
		scope,
		location_count:
			source.location_count !== undefined && source.location_count !== null
				? Number(source.location_count)
				: undefined,
	};
};

async function request<T>(url: string, init: RequestInit, token: string): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			...(init.headers || {}),
		},
	});

	let body: (ApiSuccess<T> & ApiFailure) | null = null;
	try {
		body = (await response.json()) as ApiSuccess<T> & ApiFailure;
	} catch {
		throw new LocationClosuresApiError(
			'No fue posible interpretar la respuesta del servidor.',
			502
		);
	}

	if (!response.ok || !body || body.status !== 'success') {
		const status = response.status || 400;
		const message =
			typeof body?.message === 'string' && body.message.trim().length > 0
				? body.message
				: 'No fue posible completar la operación.';
		throw new LocationClosuresApiError(message, status, parseErrors(body?.errors));
	}

	return body as T;
}

const closuresUrlForLocation = (locationId: number) =>
	`${LOCATION_CLOSURES_BASE}/${locationId}/closures`;

const closureUrl = (locationId: number, closureId: number) =>
	`${LOCATION_CLOSURES_BASE}/${locationId}/closures/${closureId}`;

export async function listLocationClosures(
	token: string,
	locationId: number,
	options: { fromDate?: string; toDate?: string } = {}
): Promise<LocationClosure[]> {
	if (!Number.isInteger(locationId) || locationId <= 0) {
		throw new LocationClosuresApiError('ID de sucursal inválido.', 400);
	}
	const url = new URL(closuresUrlForLocation(locationId));
	if (options.fromDate) url.searchParams.set('from_date', options.fromDate);
	if (options.toDate) url.searchParams.set('to_date', options.toDate);

	const body = await request<ApiSuccess<unknown>>(url.toString(), { method: 'GET' }, token);
	if (!Array.isArray(body.data)) return [];
	return body.data.map(normalizeClosure).filter((c): c is LocationClosure => c !== null);
}

export async function listOrgClosures(
	token: string,
	options: { fromDate?: string; toDate?: string } = {}
): Promise<LocationClosure[]> {
	const url = new URL(ORG_CLOSURES_URL);
	if (options.fromDate) url.searchParams.set('from_date', options.fromDate);
	if (options.toDate) url.searchParams.set('to_date', options.toDate);

	const body = await request<ApiSuccess<unknown>>(url.toString(), { method: 'GET' }, token);
	if (!Array.isArray(body.data)) return [];
	return body.data.map(normalizeClosure).filter((c): c is LocationClosure => c !== null);
}

export async function createLocationClosure(
	token: string,
	locationId: number | null,
	payload: CreateLocationClosurePayload
): Promise<{ inserted_ids: number[]; closure_group_id: string | null; message: string }> {
	const applyAll = payload.apply_all_locations === 1;
	const locationIds = Array.isArray(payload.location_ids)
		? payload.location_ids.filter((id) => Number.isInteger(id) && id > 0)
		: [];
	const useOrgEndpoint = applyAll || locationIds.length > 0;

	if (!useOrgEndpoint && (!Number.isInteger(locationId) || (locationId as number) <= 0)) {
		throw new LocationClosuresApiError('ID de sucursal inválido.', 400);
	}
	if (!applyAll && locationIds.length === 0 && (!Number.isInteger(locationId) || (locationId as number) <= 0)) {
		throw new LocationClosuresApiError('Seleccioná al menos una sucursal.', 400);
	}

	const url = useOrgEndpoint ? ORG_CLOSURES_URL : closuresUrlForLocation(locationId as number);
	const bodyPayload =
		locationIds.length > 0
			? { ...payload, location_ids: locationIds, apply_all_locations: applyAll ? 1 : 0 }
			: payload;

	const body = await request<ApiSuccess<unknown>>(
		url,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(bodyPayload),
		},
		token
	);

	const insertedIds = Array.isArray(body.inserted_ids)
		? body.inserted_ids
				.map((v) => Number(v))
				.filter((v) => Number.isFinite(v) && v > 0)
		: [];

	return {
		inserted_ids: insertedIds,
		closure_group_id: typeof body.closure_group_id === 'string' ? body.closure_group_id : null,
		message: typeof body.message === 'string' ? body.message : 'Cierre creado.',
	};
}

export async function deleteLocationClosure(
	token: string,
	locationId: number,
	closureId: number,
	options: { deleteGroup?: boolean } = {}
): Promise<{ deleted_count: number; message: string }> {
	if (!Number.isInteger(locationId) || locationId <= 0) {
		throw new LocationClosuresApiError('ID de sucursal inválido.', 400);
	}
	if (!Number.isInteger(closureId) || closureId <= 0) {
		throw new LocationClosuresApiError('ID de cierre inválido.', 400);
	}
	const url = new URL(closureUrl(locationId, closureId));
	if (options.deleteGroup) url.searchParams.set('delete_group', '1');

	const body = await request<ApiSuccess<unknown>>(url.toString(), { method: 'DELETE' }, token);
	return {
		deleted_count: typeof body.deleted_count === 'number' ? body.deleted_count : 0,
		message: typeof body.message === 'string' ? body.message : 'Cierre eliminado.',
	};
}
