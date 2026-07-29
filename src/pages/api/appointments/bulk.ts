import type { APIRoute } from 'astro';

import {
	AppointmentsApiError,
	createAppointmentsBulkWithOrds,
} from '../../../lib/appointments';
import { parseBulkAppointmentsPayload } from './schemas';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const createAppointmentsError = (message: string, status = 400) =>
	new AppointmentsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createAppointmentsError, 'No hay sesion valida para crear citas.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is AppointmentsApiError => value instanceof AppointmentsApiError,
		createError: createAppointmentsError,
	});

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			throw createAppointmentsError('El cuerpo de la solicitud no es JSON válido.', 400);
		}

		const rows = parseBulkAppointmentsPayload(body);
		const result = await createAppointmentsBulkWithOrds(token, rows);

		return Response.json(
			{
				status: 'success',
				message:
					result.failed === 0
						? `Se guardaron ${result.created} citas.`
						: `Se guardaron ${result.created} citas y ${result.failed} fallaron.`,
				data: result,
			},
			{ status: result.created > 0 ? 201 : 400 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible guardar las citas.');
	}
};
