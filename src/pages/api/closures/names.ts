import type { APIRoute } from 'astro';
import { LocationClosuresApiError, listOrgClosures } from '../../../lib/location-closures';

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = locals.token;
		if (!token) {
			return Response.json({ status: 'error', message: 'No hay sesión válida.' }, { status: 401 });
		}
		const closures = await listOrgClosures(token);
		const names = [...new Set(closures.map((c) => c.name).filter(Boolean))].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: 'base' })
		);
		return Response.json({ status: 'success', names }, { status: 200 });
	} catch (error) {
		const msg =
			error instanceof LocationClosuresApiError
				? error.message
				: 'No fue posible obtener los nombres de cierre.';
		const status = error instanceof LocationClosuresApiError ? error.status : 500;
		return Response.json({ status: 'error', message: msg }, { status });
	}
};
