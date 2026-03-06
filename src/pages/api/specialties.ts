import type { APIRoute } from 'astro';

import {
	SpecialtiesApiError,
	createSpecialtyWithOrds,
	listSpecialties,
	type CreateSpecialtyPayload,
} from '../../lib/specialties';

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

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = locals.token;

		if (!token) {
			throw new SpecialtiesApiError('No hay sesion valida para crear especialidades.', 401);
		}

		const body = await parseBody(request);
		const name = String(body?.name || '').trim();
		const description = String(body?.description ?? '').trim();
		const isActiveRaw = String(body?.is_active ?? '').trim();
		const isActiveNumber = Number(isActiveRaw);

		const payload: CreateSpecialtyPayload = {
			name,
			is_active:
				isActiveRaw === ''
					? 1
					: (Number.isFinite(isActiveNumber) ? isActiveNumber : 1) as 0 | 1,
		};

		if (description !== '') {
			payload.description = description;
		}

		const created = await createSpecialtyWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: created.message,
				id_specialty: created.id_specialty,
			},
			{ status: 201 }
		);
	} catch (error) {
		const specialtyError =
			error instanceof SpecialtiesApiError
				? error
				: new SpecialtiesApiError('No fue posible crear la especialidad.', 500);

		return Response.json(
			{
				status: 'error',
				message: specialtyError.message,
				details: specialtyError.details,
				errors: specialtyError.fieldErrors,
			},
			{ status: specialtyError.status }
		);
	}
};

export const GET: APIRoute = async ({ request, locals }) => {
	try {
		const token = locals.token;
		if (!token) {
			throw new SpecialtiesApiError('No hay sesion valida para consultar especialidades.', 401);
		}

		const url = new URL(request.url);
		const pageRaw = Number(url.searchParams.get('page') || '1');
		const limitRaw = Number(url.searchParams.get('limit') || '9');
		const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
		const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 9;

		const listResult = await listSpecialties(token, { page, limit });

		return Response.json(
			{
				status: 'success',
				meta: listResult.meta,
				data: listResult.data,
			},
			{ status: 200 }
		);
	} catch (error) {
		const specialtyError =
			error instanceof SpecialtiesApiError
				? error
				: new SpecialtiesApiError('No fue posible consultar especialidades.', 500);

		return Response.json(
			{
				status: 'error',
				message: specialtyError.message,
				details: specialtyError.details,
				errors: specialtyError.fieldErrors,
			},
			{ status: specialtyError.status }
		);
	}
};
