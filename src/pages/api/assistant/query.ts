import type { APIRoute } from 'astro';

import { CAPABILITIES, isCapabilityGranted } from '../../../config/capabilities';
import {
	AssistantAgentError,
	parseAssistantQueryPayload,
	queryAssistantAgent,
} from '../../../lib/assistant-agent';

const errorResponse = (error: unknown) => {
	const assistantError =
		error instanceof AssistantAgentError
			? error
			: new AssistantAgentError('No fue posible consultar al asistente.', 500, 'internal_error');

	return Response.json(
		{
			status: 'error',
			code: assistantError.code,
			message: assistantError.message,
		},
		{ status: assistantError.status, headers: { 'Cache-Control': 'no-store' } }
	);
};

const proxyHeaders = (response: Response) => {
	const headers = new Headers({ 'Cache-Control': 'no-store' });
	const contentType = response.headers.get('Content-Type');
	if (contentType) headers.set('Content-Type', contentType);
	if (contentType?.includes('text/event-stream')) {
		headers.set('X-Accel-Buffering', 'no');
	}
	return headers;
};

export const POST: APIRoute = async ({ locals, request }) => {
	try {
		const token = String(locals.token || '').trim();
		if (!token) {
			throw new AssistantAgentError('No hay una sesión válida para usar el asistente.', 401, 'unauthorized');
		}
		if (!isCapabilityGranted(locals.capabilities, CAPABILITIES.ASSISTANT_USE, locals.roleId)) {
			throw new AssistantAgentError(
				'El asistente no está habilitado para este usuario u organización.',
				403,
				'forbidden'
			);
		}

		const payload = parseAssistantQueryPayload(await request.json().catch(() => null));
		const upstream = await queryAssistantAgent(token, payload, request.signal);
		return new Response(upstream.body, {
			status: upstream.status,
			headers: proxyHeaders(upstream),
		});
	} catch (error) {
		if (request.signal.aborted) {
			return new Response(null, { status: 499, headers: { 'Cache-Control': 'no-store' } });
		}
		return errorResponse(error);
	}
};
