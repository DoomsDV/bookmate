import type { APIRoute } from 'astro';

import { AtcChatApiError, askAtcWithOrds } from '../../../lib/atc-chat';
import {
	parseRequestBody,
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const createAtcError = (message: string, status = 400) => new AtcChatApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createAtcError, 'No hay sesion valida para usar ATC.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is AtcChatApiError => value instanceof AtcChatApiError,
		createError: createAtcError,
	});

export const POST: APIRoute = async ({ locals, request }) => {
	try {
		const token = requireToken(locals.token);
		const body = await parseRequestBody(request, (formData) => ({
			message: formData.get('message'),
		}));

		const message = String(body?.message || '').trim();
		const response = await askAtcWithOrds(token, message);

		return Response.json(
			{
				status: 'success',
				data: { response },
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible enviar la pregunta a ATC.');
	}
};
