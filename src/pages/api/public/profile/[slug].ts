import type { APIRoute } from 'astro';

import {
	getPublicProfileWithOrdsLegacy,
	PublicBookingApiError,
} from '../../../../lib/public-booking';
import { publicBookingErrorResponse, publicCachedJsonResponse } from '../../../../lib/public-api-handlers';

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = String(params.slug || '').trim();
		if (!slug) {
			throw new PublicBookingApiError('Slug de profesional requerido.', 400);
		}

		const profile = await getPublicProfileWithOrdsLegacy(slug);
		return publicCachedJsonResponse({
			status: 'success',
			data: profile,
		});
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cargar el perfil del profesional.');
	}
};
