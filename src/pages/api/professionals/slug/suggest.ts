import type { APIRoute } from 'astro';

import {
	ProfessionalsApiError,
	suggestProfessionalSlugWithOrds,
} from '../../../../lib/professionals';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../../utils/api-helpers';

const createProfessionalError = (message: string, status = 400) =>
	new ProfessionalsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(
		token,
		createProfessionalError,
		'No hay sesion valida para procesar personal.'
	);

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is ProfessionalsApiError =>
			value instanceof ProfessionalsApiError,
		createError: createProfessionalError,
	});

export const GET: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const url = new URL(request.url);
		const fullName = String(url.searchParams.get('name') || '').trim();

		if (!fullName) {
			throw new ProfessionalsApiError('Debe proporcionar un nombre para generar el slug.', 400);
		}

		const result = await suggestProfessionalSlugWithOrds(token, fullName);

		return Response.json(
			{
				status: 'success',
				slug: result.slug,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible sugerir el slug del perfil.');
	}
};
