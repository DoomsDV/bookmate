/**
 * Helper de frontend para el framework de Idempotency-Key (ver PKG_AOX_UTIL.pr_idempotency_begin).
 *
 * Convención: generar la key una sola vez por "intento lógico" del usuario (ej. al abrir el
 * modal de confirmación de un cobro), no por cada `fetch`. Si la petición falla por un problema
 * de red/timeout (no se sabe si el servidor llegó a procesarla), reintentar reenviando la MISMA
 * key para que el backend pueda hacer replay en vez de repetir el cobro/efecto. Si el usuario
 * cambia de decisión o el servidor responde con un error de negocio definitivo, descartar la key
 * y generar una nueva en el próximo intento.
 */
export const createIdempotencyKey = (): string => {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	// Fallback para entornos sin crypto.randomUUID (navegadores muy viejos / http no seguro).
	return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/**
 * Lee el header `Idempotency-Key` de una request entrante (Astro BFF) para reenviarlo a ORDS.
 * Si no viene, viene vacío o excede el largo máximo se ignora (undefined): el endpoint sigue
 * funcionando sin la protección de idempotencia en vez de fallar duro.
 */
export const readIdempotencyKeyHeader = (request: Request): string | undefined => {
	const raw = request.headers.get('idempotency-key')?.trim();
	if (!raw || raw.length > IDEMPOTENCY_KEY_MAX_LENGTH) return undefined;
	return raw;
};
