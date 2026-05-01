import type { APIRoute } from 'astro';

import { ChatApiError, listChatSessionsWithOrds } from '../../../../lib/chat';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../../utils/api-helpers';

const createChatError = (message: string, status = 400) => new ChatApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createChatError, 'No hay sesion valida para usar el asistente IA.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is ChatApiError => value instanceof ChatApiError,
		createError: createChatError,
	});

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		const sessions = await listChatSessionsWithOrds(token);

		return Response.json(
			{
				status: 'success',
				data: sessions,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el historial del chat.');
	}
};
