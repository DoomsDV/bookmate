/**
 * Clasificación de errores de sesión para el panel.
 * Prioriza el campo `code` de ORDS/Bookmate; los patrones de mensaje son fallback legacy.
 */

import {
	FORBIDDEN_API_CODE,
	INVALID_CREDENTIALS_API_CODE,
	ORG_ACCESS_INACTIVE_CODE,
	SESSION_EXPIRED_API_CODE,
	SESSION_TERMINATING_CODES,
} from './api-error-codes';

export {
	FORBIDDEN_API_CODE,
	INVALID_CREDENTIALS_API_CODE,
	ORG_ACCESS_INACTIVE_CODE,
	SESSION_EXPIRED_API_CODE,
};

export const ORG_ACCESS_INACTIVE_MESSAGE =
	'Tu acceso a esta organización fue desactivado. Contactá al administrador si necesitás volver a ingresar.';

/** Subcadenas (texto normalizado) que indican token o sesión inválida — fallback sin `code`. */
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

/** Mensajes de permisos de negocio (no cerrar sesión) — fallback sin `code`. */
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
	if (normalized.includes('no tienes permisos') || normalized.includes('no tiene permisos')) {
		return true;
	}
	return false;
};

export const isOrgAccessInactiveResponse = (params: {
	status?: number;
	message?: unknown;
	code?: unknown;
}) => {
	const code = String(params.code || '').trim();
	if (code === ORG_ACCESS_INACTIVE_CODE) return true;
	const normalized = String(params.message || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
	return (
		normalized.includes('acceso a esta organizacion fue desactivado') ||
		normalized.includes('perfil profesional en esta organizacion esta inactivo') ||
		normalized.includes('acceso a esta organizacion ya no esta disponible')
	);
};

export const isSessionTerminatingCode = (code: unknown) => {
	const normalized = String(code || '').trim();
	return normalized.length > 0 && SESSION_TERMINATING_CODES.has(normalized);
};

export const shouldTreatUnauthorizedAsSessionExpired = (params: {
	status: number;
	message?: unknown;
	code?: unknown;
	refreshFailed?: boolean;
}) => {
	const code = String(params.code || '').trim();

	if (isOrgAccessInactiveResponse(params)) return true;
	if (isSessionTerminatingCode(code)) return true;
	if (code === FORBIDDEN_API_CODE || code === INVALID_CREDENTIALS_API_CODE) return false;
	if (params.status === 403) return false;
	if (params.status !== 401) return false;
	if (params.refreshFailed) return true;
	if (isPermissionDeniedMessage(params.message)) return false;
	if (code) return false;
	return isSessionAuthMessage(params.message);
};
