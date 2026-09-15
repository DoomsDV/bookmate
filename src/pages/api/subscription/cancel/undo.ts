import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../../config/capabilities';
import { hasCapability } from '../../../../lib/permissions';

import { SubscriptionApiError, undoCancelSubscriptionWithOrds } from '../../../../lib/subscription';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SubscriptionApiError('No hay sesion valida para anular la cancelacion.', 401);
	}
	return token;
};

const requireAdminRole = (locals: App.Locals) => {
	if (!hasCapability(locals, CAPABILITIES.PLAN_MANAGE)) {
		throw new SubscriptionApiError('Solo el administrador puede anular la cancelacion.', 403);
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
		requireAdminRole(locals);
		const result = await undoCancelSubscriptionWithOrds(token);
		return Response.json(
			{
				status: 'success',
				message: 'Cancelacion anulada. Seguis con tu plan actual.',
				data: result,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible anular la cancelacion.');
	}
};
