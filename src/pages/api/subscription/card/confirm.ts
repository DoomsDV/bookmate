import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../../config/capabilities';
import { hasCapability } from '../../../../lib/permissions';

import { confirmCardWithOrds, SubscriptionApiError } from '../../../../lib/subscription';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const subscriptionError =
		error instanceof SubscriptionApiError ? error : new SubscriptionApiError(fallbackMessage, 500);
	return Response.json(
		{ status: 'error', message: subscriptionError.message, details: subscriptionError.details },
		{ status: subscriptionError.status }
	);
};

export const POST: APIRoute = async ({ locals }) => {
	try {
		if (!locals.token) throw new SubscriptionApiError('No hay sesion valida.', 401);
		if (!hasCapability(locals, CAPABILITIES.PLAN_MANAGE)) {
			throw new SubscriptionApiError('Solo el administrador puede gestionar la facturación del plan.', 403);
		}
		const cards = await confirmCardWithOrds(locals.token);
		return Response.json({ status: 'success', data: { cards } }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible confirmar la tarjeta.');
	}
};
