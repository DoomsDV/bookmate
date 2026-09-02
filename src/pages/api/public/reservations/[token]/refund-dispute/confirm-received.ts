import type { APIRoute } from 'astro';

import {
	confirmRefundReceivedWithOrds,
	PublicBookingApiError,
} from '../../../../../../lib/public-booking';
import { parseRequestBody, publicBookingErrorResponse } from '../../../../../../lib/public-api-handlers';

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const token = String(params.token || '').trim();
		if (!token) throw new PublicBookingApiError('Token de reserva requerido.', 400);

		const body = (await parseRequestBody(request).catch(() => ({}))) as Record<string, unknown>;
		const result = await confirmRefundReceivedWithOrds(token, {
			phone_last4: String(body.phone_last4 || '').trim(),
		});

		return Response.json(
			{
				status: 'success',
				message: result.message,
				data: result.data,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible confirmar el reembolso.');
	}
};
