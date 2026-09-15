import { createHmac, timingSafeEqual } from 'node:crypto';

import type { SessionClaims } from './token-claims';

export const PERMISSIONS_COOKIE = 'hasel_caps';
export const PERMISSIONS_TTL_MS = 90_000;

const isProduction = Boolean(import.meta.env?.PROD);

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

export const getPermissionsCookieSecret = () =>
	String(import.meta.env?.PERMISSIONS_COOKIE_SECRET || import.meta.env?.CRON_SECRET || '').trim();

const hmac = (payload: string, secret: string) =>
	createHmac('sha256', secret).update(payload).digest('base64url');

const safeEqual = (left: string, right: string) => {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
};

export const signPermissionsCookie = (value: CachedPermissions, secret: string) => {
	const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
	return `v1.${payload}.${hmac(payload, secret)}`;
};

export const verifyPermissionsCookie = (raw: string, secret: string): CachedPermissions | null => {
	if (!secret) return null;
	const parts = raw.split('.');
	if (parts.length !== 3 || parts[0] !== 'v1') return null;
	const [, payload, signature] = parts;
	if (!payload || !signature || !safeEqual(signature, hmac(payload, secret))) {
		return null;
	}
	try {
		const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CachedPermissions;
		const userId = Number(parsed.userId);
		const orgId = Number(parsed.orgId);
		const roleId = Number(parsed.roleId);
		const ts = Number(parsed.ts);
		if (
			!Number.isInteger(userId) ||
			!Number.isInteger(orgId) ||
			!Number.isInteger(roleId) ||
			!Number.isFinite(ts) ||
			!Array.isArray(parsed.capabilities)
		) {
			return null;
		}
		return {
			userId,
			orgId,
			roleId,
			ts,
			capabilities: parsed.capabilities.map((item) => String(item || '').trim()).filter(Boolean),
		};
	} catch {
		return null;
	}
};

export const readCachedPermissions = (
	cookies: CookieReader,
	claims: SessionClaims,
	secret = getPermissionsCookieSecret()
): string[] | null => {
	if (!claims.user_id || !claims.organization_id || !secret) return null;
	const raw = String(cookies.get(PERMISSIONS_COOKIE)?.value || '').trim();
	if (!raw) return null;
	const parsed = verifyPermissionsCookie(raw, secret);
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
	capabilities: readonly string[],
	secret = getPermissionsCookieSecret()
) => {
	if (!claims.user_id || !claims.organization_id || !secret) return;
	cookies.set(
		PERMISSIONS_COOKIE,
		signPermissionsCookie(
			{
				userId: claims.user_id,
				orgId: claims.organization_id,
				roleId: claims.role_id,
				capabilities: [...capabilities],
				ts: Date.now(),
			},
			secret
		),
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
