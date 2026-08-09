import type { APIRoute } from 'astro';

import { getPublicAvailableDatesWithOrds } from '../../../lib/public-booking';
import {
	publicBookingErrorResponse,
	publicCachedJsonResponse,
	toPositiveInt,
} from '../../../lib/public-api-handlers';

export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url);
		const proId = toPositiveInt(url.searchParams.get('pro_id'));
		const locId = toPositiveInt(url.searchParams.get('loc_id'));
		const serId = toPositiveInt(url.searchParams.get('ser_id'));
		const fromDate = String(url.searchParams.get('from_date') || '').trim();
		const toDate = String(url.searchParams.get('to_date') || '').trim();
		const excludeAppId = toPositiveInt(url.searchParams.get('exclude_app_id'));

		const dates = await getPublicAvailableDatesWithOrds({
			pro_id: proId,
			loc_id: locId,
			ser_id: serId,
			from_date: fromDate,
			to_date: toDate,
			exclude_app_id: excludeAppId > 0 ? excludeAppId : undefined,
		});

		return publicCachedJsonResponse({
			status: 'success',
			data: dates,
		});
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cargar fechas disponibles.');
	}
};
