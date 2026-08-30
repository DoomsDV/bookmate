import type { APIRoute } from 'astro';

import { openRefundDisputeWithOrds, PublicBookingApiError } from '../../../../../lib/public-booking';
import { parseRequestBody, publicBookingErrorResponse } from '../../../../../lib/public-api-handlers';

const parseToken = (value: string | undefined) => String(value || '').trim();

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const token = parseToken(params.token);
		if (!token) throw new PublicBookingApiError('Token de reserva requerido.', 400);

		const body = (await parseRequestBody(request).catch(() => ({}))) as Record<string, unknown>;
		const result = await openRefundDisputeWithOrds(token, {
			phone_last4: String(body.phone_last4 || '').trim(),
			confirm_open: Boolean(body.confirm_open),
			notes: String(body.notes || '').trim() || undefined,
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
		return publicBookingErrorResponse(error, 'No fue posible abrir la disputa.');
	}
};
