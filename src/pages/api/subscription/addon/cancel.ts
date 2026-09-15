import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../../config/capabilities';
import { hasCapability } from '../../../../lib/permissions';

import { cancelStorageAddonWithOrds, SubscriptionApiError } from '../../../../lib/subscription';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SubscriptionApiError('No hay sesion valida para cancelar el almacenamiento.', 401);
	}
	return token;
};

const requireAdminRole = (locals: App.Locals) => {
	if (!hasCapability(locals, CAPABILITIES.PLAN_MANAGE)) {
		throw new SubscriptionApiError('Solo el administrador puede cancelar almacenamiento.', 403);
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
		const addonCode = String((body as { addon_code?: string })?.addon_code ?? '')
			.trim()
			.toUpperCase();
		if (!addonCode) throw new SubscriptionApiError('Falta el código del paquete.', 400);
		const result = await cancelStorageAddonWithOrds(token, addonCode);
		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible cancelar el almacenamiento.');
	}
};
