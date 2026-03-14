import type { APIRoute } from 'astro';

import {
	LocationsApiError,
	LocationsClient,
	type CreateLocationPayload,
} from '../../../lib/locations';

const parseLocationId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
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

const parseUpdatePayload = (body: any): CreateLocationPayload => {
	const name = String(body?.name || '').trim();
	const address = String(body?.address || '').trim();
	const cityId = Number(body?.cit_id_city);
	const departmentId = Number(body?.dep_id_department);
	const isActiveRaw = String(body?.is_active ?? '').trim();
	const isActiveNumber = Number(isActiveRaw);
	const latitude = toOptionalNumber(body?.latitude);
	const longitude = toOptionalNumber(body?.longitude);

	const payload: CreateLocationPayload = {
		name,
		address,
		cit_id_city: Number.isFinite(cityId) ? cityId : 0,
		dep_id_department: Number.isFinite(departmentId) ? departmentId : 0,
	};

	if (isActiveRaw !== '' && Number.isFinite(isActiveNumber)) {
		payload.is_active = isActiveNumber as 0 | 1;
	}

	if (typeof latitude === 'number') payload.latitude = latitude;
	if (typeof longitude === 'number') payload.longitude = longitude;

	return payload;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const locationError =
		error instanceof LocationsApiError ? error : new LocationsApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: locationError.message,
			details: locationError.details,
			errors: locationError.fieldErrors,
		},
		{ status: locationError.status }
	);
};

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new LocationsApiError('No hay sesion valida para procesar sucursales.', 401);
	}
	return token;
};

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const locationId = parseLocationId(params.id);

		if (!locationId) {
			throw new LocationsApiError('ID de sucursal invalido.', 400);
		}

		const client = new LocationsClient(token);
		const location = await client.getById(locationId);

		return Response.json(
			{
				status: 'success',
				data: location,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener la sucursal.');
	}
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const locationId = parseLocationId(params.id);

		if (!locationId) {
			throw new LocationsApiError('ID de sucursal invalido.', 400);
		}

		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);
		const client = new LocationsClient(token);
		const updated = await client.update(locationId, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar la sucursal.');
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const locationId = parseLocationId(params.id);

		if (!locationId) {
			throw new LocationsApiError('ID de sucursal invalido.', 400);
		}

		const client = new LocationsClient(token);
		const deleted = await client.delete(locationId);

		return Response.json(
			{
				status: 'success',
				message: deleted.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar la sucursal.');
	}
};
