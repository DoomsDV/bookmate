import type { APIRoute } from 'astro';

import { getPlansWithOrds, SubscriptionApiError } from '../../../lib/subscription';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SubscriptionApiError('No hay sesion valida para consultar los planes.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const subscriptionError =
		error instanceof SubscriptionApiError ? error : new SubscriptionApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: subscriptionError.message,
			details: subscriptionError.details,
		},
		{ status: subscriptionError.status }
	);
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		const catalog = await getPlansWithOrds(token);
		return Response.json({ status: 'success', data: catalog }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los planes.');
	}
};
