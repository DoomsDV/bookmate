import type { APIRoute } from 'astro';

import { AppointmentsApiError, listAppointmentsForCalendarWithOrds } from '../../../lib/appointments';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new AppointmentsApiError('No hay sesion valida para consultar citas.', 401);
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

const toPositiveInt = (value: unknown) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const GET: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const url = new URL(request.url);
		const start = String(url.searchParams.get('start') || '').trim();
		const end = String(url.searchParams.get('end') || '').trim();
		const proId = toPositiveInt(url.searchParams.get('pro_id'));
		const locId = toPositiveInt(url.searchParams.get('loc_id'));
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
