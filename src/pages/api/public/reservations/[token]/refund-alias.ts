import type { APIRoute } from 'astro';

import {
	PublicBookingApiError,
	submitRefundAliasWithOrds,
} from '../../../../../lib/public-booking';
import { parseSipapAlias } from '../../../../../lib/sipap-alias';
import {
	parseRequestBody,
	publicBookingErrorResponse,
} from '../../../../../lib/public-api-handlers';

const parseToken = (value: string | undefined) => String(value || '').trim();

export const POST: APIRoute = async ({ request, params }) => {
	try {
		const token = parseToken(params.token);
		const body = await parseRequestBody(request);
		const parsed = parseSipapAlias(String(body?.refund_alias || ''));
		if (!parsed.isValid) {
			throw new PublicBookingApiError(parsed.message, 400);
		}

		const result = await submitRefundAliasWithOrds(token, parsed.normalized);
		return Response.json(
			{
				status: 'success',
				message: result.message,
				data: {
					refund_status: result.refund_status,
					refund_amount: result.refund_amount,
				},
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible guardar el alias.');
	}
};
