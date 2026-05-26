import type { APIRoute } from 'astro';

import {
	createPublicPaymentOrderWithOrds,
	PublicBookingApiError,
	type PublicCreatePaymentPayload,
} from '../../../lib/public-booking';
import {
	parseRequestBody,
	publicBookingErrorResponse,
	toPositiveInt,
} from '../../../lib/public-api-handlers';

const parsePayload = (source: any): PublicCreatePaymentPayload => {
	const formaPago = toPositiveInt(source?.forma_pago, 0);

	if (formaPago !== 9 && formaPago !== 24) {
		throw new PublicBookingApiError('forma_pago debe ser 9 (tarjeta) o 24 (QR).', 400);
	}

	const appointmentId = toPositiveInt(source?.id_appointment, 0);
	if (appointmentId > 0) {
		return {
			id_appointment: appointmentId,
			forma_pago: formaPago as 9 | 24,
		};
	}

	return {
		org_id_organization: toPositiveInt(source?.org_id_organization),
		loc_id_location: toPositiveInt(source?.loc_id_location),
		pro_id_professional: toPositiveInt(source?.pro_id_professional),
		ser_id_service: toPositiveInt(source?.ser_id_service),
		customer_name: String(source?.customer_name || '').trim(),
		customer_phone: String(source?.customer_phone || '').trim(),
		customer_email: String(source?.customer_email || '').trim() || undefined,
		start_time: String(source?.start_time || '').trim(),
		end_time: String(source?.end_time || '').trim(),
		forma_pago: formaPago as 9 | 24,
	};
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseRequestBody(request);
		const payload = parsePayload(body);
		const created = await createPublicPaymentOrderWithOrds(payload);

		return Response.json(
			{
				status: 'success',
				data: created,
			},
			{ status: 201 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible iniciar el pago.');
	}
};

