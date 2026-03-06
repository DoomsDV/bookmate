import type { APIRoute } from 'astro';

import {
	ProfessionalsApiError,
	suggestProfessionalSlugWithOrds,
} from '../../../../lib/professionals';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new ProfessionalsApiError('No hay sesion valida para procesar personal.', 401);
	}
	return token;
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
