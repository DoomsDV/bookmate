import { defineMiddleware } from 'astro:middleware';

import {
	clearSessionCookies,
	isPublicPath,
	refreshWithOrds,
	setOrganizationCacheCookies,
	setSessionCookies,
} from './lib/auth';
import { getCurrentOrganizationWithOrds } from './lib/organization';

export const onRequest = defineMiddleware(async (context, next) => {
	const { cookies, redirect, url } = context;

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
	context.locals.organizationName = organizationName;
	return next();
});
