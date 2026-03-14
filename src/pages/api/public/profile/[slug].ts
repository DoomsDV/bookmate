import type { APIRoute } from 'astro';

import { getPublicProfileWithOrds, PublicBookingApiError } from '../../../../lib/public-booking';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const bookingError =
		error instanceof PublicBookingApiError
			? error
			: new PublicBookingApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: bookingError.message,
			details: bookingError.details,
		},
		{ status: bookingError.status }
	);
};

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
		return toErrorResponse(error, 'No fue posible cargar el perfil del profesional.');
	}
};
