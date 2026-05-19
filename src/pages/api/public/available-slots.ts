import type { APIRoute } from 'astro';

import {
	getPublicAvailableSlotsWithOrds,
} from '../../../lib/public-booking';
import {
	publicBookingErrorResponse,
	toPositiveInt,
} from '../../../lib/public-api-handlers';

export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url);
		const proId = toPositiveInt(url.searchParams.get('pro_id'));
		const locId = toPositiveInt(url.searchParams.get('loc_id'));
		const serId = toPositiveInt(url.searchParams.get('ser_id'));
		const targetDate = String(url.searchParams.get('target_date') || '').trim();
		const excludeAppId = toPositiveInt(url.searchParams.get('exclude_app_id'));

		const slots = await getPublicAvailableSlotsWithOrds({
			pro_id: proId,
			loc_id: locId,
			ser_id: serId,
			target_date: targetDate,
			exclude_app_id: excludeAppId > 0 ? excludeAppId : undefined,
		});

		return Response.json(
			{
				status: 'success',
				data: slots,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cargar horarios disponibles.');
	}
};
