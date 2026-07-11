import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import { listCardsWithOrds, SubscriptionApiError } from '../../../lib/subscription';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const subscriptionError =
		error instanceof SubscriptionApiError ? error : new SubscriptionApiError(fallbackMessage, 500);
	return Response.json(
		{ status: 'error', message: subscriptionError.message, details: subscriptionError.details },
		{ status: subscriptionError.status }
	);
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		if (!locals.token) throw new SubscriptionApiError('No hay sesion valida.', 401);
		if (Number(locals.roleId || 0) !== ROLES.ADMIN) {
			throw new SubscriptionApiError('Solo el administrador puede ver los medios de pago.', 403);
		}
		const cards = await listCardsWithOrds(locals.token);
		return Response.json({ status: 'success', data: { cards } }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener las tarjetas.');
	}
};
