import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import {
	createSubscriptionCheckoutWithOrds,
	readIdempotencyKeyHeader,
	SubscriptionApiError,
	type CheckoutPayload,
} from '../../../lib/subscription';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SubscriptionApiError('No hay sesion valida para iniciar el pago.', 401);
	}
	return token;
};

const requireAdminRole = (roleId: number | undefined) => {
	if (Number(roleId || 0) !== ROLES.ADMIN) {
		throw new SubscriptionApiError('Solo el administrador puede gestionar la facturación del plan.', 403);
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

const parsePayload = (source: any): CheckoutPayload => {
	const targetType = String(source?.target_type ?? 'PLAN').trim().toUpperCase();
	if (targetType !== 'PLAN' && targetType !== 'STORAGE_ADDON') {
		throw new SubscriptionApiError('target_type inválido (PLAN o STORAGE_ADDON).', 400);
	}

	const formaPagoRaw = Number(source?.forma_pago ?? 9);
	const formaPago = formaPagoRaw === 24 ? 24 : 9;

	if (targetType === 'PLAN') {
		const planCode = String(source?.plan_code ?? '').trim().toUpperCase();
		if (!planCode) throw new SubscriptionApiError('Falta el código de plan.', 400);
		return { target_type: 'PLAN', plan_code: planCode, forma_pago: formaPago };
	}

	const addonCode = String(source?.addon_code ?? '').trim().toUpperCase();
	if (!addonCode) throw new SubscriptionApiError('Falta el código de paquete de almacenamiento.', 400);
	return { target_type: 'STORAGE_ADDON', addon_code: addonCode, forma_pago: formaPago };
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		requireAdminRole(locals.roleId);
		const body = await request.json().catch(() => ({}));
		const payload = parsePayload(body);
		const idempotencyKey = readIdempotencyKeyHeader(request);
		const result = await createSubscriptionCheckoutWithOrds(token, payload, idempotencyKey);
		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible iniciar el pago de la suscripción.');
	}
};
