import type { APIRoute } from 'astro';

import {
	ProfessionalsApiError,
	deleteProfessionalWithUserWithOrds,
	getProfessionalByIdWithOrds,
	updateProfessionalWithUserWithOrds,
	type UpdateProfessionalWithUserPayload,
} from '../../../lib/professionals';

const parseProfessionalId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const parseServiceIds = (value: unknown): number[] | undefined => {
	if (value === undefined || value === null) return undefined;

	let source = value;
	if (typeof source === 'string') {
		const trimmed = source.trim();
		if (trimmed === '') return [];
		try {
			source = JSON.parse(trimmed);
		} catch {
			source = [trimmed];
		}
	}

	if (!Array.isArray(source)) return [];

	return source
		.map((item) => Number(item))
		.filter((serviceId) => Number.isInteger(serviceId) && serviceId > 0);
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		rol_id_role: formData.get('rol_id_role'),
		apex_user_name: formData.get('apex_user_name'),
		first_name: formData.get('first_name'),
		last_name: formData.get('last_name'),
		email: formData.get('email'),
		password: formData.get('password'),
		user_is_active: formData.get('user_is_active'),
		phone_number: formData.get('phone_number'),
		spe_id_specialty: formData.get('spe_id_specialty'),
		profile_slug: formData.get('profile_slug'),
		prof_is_active: formData.get('prof_is_active'),
		image_base64: formData.get('image_base64'),
		image_name: formData.get('image_name'),
		image_mime: formData.get('image_mime'),
		services: formData.getAll('services'),
	};
};

const parseUpdatePayload = (body: any): UpdateProfessionalWithUserPayload => {
	const roleId = Number(body?.rol_id_role);
	const userIsActiveRaw = String(body?.user_is_active ?? '').trim();
	const userIsActiveNumber = Number(userIsActiveRaw);
	const profIsActiveRaw = String(body?.prof_is_active ?? '').trim();
	const profIsActiveNumber = Number(profIsActiveRaw);
	const specialtyRaw = String(body?.spe_id_specialty ?? '').trim();
	const specialtyId = Number(specialtyRaw);
	const password = String(body?.password ?? '');
	const email = String(body?.email ?? '').trim();
	const profileSlug = String(body?.profile_slug ?? '').trim();

	const payload: UpdateProfessionalWithUserPayload = {
		rol_id_role: Number.isFinite(roleId) ? roleId : 0,
		apex_user_name: String(body?.apex_user_name || '').trim(),
		first_name: String(body?.first_name || '').trim(),
		last_name: String(body?.last_name || '').trim(),
		email,
		phone_number: String(body?.phone_number || '').trim(),
	};

	if (password.trim() !== '') payload.password = password;
	if (profileSlug !== '') payload.profile_slug = profileSlug;

	if (userIsActiveRaw !== '' && Number.isFinite(userIsActiveNumber)) {
		payload.user_is_active = userIsActiveNumber as 0 | 1;
	}

	if (profIsActiveRaw !== '' && Number.isFinite(profIsActiveNumber)) {
		payload.prof_is_active = profIsActiveNumber as 0 | 1;
	}

	if (specialtyRaw !== '' && Number.isInteger(specialtyId) && specialtyId > 0) {
		payload.spe_id_specialty = specialtyId;
	}

	const imageBase64 = String(body?.image_base64 ?? '').trim();
	const imageName = String(body?.image_name ?? '').trim();
	const imageMime = String(body?.image_mime ?? '').trim();
	if (imageBase64 !== '') {
		payload.image_base64 = imageBase64;
		payload.image_name = imageName;
		payload.image_mime = imageMime;
	}

	const services = parseServiceIds(body?.services);
	if (services !== undefined) {
		payload.services = services;
	}

	return payload;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const professionalError =
		error instanceof ProfessionalsApiError
			? error
			: new ProfessionalsApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: professionalError.message,
			details: professionalError.details,
			errors: professionalError.fieldErrors,
		},
		{ status: professionalError.status }
	);
};

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new ProfessionalsApiError('No hay sesion valida para procesar personal.', 401);
	}
	return token;
};

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const professionalId = parseProfessionalId(params.id);

		if (!professionalId) {
			throw new ProfessionalsApiError('ID de personal invalido.', 400);
		}

		const professional = await getProfessionalByIdWithOrds(token, professionalId);

		return Response.json(
			{
				status: 'success',
				data: professional,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el personal.');
	}
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const professionalId = parseProfessionalId(params.id);

		if (!professionalId) {
			throw new ProfessionalsApiError('ID de personal invalido.', 400);
		}

		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);
		const updated = await updateProfessionalWithUserWithOrds(token, professionalId, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar el personal.');
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const professionalId = parseProfessionalId(params.id);

		if (!professionalId) {
			throw new ProfessionalsApiError('ID de personal invalido.', 400);
		}

		const deleted = await deleteProfessionalWithUserWithOrds(token, professionalId);

		return Response.json(
			{
				status: 'success',
				message: deleted.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar el personal.');
	}
};
