import type { APIRoute } from 'astro';

/** Fase E: Pagopar de señas deprecado. Señas = SIPAP. */
const GONE = {
	status: 'error',
	code: 'GONE',
	message:
		'El cobro de señas por Pagopar fue deprecado. Usá transferencia SIPAP (Ajustes → Pagos).',
};

export const POST: APIRoute = async () =>
	Response.json(GONE, { status: 410 });
