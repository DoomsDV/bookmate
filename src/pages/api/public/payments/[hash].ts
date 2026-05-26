import type { APIRoute } from 'astro';

import {
	getPublicPaymentStatusWithOrds,
	PublicBookingApiError,
} from '../../../../lib/public-booking';
import { publicBookingErrorResponse } from '../../../../lib/public-api-handlers';

export const GET: APIRoute = async ({ params }) => {
	try {
		const hash = String(params.hash || '').trim();
		if (!hash) {
			throw new PublicBookingApiError('Hash de pago requerido.', 400);
		}

		const data = await getPublicPaymentStatusWithOrds(hash);
		return Response.json(
			{
				status: 'success',
				data,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible consultar el pago.');
	}
};

