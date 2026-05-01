import type { APIRoute } from 'astro';

import { ChatApiError, sendChatMessageWithOrds } from '../../../../lib/chat';
import {
	parseRequestBody,
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toOptionalPositiveInt,
} from '../../../../utils/api-helpers';

const createChatError = (message: string, status = 400) => new ChatApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createChatError, 'No hay sesion valida para usar el asistente IA.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is ChatApiError => value instanceof ChatApiError,
		createError: createChatError,
	});

export const POST: APIRoute = async ({ locals, request }) => {
	try {
		const token = requireToken(locals.token);
		const body = await parseRequestBody(request, (formData) => ({
			message: formData.get('message'),
			session_id: formData.get('session_id'),
		}));

		const message = String(body?.message || '').trim();
		const sessionId = toOptionalPositiveInt(body?.session_id);
		const result = await sendChatMessageWithOrds(token, {
			message,
			session_id: sessionId,
		});

		return Response.json(
			{
				status: 'success',
				data: result,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible enviar el mensaje.');
	}
};
