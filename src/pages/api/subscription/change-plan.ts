import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../config/capabilities';
import { hasCapability } from '../../../lib/permissions';

import { changePlanWithOrds, SubscriptionApiError } from '../../../lib/subscription';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SubscriptionApiError('No hay sesion valida para cambiar de plan.', 401);
	}
	return token;
};

const requireAdminRole = (locals: App.Locals) => {
	if (!hasCapability(locals, CAPABILITIES.PLAN_MANAGE)) {
		throw new SubscriptionApiError('Solo el administrador puede cambiar el plan.', 403);
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

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals);
		const body = await request.json().catch(() => ({}));
		const planCode = String((body as any)?.plan_code ?? '').trim().toUpperCase();
		if (!planCode) throw new SubscriptionApiError('Falta el código de plan.', 400);
		const result = await changePlanWithOrds(token, planCode);
		const message = result.scheduled
			? `Cambio a ${result.pending_plan_code || planCode} programado.`
			: 'Plan actualizado.';
		return Response.json({ status: 'success', message, data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible cambiar el plan.');
	}
};
