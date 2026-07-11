import type { APIRoute } from 'astro';

/** Fase E: consulta de hash Pagopar de señas deprecada. */
const GONE = {
	status: 'error',
	code: 'GONE',
	message:
		'El cobro de señas por Pagopar fue deprecado. Usá transferencia SIPAP (Ajustes → Pagos).',
};

export const GET: APIRoute = async () =>
	Response.json(GONE, { status: 410 });
