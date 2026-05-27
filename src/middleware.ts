import { defineMiddleware } from 'astro:middleware';

import { canAccessPath, isKnownRoleId } from './config/roles';
import {
	clearSessionCookies,
	getPendingSelectionAuthToken,
	isInvitationAcceptRedirect,
	isPublicPath,
	refreshWithOrds,
	setOrganizationCacheCookies,
	setSessionCookies,
} from './lib/auth';
import { getCurrentOrganizationWithOrds } from './lib/organization';
import { SESSION_EXPIRED_API_CODE } from './lib/session-auth-messages';
import { isOrgSelectionToken, parseTokenClaims } from './lib/token-claims';

const isInvitationLoginLanding = (pathname: string, searchParams: URLSearchParams) =>
	pathname === '/auth/login' &&
	(searchParams.get('invitationAccepted') === '1' || searchParams.has('invitationAccepted'));

export const onRequest = defineMiddleware(async (context, next) => {
	const { cookies, redirect, url } = context;

	if (isPublicPath(url.pathname)) {
		const tempToken = cookies.get('access_token')?.value;

		if (tempToken && (url.pathname === '/auth' || url.pathname.startsWith('/auth/'))) {
			const redirectToParam = url.searchParams.get('redirectTo') || '';

			if (
				url.pathname === '/auth/login' &&
				isInvitationAcceptRedirect(redirectToParam)
			) {
				return redirect(redirectToParam);
			}

			if (
				url.pathname.startsWith('/auth/accept-invite') ||
				url.pathname === '/auth/create-organization' ||
				url.pathname === '/auth/select-org' ||
				isInvitationLoginLanding(url.pathname, url.searchParams)
			) {
				if (isInvitationLoginLanding(url.pathname, url.searchParams)) {
					clearSessionCookies(cookies);
				}
				return next();
			}

			const tempClaims = parseTokenClaims(tempToken);

			if (isKnownRoleId(tempClaims.role_id)) {
				return redirect('/panel/dashboard');
			}
		}

		return next();
	}

	const redirectToLogin = () => {
		if (url.pathname.startsWith('/api/')) {
			return Response.json(
				{
					status: 'error',
					code: SESSION_EXPIRED_API_CODE,
					message: 'No hay sesión activa. Vuelve a iniciar sesión.',
				},
				{ status: 401 }
			);
		}

		const redirectPath = `${url.pathname}${url.search}`;
		return redirect(`/auth/login?redirectTo=${encodeURIComponent(redirectPath)}`);
	};

	if (
		url.pathname === '/api/organization/create' ||
		url.pathname === '/api/auth/accept-invitation'
	) {
		const createAuthToken = getPendingSelectionAuthToken(cookies);
		if (createAuthToken && isOrgSelectionToken(createAuthToken)) {
			context.locals.token = createAuthToken;
			context.locals.roleId = 0;
			context.locals.userId = 0;
			context.locals.organizationName = '';
			context.locals.organizationLogoUrl = '';
			return next();
		}
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
			return redirectToLogin();
		}
	}

	if (!accessToken) {
		return redirectToLogin();
	}

	const claims = parseTokenClaims(accessToken);
	if (!isKnownRoleId(claims.role_id)) {
		clearSessionCookies(cookies);
		return redirectToLogin();
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
