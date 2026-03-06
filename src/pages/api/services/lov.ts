import type { APIRoute } from 'astro';

import { ServicesApiError, listServicesLovWithOrds } from '../../../lib/services';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const serviceError =
		error instanceof ServicesApiError ? error : new ServicesApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: serviceError.message,
			details: serviceError.details,
			errors: serviceError.fieldErrors,
		},
		{ status: serviceError.status }
	);
};

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new ServicesApiError('No hay sesion valida para consultar servicios.', 401);
	}
	return token;
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		const services = await listServicesLovWithOrds(token);

		return Response.json(
			{
				status: 'success',
				data: services,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los servicios activos.');
	}
};
