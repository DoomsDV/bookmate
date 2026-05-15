import type { APIRoute } from 'astro';

import {
	AppointmentsApiError,
	deleteAppointmentWithOrds,
	getAppointmentByIdWithOrds,
	updateAppointmentWithOrds,
} from '../../../lib/appointments';
import { parseUpdateAppointmentPayload } from './schemas';
import {
	parseRequestBody,
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toPositiveInt,
} from '../../../utils/api-helpers';

const createAppointmentsError = (message: string, status = 400) =>
	new AppointmentsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createAppointmentsError, 'No hay sesion valida para procesar citas.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is AppointmentsApiError => value instanceof AppointmentsApiError,
		createError: createAppointmentsError,
	});

const parseAppointmentId = (value: string | undefined) => toPositiveInt(value, 0);

const parseBody = (request: Request) =>
	parseRequestBody(request, (formData) => ({
		id_customer: formData.get('id_customer'),
		loc_id_location: formData.get('loc_id_location'),
		pro_id_professional: formData.get('pro_id_professional'),
		ser_id_service: formData.get('ser_id_service'),
		customer_name: formData.get('customer_name'),
		customer_phone: formData.get('customer_phone'),
		start_time: formData.get('start_time'),
		end_time: formData.get('end_time'),
		status: formData.get('status'),
	}));

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
		const payload = parseUpdateAppointmentPayload(body);
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
