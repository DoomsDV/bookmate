import type { APIRoute } from 'astro';

import { getSubscriptionWithOrds, SubscriptionApiError } from '../../lib/subscription';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SubscriptionApiError('No hay sesion valida para consultar la suscripción.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const subscriptionError =
		error instanceof SubscriptionApiError
			? error
			: new SubscriptionApiError(fallbackMessage, 500);

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
		const subscription = await getSubscriptionWithOrds(token);

		return Response.json(
			{
				status: 'success',
				data: subscription,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener la suscripción.');
	}
};
