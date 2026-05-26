import type { APIRoute } from 'astro';

import {
	ProfessionalsApiError,
	createProfessionalWithUserWithOrds,
	listProfessionals,
	type CreateProfessionalWithUserPayload,
} from '../../lib/professionals';
import {
	parseRequestBody,
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../utils/api-helpers';

const toIntOr = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : fallback;
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

const parseBody = (request: Request) =>
	parseRequestBody(request, (formData) => ({
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
	}));

const createProfessionalError = (message: string, status = 400) =>
	new ProfessionalsApiError(message, status);

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is ProfessionalsApiError =>
			value instanceof ProfessionalsApiError,
		createError: createProfessionalError,
	});

const requireToken = (token: string | undefined) =>
	requireApiToken(
		token,
		createProfessionalError,
		'No hay sesion valida para procesar personal.'
	);

export const GET: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const url = new URL(request.url);
		const page = toIntOr(url.searchParams.get('page'), 1);
		const limit = toIntOr(url.searchParams.get('limit'), 9);

		const professionals = await listProfessionals(token, {
			page: page > 0 ? page : 1,
			limit: limit > 0 ? limit : 9,
		});

		return Response.json(
			{
				status: 'success',
				meta: professionals.meta,
				data: professionals.data,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el listado de personal.');
	}
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const body = await parseBody(request);

		const roleId = toIntOr(body?.rol_id_role, 0);
		const userIsActiveRaw = String(body?.user_is_active ?? '').trim();
		const userIsActiveNumber = Number(userIsActiveRaw);
		const profIsActiveRaw = String(body?.prof_is_active ?? '').trim();
		const profIsActiveNumber = Number(profIsActiveRaw);
		const specialtyRaw = String(body?.spe_id_specialty ?? '').trim();
		const specialtyId = toIntOr(specialtyRaw, 0);

		const payload: CreateProfessionalWithUserPayload = {
			rol_id_role: roleId,
			first_name: String(body?.first_name || '').trim(),
			last_name: String(body?.last_name || '').trim(),
			phone_number: String(body?.phone_number || '').trim(),
			user_is_active:
				userIsActiveRaw === ''
					? 1
					: (Number.isFinite(userIsActiveNumber) ? userIsActiveNumber : 1) as 0 | 1,
			prof_is_active:
				profIsActiveRaw === ''
					? 1
					: (Number.isFinite(profIsActiveNumber) ? profIsActiveNumber : 1) as 0 | 1,
		};

		const email = String(body?.email ?? '').trim();
		if (email !== '') payload.email = email;

		const apexUserName = String(body?.apex_user_name ?? '').trim();
		if (apexUserName !== '') payload.apex_user_name = apexUserName;

		const profileSlug = String(body?.profile_slug ?? '').trim();
		if (profileSlug !== '') payload.profile_slug = profileSlug;

		if (specialtyRaw !== '' && specialtyId > 0) {
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

		const created = await createProfessionalWithUserWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: created.message,
				id_user: created.id_user,
				id_professional: created.id_professional,
			},
			{ status: 201 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible crear el personal.');
	}
};
