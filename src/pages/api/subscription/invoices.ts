import type { APIRoute } from 'astro';

import { listInvoicesWithOrds, SubscriptionApiError } from '../../../lib/subscription';

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = locals.token;
		if (!token) {
			throw new SubscriptionApiError('No hay sesion valida.', 401);
		}
		const data = await listInvoicesWithOrds(token);
		return Response.json({ status: 'success', data }, { status: 200 });
	} catch (error) {
		const subscriptionError =
			error instanceof SubscriptionApiError
				? error
				: new SubscriptionApiError('No fue posible cargar el historial de facturación.', 500);
		return Response.json(
			{
				status: 'error',
				message: subscriptionError.message,
				details: subscriptionError.details,
			},
			{ status: subscriptionError.status }
		);
	}
};
