import type { APIRoute } from 'astro';

import {
	getPublicUserProfileWithOrds,
	PublicUserProfileApiError,
} from '../../../../lib/public-user-profile';
import { publicUserProfileErrorResponse } from '../../../../lib/public-user-api-handlers';

export const GET: APIRoute = async ({ params }) => {
	try {
		const publicSlug = String(params.slug || '').trim();
		if (!publicSlug) {
			throw new PublicUserProfileApiError('Slug de usuario requerido.', 400);
		}

		const profile = await getPublicUserProfileWithOrds(publicSlug);
		return Response.json(
			{
				status: 'success',
				data: profile,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicUserProfileErrorResponse(error, 'No fue posible cargar el perfil público.');
	}
};
