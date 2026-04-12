import { defineMiddleware } from 'astro:middleware';

import { canAccessPath, isKnownRoleId } from './config/roles';
import {
	clearSessionCookies,
	isPublicPath,
	refreshWithOrds,
	setOrganizationCacheCookies,
	setSessionCookies,
} from './lib/auth';
import { getCurrentOrganizationWithOrds } from './lib/organization';
import { parseTokenClaims } from './lib/token-claims';

export const onRequest = defineMiddleware(async (context, next) => {
	const { cookies, redirect, url } = context;
/*  */
	if (isPublicPath(url.pathname)) {
		return next();
	}

	let accessToken = cookies.get('access_token')?.value;
	const refreshToken = cookies.get('refresh_token')?.value;

	if (!accessToken && refreshToken) {
		try {
			const session = await refreshWithOrds(refreshToken);
			setSessionCookies(cookies, url, session);
			accessToken = session.access_token;
		} catch {
			clearSessionCookies(cookies);
			return redirect('/auth/login');
		}
	}

	if (!accessToken) {
		return redirect('/auth/login');
	}

	const claims = parseTokenClaims(accessToken);
	if (!isKnownRoleId(claims.role_id)) {
		clearSessionCookies(cookies);
		return redirect('/auth/login');
	}

	if (!canAccessPath(url.pathname, claims.role_id)) {
		if (url.pathname.startsWith('/api/')) {
			return Response.json(
				{
					status: 'error',
					message: 'No tienes permisos para acceder a este recurso.',
				},
				{ status: 403 }
			);
		}

		return redirect('/panel/dashboard');
	}

	let organizationName = String(cookies.get('org_name')?.value || '').trim();
	let organizationLogoUrl = String(cookies.get('org_logo_url')?.value || '').trim();
	if ((!organizationName || !organizationLogoUrl) && accessToken) {
		try {
			const organization = await getCurrentOrganizationWithOrds(accessToken);
			setOrganizationCacheCookies(cookies, url, organization);
			organizationName = String(organization.name || '').trim();
			organizationLogoUrl = String(organization.logo_url || '').trim();
		} catch {
			// Si falla, seguimos sin bloquear navegación.
		}
	}

	context.locals.token = accessToken;
	context.locals.roleId = claims.role_id;
	context.locals.userId = claims.user_id;
	context.locals.organizationName = organizationName;
	context.locals.organizationLogoUrl = organizationLogoUrl;
	return next();
});
