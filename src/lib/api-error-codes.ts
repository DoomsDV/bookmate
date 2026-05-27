/**
 * Códigos de error API alineados con PKG_AOX_UTIL (pr_build_api_error_response).
 */

export const SESSION_EXPIRED_API_CODE = 'SESSION_EXPIRED';
export const ORG_ACCESS_INACTIVE_CODE = 'ORG_ACCESS_INACTIVE';
export const FORBIDDEN_API_CODE = 'FORBIDDEN';
export const INVALID_CREDENTIALS_API_CODE = 'INVALID_CREDENTIALS';
export const VALIDATION_ERROR_API_CODE = 'VALIDATION_ERROR';
export const NOT_FOUND_API_CODE = 'NOT_FOUND';
export const CONFLICT_API_CODE = 'CONFLICT';
export const INTERNAL_ERROR_API_CODE = 'INTERNAL_ERROR';

/** Códigos que deben cerrar sesión y redirigir al login. */
export const SESSION_TERMINATING_CODES = new Set<string>([
	SESSION_EXPIRED_API_CODE,
	ORG_ACCESS_INACTIVE_CODE,
]);

export const readApiErrorCode = (payload: unknown): string => {
	if (!payload || typeof payload !== 'object') return '';
	const direct = (payload as Record<string, unknown>).code;
	if (typeof direct === 'string' && direct.trim()) return direct.trim();

	const details = (payload as Record<string, unknown>).details;
	if (details && typeof details === 'object' && !Array.isArray(details)) {
		const nested = (details as Record<string, unknown>).code;
		if (typeof nested === 'string' && nested.trim()) return nested.trim();
	}

	return '';
};

export const ordsFailureDetails = (data: Record<string, unknown> | null | undefined) => {
	const code = readApiErrorCode(data);
	if (!code) return data?.details;

	const base =
		data?.details && typeof data.details === 'object' && !Array.isArray(data.details)
			? { ...(data.details as Record<string, unknown>) }
			: {};

	return { ...base, code };
};
