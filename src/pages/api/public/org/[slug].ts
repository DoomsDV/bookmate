import type { APIRoute } from 'astro';

import { PublicBookingApiError } from '../../../../lib/public-booking';
import { publicBookingErrorResponse } from '../../../../lib/public-api-handlers';
import { getPublicOrgHubWithOrds } from '../../../../lib/public-org-hub';

export const GET: APIRoute = async ({ params }) => {
	try {
		const slug = String(params.slug || '').trim();
		if (!slug) {
			throw new PublicBookingApiError('Slug de organización requerido.', 400);
		}

		const hub = await getPublicOrgHubWithOrds(slug);
		return Response.json(
			{
				status: 'success',
				data: hub,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cargar el perfil del negocio.');
	}
};
