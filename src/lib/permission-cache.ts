import type { SessionClaims } from './token-claims';

export const PERMISSIONS_COOKIE = 'hasel_caps';
export const PERMISSIONS_TTL_MS = 90_000;

const isProduction = import.meta.env.PROD;

type CookieReader = {
	get: (name: string) => { value: string } | undefined;
};

type CookieWriter = {
	set: (name: string, value: string, options: Record<string, unknown>) => void;
	delete: (name: string, options?: Record<string, unknown>) => void;
};

type CachedPermissions = {
	userId: number;
	orgId: number;
	roleId: number;
	capabilities: string[];
	ts: number;
};

const encodeCache = (value: CachedPermissions) =>
	`${value.userId}.${value.orgId}.${value.roleId}.${value.ts}.${encodeURIComponent(value.capabilities.join(','))}`;

const decodeCache = (raw: string): CachedPermissions | null => {
	const parts = raw.split('.');
	if (parts.length < 5) return null;
	const [userIdRaw, orgIdRaw, roleIdRaw, tsRaw, ...rest] = parts;
	const userId = Number(userIdRaw);
	const orgId = Number(orgIdRaw);
	const roleId = Number(roleIdRaw);
	const ts = Number(tsRaw);
	if (
		!Number.isInteger(userId) ||
		!Number.isInteger(orgId) ||
		!Number.isInteger(roleId) ||
		!Number.isFinite(ts)
	) {
		return null;
	}
	const capabilities = decodeURIComponent(rest.join('.'))
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	return { userId, orgId, roleId, capabilities, ts };
};

export const readCachedPermissions = (
	cookies: CookieReader,
	claims: SessionClaims
): string[] | null => {
	if (!claims.user_id || !claims.organization_id) return null;
	const raw = String(cookies.get(PERMISSIONS_COOKIE)?.value || '').trim();
	if (!raw) return null;
	const parsed = decodeCache(raw);
	if (!parsed) return null;
	if (
		parsed.userId !== claims.user_id ||
		parsed.orgId !== claims.organization_id ||
		parsed.roleId !== claims.role_id
	) {
		return null;
	}
	const age = Date.now() - parsed.ts;
	if (age < 0 || age >= PERMISSIONS_TTL_MS) return null;
	return parsed.capabilities;
};

export const setCachedPermissions = (
	cookies: CookieWriter,
	claims: SessionClaims,
	capabilities: readonly string[]
) => {
	if (!claims.user_id || !claims.organization_id) return;
	cookies.set(
		PERMISSIONS_COOKIE,
		encodeCache({
			userId: claims.user_id,
			orgId: claims.organization_id,
			roleId: claims.role_id,
			capabilities: [...capabilities],
			ts: Date.now(),
		}),
		{
			httpOnly: true,
			secure: isProduction,
			sameSite: 'lax',
			path: '/',
			maxAge: Math.ceil(PERMISSIONS_TTL_MS / 1000),
		}
	);
};

export const clearCachedPermissions = (cookies: CookieWriter) => {
	cookies.delete(PERMISSIONS_COOKIE, { path: '/' });
};
