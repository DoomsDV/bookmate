import type { APIRoute } from 'astro';

import {
	LocationsApiError,
	LocationsClient,
	listLocations,
	type CreateLocationPayload,
} from '../../lib/locations';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toPositiveInt,
} from '../../utils/api-helpers';

const createLocationsError = (message: string, status = 400) =>
	new LocationsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createLocationsError, 'No hay sesion valida para consultar sucursales.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is LocationsApiError => value instanceof LocationsApiError,
		createError: createLocationsError,
	});

export const GET: APIRoute = async ({ locals, url }) => {
	try {
		const token = requireToken(locals.token);
		const page = toPositiveInt(url.searchParams.get('page'), 1);
		const limit = toPositiveInt(url.searchParams.get('limit'), 9);
		const rawIsActive = String(url.searchParams.get('is_active') || '').trim();
		const isActive =
			rawIsActive === '0' || rawIsActive === '1' ? Number(rawIsActive) : null;

		const result = await listLocations(token, { page, limit, isActive });

		return Response.json(
			{
				status: 'success',
				data: result.data,
				meta: result.meta,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el listado de sucursales.');
	}
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		name: formData.get('name'),
		address: formData.get('address'),
		cit_id_city: formData.get('cit_id_city'),
		dep_id_department: formData.get('dep_id_department'),
		latitude: formData.get('latitude'),
		longitude: formData.get('longitude'),
		is_active: formData.get('is_active'),
	};
};

const toOptionalNumber = (value: unknown) => {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = locals.token;

		if (!token) {
			throw new LocationsApiError('No hay sesion valida para crear sucursales.', 401);
		}

		const body = await parseBody(request);
		const name = String(body?.name || '').trim();
		const address = String(body?.address || '').trim();
		const cityId = Number(body?.cit_id_city);
		const departmentId = Number(body?.dep_id_department);
		const latitude = toOptionalNumber(body?.latitude);
		const longitude = toOptionalNumber(body?.longitude);
		const isActiveRaw = String(body?.is_active ?? '').trim();
		const isActiveNumber = Number(isActiveRaw);

		const payload: CreateLocationPayload = {
			name,
			address,
			cit_id_city: Number.isFinite(cityId) ? cityId : 0,
			dep_id_department: Number.isFinite(departmentId) ? departmentId : 0,
			is_active:
				isActiveRaw === ''
					? 1
					: (Number.isFinite(isActiveNumber) ? isActiveNumber : 1) as 0 | 1,
		};

		if (typeof latitude === 'number') payload.latitude = latitude;
		if (typeof longitude === 'number') payload.longitude = longitude;

		const client = new LocationsClient(token);
		const created = await client.create(payload);

		return Response.json(
			{
				status: 'success',
				message: created.message,
				id_location: created.id_location,
			},
			{ status: 201 }
		);
	} catch (error) {
		const locationError =
			error instanceof LocationsApiError
				? error
				: new LocationsApiError('No fue posible crear la sucursal.', 500);

		return Response.json(
			{
				status: 'error',
				message: locationError.message,
				details: locationError.details,
				errors: locationError.fieldErrors,
			},
			{ status: locationError.status }
		);
	}
};
