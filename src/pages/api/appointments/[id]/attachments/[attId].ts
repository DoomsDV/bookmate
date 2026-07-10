import type { APIRoute } from 'astro';

import {
	AppointmentsApiError,
	deleteAppointmentAttachmentWithOrds,
} from '../../../../../lib/appointments';
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

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const token = requireToken(locals.token);
		const appointmentId = toPositiveInt(params.id, 0);
		const attachmentId = toPositiveInt(params.attId, 0);
		if (!appointmentId) {
			throw new AppointmentsApiError('ID de cita invalido.', 400);
		}
		if (!attachmentId) {
			throw new AppointmentsApiError('ID de adjunto invalido.', 400);
		}

		const result = await deleteAppointmentAttachmentWithOrds(token, appointmentId, attachmentId);

		return Response.json(
			{
				status: 'success',
				message: result.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar el archivo adjunto.');
	}
};
