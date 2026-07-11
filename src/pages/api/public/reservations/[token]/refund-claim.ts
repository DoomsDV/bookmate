import type { APIRoute } from 'astro';

import {
	PublicBookingApiError,
	submitRefundClaimWithOrds,
} from '../../../../../lib/public-booking';
import {
	parseRequestBody,
	publicBookingErrorResponse,
} from '../../../../../lib/public-api-handlers';

const parseToken = (value: string | undefined) => String(value || '').trim();

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const token = parseToken(params.token);
		if (!token) throw new PublicBookingApiError('Token de reserva requerido.', 400);

		const body = await parseRequestBody(request).catch(() => ({}));
		const result = await submitRefundClaimWithOrds(
			token,
			String((body as any)?.notes || '').trim() || undefined
		);

		return Response.json(
			{
				status: 'success',
				message: result.message,
				data: result.data,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible registrar el reclamo.');
	}
};
