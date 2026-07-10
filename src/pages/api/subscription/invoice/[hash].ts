import type { APIRoute } from 'astro';

import { getInvoiceStatusWithOrds, SubscriptionApiError } from '../../../../lib/subscription';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SubscriptionApiError('No hay sesion valida para consultar la factura.', 401);
	}
	return token;
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

export const GET: APIRoute = async ({ locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const hash = String(params.hash ?? '').trim();
		if (!hash) throw new SubscriptionApiError('Falta el identificador de la factura.', 400);
		const invoice = await getInvoiceStatusWithOrds(token, hash);
		return Response.json({ status: 'success', data: invoice }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el estado de la factura.');
	}
};
