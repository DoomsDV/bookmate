import type { APIRoute } from 'astro';

import {
	SpecialtiesApiError,
	deleteSpecialtyWithOrds,
	getSpecialtyByIdWithOrds,
	updateSpecialtyWithOrds,
	type CreateSpecialtyPayload,
} from '../../../lib/specialties';

const parseSpecialtyId = (value: string | undefined) => {
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
		description: formData.get('description'),
		is_active: formData.get('is_active'),
	};
};

const parseUpdatePayload = (body: any): CreateSpecialtyPayload => {
	const name = String(body?.name || '').trim();
	const description = String(body?.description ?? '').trim();
	const isActiveRaw = String(body?.is_active ?? '').trim();
	const isActiveNumber = Number(isActiveRaw);

	const payload: CreateSpecialtyPayload = {
		name,
		description,
	};

	if (isActiveRaw !== '' && Number.isFinite(isActiveNumber)) {
		payload.is_active = isActiveNumber as 0 | 1;
	}

	return payload;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const specialtyError =
		error instanceof SpecialtiesApiError ? error : new SpecialtiesApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: specialtyError.message,
			details: specialtyError.details,
			errors: specialtyError.fieldErrors,
		},
		{ status: specialtyError.status }
	);
};

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SpecialtiesApiError('No hay sesion valida para procesar especialidades.', 401);
	}
	return token;
};

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const specialtyId = parseSpecialtyId(params.id);

		if (!specialtyId) {
			throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
		}

		const specialty = await getSpecialtyByIdWithOrds(token, specialtyId);

		return Response.json(
			{
				status: 'success',
				data: specialty,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener la especialidad.');
	}
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const specialtyId = parseSpecialtyId(params.id);

		if (!specialtyId) {
			throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
		}

		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);
		const updated = await updateSpecialtyWithOrds(token, specialtyId, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar la especialidad.');
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const specialtyId = parseSpecialtyId(params.id);

		if (!specialtyId) {
			throw new SpecialtiesApiError('ID de especialidad invalido.', 400);
		}

		const deleted = await deleteSpecialtyWithOrds(token, specialtyId);

		return Response.json(
			{
				status: 'success',
				message: deleted.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar la especialidad.');
	}
};
