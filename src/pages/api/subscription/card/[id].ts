import type { APIRoute } from 'astro';

import { ROLES } from '../../../../config/roles';
import { deleteCardWithOrds, SubscriptionApiError } from '../../../../lib/subscription';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const subscriptionError =
		error instanceof SubscriptionApiError ? error : new SubscriptionApiError(fallbackMessage, 500);
	return Response.json(
		{ status: 'error', message: subscriptionError.message, details: subscriptionError.details },
		{ status: subscriptionError.status }
	);
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		if (!locals.token) throw new SubscriptionApiError('No hay sesion valida.', 401);
		if (Number(locals.roleId || 0) !== ROLES.ADMIN) {
			throw new SubscriptionApiError('Solo el administrador puede gestionar la facturación del plan.', 403);
		}
		const cardId = Number(params.id);
		if (!Number.isFinite(cardId) || cardId <= 0) {
			throw new SubscriptionApiError('Identificador de tarjeta inválido.', 400);
		}
		await deleteCardWithOrds(locals.token, cardId);
		return Response.json({ status: 'success', data: {} }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar la tarjeta.');
	}
};
