import type { APIRoute } from 'astro';

import {
	AppointmentsApiError,
	createAppointmentWithOrds,
	type AppointmentCreatePayload,
} from '../../lib/appointments';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new AppointmentsApiError('No hay sesion valida para crear citas.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const appointmentError =
		error instanceof AppointmentsApiError ? error : new AppointmentsApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: appointmentError.message,
			details: appointmentError.details,
			errors: appointmentError.fieldErrors,
		},
		{ status: appointmentError.status }
	);
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		loc_id_location: formData.get('loc_id_location'),
		pro_id_professional: formData.get('pro_id_professional'),
		ser_id_service: formData.get('ser_id_service'),
		customer_name: formData.get('customer_name'),
		customer_phone: formData.get('customer_phone'),
		start_time: formData.get('start_time'),
		end_time: formData.get('end_time'),
	};
};

const toPositiveInt = (value: unknown) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const parseCreatePayload = (source: any): AppointmentCreatePayload => {
	const payload: AppointmentCreatePayload = {
		loc_id_location: toPositiveInt(source?.loc_id_location),
		pro_id_professional: toPositiveInt(source?.pro_id_professional),
		ser_id_service: toPositiveInt(source?.ser_id_service),
		customer_name: String(source?.customer_name || '').trim(),
		customer_phone: String(source?.customer_phone || '').trim(),
		start_time: String(source?.start_time || '').trim(),
		end_time: String(source?.end_time || '').trim(),
	};

	if (!payload.loc_id_location || !payload.pro_id_professional || !payload.ser_id_service) {
		throw new AppointmentsApiError(
			'Sucursal, profesional y servicio son obligatorios para crear una cita.',
			400
		);
	}
	if (!payload.customer_name) {
		throw new AppointmentsApiError('El nombre del cliente es obligatorio.', 400);
	}
	if (!payload.start_time || !payload.end_time) {
		throw new AppointmentsApiError('La fecha y hora de inicio/fin son obligatorias.', 400);
	}

	return payload;
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const body = await parseBody(request);
		const payload = parseCreatePayload(body);
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
