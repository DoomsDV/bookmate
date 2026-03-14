import type { APIRoute } from 'astro';

import {
	AppointmentsApiError,
	deleteAppointmentWithOrds,
	getAppointmentByIdWithOrds,
	type AppointmentUpdatePayload,
	updateAppointmentWithOrds,
} from '../../../lib/appointments';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new AppointmentsApiError('No hay sesion valida para procesar citas.', 401);
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

const parseAppointmentId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const toPositiveInt = (value: unknown) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
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
		status: formData.get('status'),
	};
};

const parseUpdatePayload = (source: any): AppointmentUpdatePayload => {
	const status = String(source?.status || '').trim().toUpperCase();
	if (!['PENDIENTE', 'CONFIRMADO', 'COMPLETADO', 'CANCELADO'].includes(status)) {
		throw new AppointmentsApiError('El estado de la cita es invalido.', 400);
	}

	const payload: AppointmentUpdatePayload = {
		loc_id_location: toPositiveInt(source?.loc_id_location),
		pro_id_professional: toPositiveInt(source?.pro_id_professional),
		ser_id_service: toPositiveInt(source?.ser_id_service),
		customer_name: String(source?.customer_name || '').trim(),
		customer_phone: String(source?.customer_phone || '').trim(),
		start_time: String(source?.start_time || '').trim(),
		end_time: String(source?.end_time || '').trim(),
		status: status as AppointmentUpdatePayload['status'],
	};

	if (!payload.loc_id_location || !payload.pro_id_professional || !payload.ser_id_service) {
		throw new AppointmentsApiError(
			'Sucursal, profesional y servicio son obligatorios para actualizar una cita.',
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

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const appointmentId = parseAppointmentId(params.id);
		if (!appointmentId) {
			throw new AppointmentsApiError('ID de cita invalido.', 400);
		}

		const appointment = await getAppointmentByIdWithOrds(token, appointmentId);
		return Response.json(
			{
				status: 'success',
				data: appointment,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener la cita.');
	}
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const appointmentId = parseAppointmentId(params.id);
		if (!appointmentId) {
			throw new AppointmentsApiError('ID de cita invalido.', 400);
		}

		const body = await parseBody(request);
		const payload = parseUpdatePayload(body);
		const updated = await updateAppointmentWithOrds(token, appointmentId, payload);

		return Response.json(
			{
				status: 'success',
				message: updated.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar la cita.');
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const appointmentId = parseAppointmentId(params.id);
		if (!appointmentId) {
			throw new AppointmentsApiError('ID de cita invalido.', 400);
		}

		const deleted = await deleteAppointmentWithOrds(token, appointmentId);

		return Response.json(
			{
				status: 'success',
				message: deleted.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar la cita.');
	}
};
