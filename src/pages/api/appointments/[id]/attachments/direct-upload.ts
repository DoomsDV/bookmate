import type { APIRoute } from 'astro';

import { APPOINTMENTS_URL, AppointmentsApiError } from '../../../../../lib/appointments';
import { APPOINTMENT_ATTACHMENT_MAX_BYTES } from '../../../../../lib/appointment-attachment';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toPositiveInt,
} from '../../../../../utils/api-helpers';

const createAppointmentsError = (message: string, status = 400) =>
	new AppointmentsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createAppointmentsError, 'No hay sesion valida para procesar citas.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is AppointmentsApiError => value instanceof AppointmentsApiError,
		createError: createAppointmentsError,
	});

/**
 * Ticket corto para POST directo a ORDS. Vercel corta bodies ~4.5 MB (413);
 * el JWT de sesión no viaja en cookie hacia Oracle, así que el BFF lo entrega
 * una sola vez y el cliente no lo persiste.
 */
export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const appointmentId = toPositiveInt(params.id, 0);
		if (!appointmentId) {
			throw new AppointmentsApiError('ID de cita invalido.', 400);
		}

		return Response.json(
			{
				status: 'success',
				data: {
					url: `${APPOINTMENTS_URL}/${appointmentId}/attachments`,
					authorization: `Bearer ${token}`,
					max_bytes: APPOINTMENT_ATTACHMENT_MAX_BYTES,
				},
			},
			{
				status: 200,
				headers: {
					'Cache-Control': 'no-store',
				},
			}
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible preparar la subida del archivo.');
	}
};
