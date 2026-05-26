import type { APIRoute } from 'astro';

import { AuthApiError, listMyOrganizationsWithOrds } from '../../../lib/auth';
import { requireToken, toErrorResponse } from '../../../utils/api-helpers';

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token, (message, status) => new AuthApiError(message, status));
		const data = await listMyOrganizationsWithOrds(token);
		return Response.json({
			success: true,
			...data,
		});
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener tus organizaciones.', {
			isKnownError: (value): value is AuthApiError => value instanceof AuthApiError,
			createError: (message, status) => new AuthApiError(message, status),
		});
	}
};
