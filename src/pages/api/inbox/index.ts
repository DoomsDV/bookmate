import type { APIRoute } from 'astro';

import { InboxApiError, listInboxWithOrds } from '../../../lib/inbox';

const toError = (error: unknown, fallback: string) => {
	const err = error instanceof InboxApiError ? error : new InboxApiError(fallback, 500);
	return Response.json({ status: 'error', message: err.message, details: err.details }, { status: err.status });
};

export const GET: APIRoute = async ({ locals, url }) => {
	try {
		const token = locals.token;
		if (!token) throw new InboxApiError('No hay sesion valida.', 401);
		const limitRaw = Number(url.searchParams.get('limit') || '50');
		const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;
		const result = await listInboxWithOrds(token, limit);
		return Response.json({
			status: 'success',
			data: result.items,
			unread_count: result.unreadCount,
		});
	} catch (error) {
		return toError(error, 'No fue posible cargar las notificaciones.');
	}
};
