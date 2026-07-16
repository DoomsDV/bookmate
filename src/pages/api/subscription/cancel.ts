import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import { cancelSubscriptionWithOrds, SubscriptionApiError } from '../../../lib/subscription';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SubscriptionApiError('No hay sesion valida para terminar la suscripcion.', 401);
	}
	return token;
};

const requireAdminRole = (roleId: number | undefined) => {
	if (Number(roleId || 0) !== ROLES.ADMIN) {
		throw new SubscriptionApiError('Solo el administrador puede terminar la suscripcion.', 403);
	}
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

export const POST: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const result = await cancelSubscriptionWithOrds(token);
		const message = result.applied
			? 'Suscripcion terminada. Tu cuenta quedo en modo solo lectura.'
			: 'Cancelacion programada para el fin del periodo.';
		return Response.json({ status: 'success', message, data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible terminar la suscripcion.');
	}
};
