/**
 * Mensajes y patrones alineados con PKG_AOX_UTIL (fn_get_*_from_jwt),
 * PKG_AOX_JWT (refresh) y respuestas habituales de Bookmate en 401.
 */

export const SESSION_EXPIRED_API_CODE = 'SESSION_EXPIRED';

/** Subcadenas (texto normalizado) que indican token o sesión inválida. */
export const SESSION_AUTH_MESSAGE_PATTERNS = [
	'token no proporcionado',
	'token invalido',
	'token inválido',
	'token invalido o expirado',
	'token inválido o expirado',
	'token invalido o alterado',
	'token inválido o alterado',
	'falta identificador de usuario en el token',
	'falta identificador de organizacion en el token',
	'falta identificador de organización en el token',
	'falta rol en el token',
	'refresh token invalido',
	'refresh token inválido',
	'token invalido o sesion no autorizada',
	'token inválido o sesión no autorizada',
	'token invalido o sin organizacion asociada',
	'token inválido o sin organización asociada',
	'sesion no autorizada',
	'sesión no autorizada',
	'inicia sesion nuevamente',
	'inicia sesión nuevamente',
	'vuelva a iniciar sesion',
	'vuelva a iniciar sesión',
	'la cuenta de usuario está inactiva',
	'la cuenta de usuario esta inactiva',
] as const;

/** Mensajes de 401 por permisos de negocio (no cerrar sesión). */
export const SESSION_PERMISSION_MESSAGE_PATTERNS = [
	'solo el administrador',
	'acceso denegado. solo el administrador',
	'acceso denegado. solo el admin',
] as const;

const normalizeAuthMessage = (value: unknown) =>
	String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();

export const matchesAnyPattern = (message: unknown, patterns: readonly string[]) => {
	const normalized = normalizeAuthMessage(message);
	if (!normalized) return false;
	return patterns.some((pattern) => normalized.includes(pattern));
};

export const isSessionAuthMessage = (message: unknown) =>
	matchesAnyPattern(message, SESSION_AUTH_MESSAGE_PATTERNS);

export const isPermissionDeniedMessage = (message: unknown) => {
	const normalized = normalizeAuthMessage(message);
	if (!normalized) return false;
	if (matchesAnyPattern(message, SESSION_PERMISSION_MESSAGE_PATTERNS)) return true;
	if (normalized === 'no autorizado.' || normalized === 'no autorizado') return true;
	if (normalized.startsWith('acceso denegado') && !normalized.includes('token')) return true;
	return false;
};

export const shouldTreatUnauthorizedAsSessionExpired = (params: {
	status: number;
	message?: unknown;
	code?: unknown;
	refreshFailed?: boolean;
}) => {
	if (params.status !== 401) return false;
	if (params.code === SESSION_EXPIRED_API_CODE) return true;
	if (params.refreshFailed) return true;
	if (isPermissionDeniedMessage(params.message)) return false;
	return isSessionAuthMessage(params.message);
};
