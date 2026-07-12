import type { SessionClaims } from './token-claims';

/** Cookie httpOnly: evita N round-trips a ORDS validate-panel en la misma ráfaga de navegación/API. */
export const PANEL_VALIDATED_COOKIE = 'panel_validated';

/** Ventana corta: org desactivada se refleja como máximo en este TTL. */
export const PANEL_VALIDATE_TTL_MS = 90_000;

const isProduction = import.meta.env.PROD;

type CookieReader = {
	get: (name: string) => { value: string } | undefined;
};

type CookieWriter = {
	set: (name: string, value: string, options: Record<string, unknown>) => void;
	delete: (name: string, options?: Record<string, unknown>) => void;
};

export const isPanelValidationFresh = (cookies: CookieReader, claims: SessionClaims): boolean => {
	if (!claims.user_id || !claims.organization_id) return false;

	const raw = String(cookies.get(PANEL_VALIDATED_COOKIE)?.value || '').trim();
	if (!raw) return false;

	const [userIdRaw, orgIdRaw, tsRaw] = raw.split('.');
	const userId = Number(userIdRaw);
	const orgId = Number(orgIdRaw);
	const ts = Number(tsRaw);
	if (
		!Number.isInteger(userId) ||
		!Number.isInteger(orgId) ||
		!Number.isFinite(ts) ||
		userId !== claims.user_id ||
		orgId !== claims.organization_id
	) {
		return false;
	}

	const age = Date.now() - ts;
	return age >= 0 && age < PANEL_VALIDATE_TTL_MS;
};

export const setPanelValidationCache = (cookies: CookieWriter, claims: SessionClaims) => {
	if (!claims.user_id || !claims.organization_id) return;

	cookies.set(
		PANEL_VALIDATED_COOKIE,
		`${claims.user_id}.${claims.organization_id}.${Date.now()}`,
		{
			httpOnly: true,
			secure: isProduction,
			sameSite: 'lax',
			path: '/',
			maxAge: Math.ceil(PANEL_VALIDATE_TTL_MS / 1000),
		}
	);
};

export const clearPanelValidationCache = (cookies: CookieWriter) => {
	cookies.delete(PANEL_VALIDATED_COOKIE, { path: '/' });
};
