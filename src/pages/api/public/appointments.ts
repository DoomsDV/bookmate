import type { APIRoute } from 'astro';

import {
	createPublicAppointmentWithOrds,
	PublicBookingApiError,
	type PublicCreateAppointmentPayload,
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

const toPositiveInt = (value: unknown) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const parseRequestBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		org_id_organization: formData.get('org_id_organization'),
		loc_id_location: formData.get('loc_id_location'),
		pro_id_professional: formData.get('pro_id_professional'),
		ser_id_service: formData.get('ser_id_service'),
		customer_name: formData.get('customer_name'),
		customer_phone: formData.get('customer_phone'),
		start_time: formData.get('start_time'),
		end_time: formData.get('end_time'),
	};
};

const parsePayload = (source: any): PublicCreateAppointmentPayload => {
	const payload: PublicCreateAppointmentPayload = {
		org_id_organization: toPositiveInt(source?.org_id_organization),
		loc_id_location: toPositiveInt(source?.loc_id_location),
		pro_id_professional: toPositiveInt(source?.pro_id_professional),
		ser_id_service: toPositiveInt(source?.ser_id_service),
		customer_name: String(source?.customer_name || '').trim(),
		customer_phone: String(source?.customer_phone || '').trim(),
		start_time: String(source?.start_time || '').trim(),
		end_time: String(source?.end_time || '').trim(),
	};

	if (
		!payload.org_id_organization ||
		!payload.loc_id_location ||
		!payload.pro_id_professional ||
		!payload.ser_id_service
	) {
		throw new PublicBookingApiError(
			'org_id_organization, loc_id_location, pro_id_professional y ser_id_service son obligatorios.',
			400
		);
	}

	if (!payload.customer_name || !payload.customer_phone) {
		throw new PublicBookingApiError('Nombre y telefono del paciente son obligatorios.', 400);
	}

	if (!payload.start_time || !payload.end_time) {
		throw new PublicBookingApiError('start_time y end_time son obligatorios.', 400);
	}

	return payload;
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseRequestBody(request);
		const payload = parsePayload(body);
		const created = await createPublicAppointmentWithOrds(payload);

		return Response.json(
			{
				status: 'success',
				message: created.message,
			},
			{ status: created.statusCode === 200 ? 201 : created.statusCode }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible confirmar la cita.');
	}
};
