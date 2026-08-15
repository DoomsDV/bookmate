import type { APIRoute } from 'astro';

import { OdontogramApiError, voidOdontogramEventWithOrds } from '../../../../../../lib/odontogram';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../../../../utils/api-helpers';

const createOdontogramError = (message: string, status = 400) =>
	new OdontogramApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createOdontogramError, 'No hay sesión válida.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is OdontogramApiError => value instanceof OdontogramApiError,
		createError: createOdontogramError,
	});

const parsePositiveId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const POST: APIRoute = async ({ locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parsePositiveId(params.id);
		const eventId = parsePositiveId(params.eventId);

		if (customerId <= 0) {
			throw new OdontogramApiError('ID de cliente inválido.', 400);
		}
		if (eventId <= 0) {
			throw new OdontogramApiError('Evento de odontograma inválido.', 400);
		}

		await voidOdontogramEventWithOrds(token, customerId, eventId);

		return Response.json({ status: 'success' }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible anular el registro del odontograma.');
	}
};
