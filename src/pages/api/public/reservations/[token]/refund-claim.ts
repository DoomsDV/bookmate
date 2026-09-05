import type { APIRoute } from 'astro';

export const POST: APIRoute = async () =>
	Response.json(
		{
			status: 'error',
			code: 'GONE',
			message: 'Este reclamo fue reemplazado por el flujo de disputa.',
		},
		{ status: 410 }
	);
