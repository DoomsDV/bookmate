import type { APIRoute } from 'astro';

import {
	AppointmentsApiError,
	createAppointmentWithOrds,
} from '../../lib/appointments';
import { parseCreateAppointmentPayload } from './appointments/schemas';
import {
	parseRequestBody,
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../utils/api-helpers';

const createAppointmentsError = (message: string, status = 400) =>
	new AppointmentsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createAppointmentsError, 'No hay sesion valida para crear citas.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is AppointmentsApiError => value instanceof AppointmentsApiError,
		createError: createAppointmentsError,
	});

const parseBody = (request: Request) =>
	parseRequestBody(request, (formData) => ({
		loc_id_location: formData.get('loc_id_location'),
		pro_id_professional: formData.get('pro_id_professional'),
		ser_id_service: formData.get('ser_id_service'),
		customer_name: formData.get('customer_name'),
		customer_phone: formData.get('customer_phone'),
		start_time: formData.get('start_time'),
		end_time: formData.get('end_time'),
	}));

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const body = await parseBody(request);
		const payload = parseCreateAppointmentPayload(body);
		const created = await createAppointmentWithOrds(token, payload);

		return Response.json(
			{
				status: 'success',
				message: created.message,
				id_appointment: created.id_appointment,
			},
			{ status: 201 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible crear la cita.');
	}
};
