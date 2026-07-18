import type { APIRoute } from 'astro';

import {
	SpecialtiesApiError,
	SpecialtiesClient,
	listSpecialties,
	type CreateSpecialtyPayload,
} from '../../lib/specialties';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toPositiveInt,
} from '../../utils/api-helpers';

const createSpecialtiesError = (message: string, status = 400) =>
	new SpecialtiesApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(
		token,
		createSpecialtiesError,
		'No hay sesion valida para consultar especialidades.'
	);

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is SpecialtiesApiError => value instanceof SpecialtiesApiError,
		createError: createSpecialtiesError,
	});

export const GET: APIRoute = async ({ locals, url }) => {
	try {
		const token = requireToken(locals.token);
		const page = toPositiveInt(url.searchParams.get('page'), 1);
		const limit = toPositiveInt(url.searchParams.get('limit'), 9);
		const searchQuery = String(url.searchParams.get('search') || '').trim();
		const rawIsActive = String(url.searchParams.get('is_active') || '').trim();
		const isActive =
			rawIsActive === '0' || rawIsActive === '1' ? Number(rawIsActive) : null;

		const result = await listSpecialties(token, {
			page,
			limit,
			isActive,
			search: searchQuery || undefined,
		});

		return Response.json(
			{
				status: 'success',
				data: result.data,
				meta: result.meta,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el listado de especialidades.');
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

		const client = new SpecialtiesClient(token);
		const created = await client.create(payload);

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
