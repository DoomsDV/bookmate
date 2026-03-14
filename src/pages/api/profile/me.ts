import type { APIRoute } from 'astro';

import {
	getMyProfileWithOrds,
	MyProfileApiError,
	type UpdateMyProfilePayload,
	updateMyProfileWithOrds,
} from '../../../lib/my-profile';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new MyProfileApiError('No hay sesion valida para procesar el perfil.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const profileError =
		error instanceof MyProfileApiError ? error : new MyProfileApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: profileError.message,
			details: profileError.details,
			errors: profileError.fieldErrors,
		},
		{ status: profileError.status }
	);
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		first_name: formData.get('first_name'),
		last_name: formData.get('last_name'),
		phone_number: formData.get('phone_number'),
		profile_slug: formData.get('profile_slug'),
		image_base64: formData.get('image_base64'),
		image_name: formData.get('image_name'),
		image_mime: formData.get('image_mime'),
	};
};

const parseUpdatePayload = (source: any): UpdateMyProfilePayload => {
	const payload: UpdateMyProfilePayload = {};

	const firstName = String(source?.first_name ?? '').trim();
	if (firstName !== '') payload.first_name = firstName;

	const lastName = String(source?.last_name ?? '').trim();
	if (lastName !== '') payload.last_name = lastName;

	const phone = String(source?.phone_number ?? '').trim();
	if (phone !== '') payload.phone_number = phone;

	const profileSlug = String(source?.profile_slug ?? '').trim();
	if (profileSlug !== '') payload.profile_slug = profileSlug;

	const imageBase64 = String(source?.image_base64 ?? '').trim();
	if (imageBase64 !== '') {
		payload.image_base64 = imageBase64;
		payload.image_name = String(source?.image_name ?? '').trim();
		payload.image_mime = String(source?.image_mime ?? '').trim();
	}

	return payload;
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		const profile = await getMyProfileWithOrds(token);

		return Response.json(
			{
				status: 'success',
				data: profile,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el perfil.');
	}
};

export const PUT: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);
		const updated = await updateMyProfileWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar el perfil.');
	}
};
