import type { APIRoute } from 'astro';

import { AppointmentsApiError, listAppointmentsForCalendarWithOrds } from '../../../lib/appointments';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toOptionalPositiveInt,
} from '../../../utils/api-helpers';

const createAppointmentsError = (message: string, status = 400) =>
	new AppointmentsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createAppointmentsError, 'No hay sesion valida para consultar citas.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is AppointmentsApiError => value instanceof AppointmentsApiError,
		createError: createAppointmentsError,
	});

export const GET: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const url = new URL(request.url);
		const start = String(url.searchParams.get('start') || '').trim();
		const end = String(url.searchParams.get('end') || '').trim();
		const proId = toOptionalPositiveInt(url.searchParams.get('pro_id'));
		const locId = toOptionalPositiveInt(url.searchParams.get('loc_id'));
		console.info('[appointments-calendar] request:start', {
			start,
			end,
			proId: proId ?? null,
			locId: locId ?? null,
			hasToken: Boolean(token),
		});

		const events = await listAppointmentsForCalendarWithOrds(token, {
			start,
			end,
			pro_id: proId,
			loc_id: locId,
		});
		console.info('[appointments-calendar] request:success', {
			totalEvents: events.length,
		});

		return Response.json(
			{
				status: 'success',
				data: events,
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('[appointments-calendar] request:error', error);
		return toErrorResponse(error, 'No fue posible cargar las citas del calendario.');
	}
};
