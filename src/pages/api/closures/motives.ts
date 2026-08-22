import type { APIRoute } from 'astro';
import {
	LocationClosuresApiError,
	deleteCustomClosureMotive,
	listClosureMotives,
} from '../../../lib/location-closures';

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = locals.token;
		if (!token) {
			return Response.json({ status: 'error', message: 'No hay sesión válida.' }, { status: 401 });
		}
		const data = await listClosureMotives(token);
		return Response.json({ status: 'success', data }, { status: 200 });
	} catch (error) {
		const msg =
			error instanceof LocationClosuresApiError
				? error.message
				: 'No fue posible obtener los motivos de cierre.';
		const status = error instanceof LocationClosuresApiError ? error.status : 500;
		return Response.json({ status: 'error', message: msg }, { status });
	}
};

export const DELETE: APIRoute = async ({ locals, request }) => {
	try {
		const token = locals.token;
		if (!token) {
			return Response.json({ status: 'error', message: 'No hay sesión válida.' }, { status: 401 });
		}

		let name = '';
		try {
			const payload = (await request.json()) as { name?: unknown };
			name = String(payload?.name || '').trim();
		} catch {
			name = '';
		}

		const result = await deleteCustomClosureMotive(token, name);
		return Response.json({ status: 'success', ...result }, { status: 200 });
	} catch (error) {
		const msg =
			error instanceof LocationClosuresApiError
				? error.message
				: 'No fue posible eliminar el motivo personalizado.';
		const status = error instanceof LocationClosuresApiError ? error.status : 500;
		return Response.json({ status: 'error', message: msg }, { status });
	}
};
