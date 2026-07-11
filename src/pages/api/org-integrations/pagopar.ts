import type { APIRoute } from 'astro';

/** Fase E: claves Pagopar del comercio deprecadas. Pagopar = solo suscripción Hasel. */
const GONE = {
	status: 'error',
	code: 'GONE',
	message:
		'Pagopar del comercio fue deprecado para señas. Configurá transferencia SIPAP en Ajustes → Pagos.',
};

export const GET: APIRoute = async () => Response.json(GONE, { status: 410 });
export const PUT: APIRoute = async () => Response.json(GONE, { status: 410 });
export const DELETE: APIRoute = async () => Response.json(GONE, { status: 410 });
