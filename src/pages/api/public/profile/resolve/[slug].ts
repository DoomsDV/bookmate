import type { APIRoute } from 'astro';

import { PublicBookingApiError, resolvePublicProfileSlugWithOrds } from '../../../../../lib/public-booking';
import { publicBookingErrorResponse } from '../../../../../lib/public-api-handlers';

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = String(params.slug || '').trim();
		if (!slug) {
			throw new PublicBookingApiError('Slug de profesional requerido.', 400);
		}

		const resolved = await resolvePublicProfileSlugWithOrds(slug);
		return Response.json(
			{
				status: 'success',
				data: resolved,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible resolver el enlace del perfil.');
	}
};
