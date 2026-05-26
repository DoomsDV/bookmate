import type { APIRoute } from 'astro';

import {
	createPublicAppointmentWithOrds,
	PublicBookingApiError,
	type PublicCreateAppointmentPayload,
} from '../../../lib/public-booking';
import {
	parseRequestBody,
	publicBookingErrorResponse,
	toPositiveInt,
} from '../../../lib/public-api-handlers';

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

	if (source?.reserve_for_deposit === true || source?.reserve_for_deposit === 1 || source?.reserve_for_deposit === '1') {
		payload.reserve_for_deposit = true;
	}

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
				data: created.data,
				appointment_id: created.data?.appointment_id,
			},
			{ status: created.statusCode === 200 ? 201 : created.statusCode }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible confirmar la cita.');
	}
};
