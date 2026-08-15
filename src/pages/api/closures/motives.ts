import type { APIRoute } from 'astro';
import { LocationClosuresApiError, listClosureMotives } from '../../../lib/location-closures';

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
