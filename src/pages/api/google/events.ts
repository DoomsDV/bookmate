import type { APIRoute } from 'astro';

import {
	GoogleCalendarApiError,
	listGoogleCalendarEventsForRangeWithOrds,
} from '../../../lib/google-calendar';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const createGoogleCalendarError = (message: string, status = 400) =>
	new GoogleCalendarApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(
		token,
		createGoogleCalendarError,
		'No hay sesion valida para consultar eventos de Google Calendar.'
	);

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is GoogleCalendarApiError =>
			value instanceof GoogleCalendarApiError,
		createError: createGoogleCalendarError,
	});

export const GET: APIRoute = async ({ request, locals }) => {
	try {
		const token = requireToken(locals.token);
		const url = new URL(request.url);
		const start = String(url.searchParams.get('start') || '').trim();
		const end = String(url.searchParams.get('end') || '').trim();

		console.info('[google-events] request:start', {
			start,
			end,
			hasToken: Boolean(token),
		});

		const data = await listGoogleCalendarEventsForRangeWithOrds(token, {
			start,
			end,
		});
		console.info('[google-events] request:success', {
			connected: data.connected,
			totalEvents: data.events.length,
		});

		return Response.json(
			{
				status: 'success',
				data,
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('[google-events] request:error', error);
		return toErrorResponse(error, 'No fue posible cargar eventos de Google Calendar.');
	}
};
