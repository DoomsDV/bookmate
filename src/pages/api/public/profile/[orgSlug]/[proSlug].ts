import type { APIRoute } from 'astro';

import { getPublicProfileWithOrds, PublicBookingApiError } from '../../../../../lib/public-booking';
import { publicBookingErrorResponse } from '../../../../../lib/public-api-handlers';

export const GET: APIRoute = async ({ params }) => {
	try {
		const orgSlug = String(params.orgSlug || '').trim();
		const proSlug = String(params.proSlug || '').trim();
		if (!orgSlug || !proSlug) {
			throw new PublicBookingApiError('Slug de organización y profesional requeridos.', 400);
		}

		const profile = await getPublicProfileWithOrds(orgSlug, proSlug);
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
