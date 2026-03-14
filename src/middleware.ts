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
			return redirect('/login');
		}
	}

	if (!accessToken) {
		return redirect('/login');
	}

	const claims = parseTokenClaims(accessToken);
	if (!isKnownRoleId(claims.role_id)) {
		clearSessionCookies(cookies);
		return redirect('/login');
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

		return redirect('/');
	}

	let organizationName = String(cookies.get('org_name')?.value || '').trim();
	if (!organizationName && accessToken) {
		try {
			const organization = await getCurrentOrganizationWithOrds(accessToken);
			setOrganizationCacheCookies(cookies, url, organization);
			organizationName = String(organization.name || '').trim();
		} catch {
			// Si falla, seguimos sin bloquear navegación.
		}
	}

	context.locals.token = accessToken;
	context.locals.roleId = claims.role_id;
	context.locals.userId = claims.user_id;
	context.locals.organizationName = organizationName;
	return next();
});
