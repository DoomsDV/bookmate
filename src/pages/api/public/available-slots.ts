import type { APIRoute } from 'astro';

import {
	getPublicAvailableSlotsWithOrds,
	PublicBookingApiError,
} from '../../../lib/public-booking';

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

const toPositiveInt = (value: string | null) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url);
		const proId = toPositiveInt(url.searchParams.get('pro_id'));
		const locId = toPositiveInt(url.searchParams.get('loc_id'));
		const serId = toPositiveInt(url.searchParams.get('ser_id'));
		const targetDate = String(url.searchParams.get('target_date') || '').trim();

		const slots = await getPublicAvailableSlotsWithOrds({
			pro_id: proId,
			loc_id: locId,
			ser_id: serId,
			target_date: targetDate,
		});

		return Response.json(
			{
				status: 'success',
				data: slots,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible cargar horarios disponibles.');
	}
};
