import type { APIRoute } from 'astro';

import { ChatApiError, deleteChatSessionWithOrds } from '../../../../../lib/chat';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toPositiveInt,
} from '../../../../../utils/api-helpers';

const createChatError = (message: string, status = 400) => new ChatApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createChatError, 'No hay sesion valida para usar el asistente IA.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is ChatApiError => value instanceof ChatApiError,
		createError: createChatError,
	});

export const DELETE: APIRoute = async ({ locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const sessionId = toPositiveInt(params.id);
		const result = await deleteChatSessionWithOrds(token, sessionId);

		return Response.json(
			{
				status: 'success',
				data: result,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible eliminar el historial del chat.');
	}
};

