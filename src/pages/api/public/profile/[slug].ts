import type { APIRoute } from 'astro';

import { getPublicProfileWithOrds, PublicBookingApiError } from '../../../../lib/public-booking';
import { publicBookingErrorResponse } from '../../../../lib/public-api-handlers';

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = String(params.slug || '').trim();
		if (!slug) {
			throw new PublicBookingApiError('Slug de profesional requerido.', 400);
		}

		const profile = await getPublicProfileWithOrds(slug);
		return Response.json(
			{
				status: 'success',
				data: profile,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cargar el perfil del profesional.');
	}
};
