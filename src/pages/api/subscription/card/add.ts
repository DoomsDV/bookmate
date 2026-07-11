import type { APIRoute } from 'astro';

import { ROLES } from '../../../../config/roles';
import { addCardWithOrds, SubscriptionApiError } from '../../../../lib/subscription';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const subscriptionError =
		error instanceof SubscriptionApiError ? error : new SubscriptionApiError(fallbackMessage, 500);
	return Response.json(
		{ status: 'error', message: subscriptionError.message, details: subscriptionError.details },
		{ status: subscriptionError.status }
	);
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		if (!locals.token) throw new SubscriptionApiError('No hay sesion valida.', 401);
		if (Number(locals.roleId || 0) !== ROLES.ADMIN) {
			throw new SubscriptionApiError('Solo el administrador puede gestionar la facturación del plan.', 403);
		}
		const body = await request.json().catch(() => ({}));
		const provider = typeof body?.provider === 'string' ? body.provider.trim() : undefined;
		const result = await addCardWithOrds(locals.token, provider || undefined);
		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible iniciar el registro de la tarjeta.');
	}
};
