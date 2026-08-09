import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import { activateSubscriptionWithOrds, readIdempotencyKeyHeader, SubscriptionApiError } from '../../../lib/subscription';

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
		const targetTypeRaw = String(body?.target_type ?? 'PLAN').trim().toUpperCase();
		const targetType = targetTypeRaw === 'STORAGE_ADDON' ? 'STORAGE_ADDON' : 'PLAN';
		const payload =
			targetType === 'STORAGE_ADDON'
				? { target_type: 'STORAGE_ADDON' as const, addon_code: String(body?.addon_code ?? '').trim().toUpperCase() }
				: { target_type: 'PLAN' as const, plan_code: String(body?.plan_code ?? '').trim().toUpperCase() };
		const idempotencyKey = readIdempotencyKeyHeader(request);
		const result = await activateSubscriptionWithOrds(locals.token, payload, idempotencyKey);
		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible activar la suscripción.');
	}
};
