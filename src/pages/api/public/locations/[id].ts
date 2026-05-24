import type { APIRoute } from 'astro';

import { getPublicLocationWithOrds } from '../../../../lib/public-booking';
import { publicBookingErrorResponse, toPositiveInt } from '../../../../lib/public-api-handlers';

export const GET: APIRoute = async ({ params }) => {
	try {
		const locationId = toPositiveInt(params.id);
		const location = await getPublicLocationWithOrds(locationId);

		return Response.json(
			{
				status: 'success',
				data: [location],
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cargar la ubicación.');
	}
};
