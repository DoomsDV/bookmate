import type { APIRoute } from 'astro';

import { insistRefundDisputeWithOrds, PublicBookingApiError } from '../../../../../../lib/public-booking';
import { publicBookingErrorResponse } from '../../../../../../lib/public-api-handlers';

export const POST: APIRoute = async ({ params }) => {
	try {
		const token = String(params.token || '').trim();
		if (!token) throw new PublicBookingApiError('Token de reserva requerido.', 400);

		const result = await insistRefundDisputeWithOrds(token);
		return Response.json(
			{
				status: 'success',
				message: result.message,
				data: result.data,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible registrar el seguimiento.');
	}
};
