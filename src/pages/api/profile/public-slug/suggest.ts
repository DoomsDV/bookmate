import type { APIRoute } from 'astro';

import {
	MyProfileApiError,
	suggestPublicSlugWithOrds,
} from '../../../lib/my-profile';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const createProfileError = (message: string, status = 400) =>
	new MyProfileApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createProfileError, 'No hay sesion valida para procesar el perfil.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is MyProfileApiError => value instanceof MyProfileApiError,
		createError: createProfileError,
	});

export const GET: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const url = new URL(request.url);
		const fullName = String(url.searchParams.get('name') || '').trim();

		const result = await suggestPublicSlugWithOrds(token, fullName);

		return Response.json(
			{
				status: 'success',
				slug: result.slug,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible sugerir el enlace personal.');
	}
};
