import type { APIRoute } from 'astro';

import {
	LocationsApiError,
	createLocationWithOrds,
	type CreateLocationPayload,
} from '../../lib/locations';

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

		const created = await createLocationWithOrds(token, payload);

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
