import type { APIRoute } from 'astro';

import {
	cancelPublicReservationWithOrds,
	getPublicReservationWithOrds,
	PublicBookingApiError,
	updatePublicReservationWithOrds,
	type PublicReservationUpdatePayload,
} from '../../../../lib/public-booking';
import {
	parseRequestBody,
	publicBookingErrorResponse,
} from '../../../../lib/public-api-handlers';

const parseToken = (value: string | undefined) => String(value || '').trim();

const parseUpdatePayload = (source: any): PublicReservationUpdatePayload => {
	const payload = {
		start_time: String(source?.start_time || '').trim(),
		end_time: String(source?.end_time || '').trim(),
	};

	if (!payload.start_time || !payload.end_time) {
		throw new PublicBookingApiError('start_time y end_time son obligatorios.', 400);
	}

	return payload;
};

export const GET: APIRoute = async ({ params }) => {
	try {
		const token = parseToken(params.token);
		const reservation = await getPublicReservationWithOrds(token);

		return Response.json(
			{
				status: 'success',
				data: reservation,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cargar la reserva.');
	}
};

export const PUT: APIRoute = async ({ request, params }) => {
	try {
		const token = parseToken(params.token);
		const body = await parseRequestBody(request);
		const payload = parseUpdatePayload(body);
		const updated = await updatePublicReservationWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible actualizar la reserva.');
	}
};

export const DELETE: APIRoute = async ({ params }) => {
	try {
		const token = parseToken(params.token);
		const cancelled = await cancelPublicReservationWithOrds(token);

		return Response.json(
			{
				status: 'success',
				message: cancelled.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible cancelar la reserva.');
	}
};

