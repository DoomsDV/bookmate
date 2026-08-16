import { defineMiddleware } from 'astro:middleware';

import { canAccessPath, isKnownRoleId } from './config/roles';
import {
	clearSessionCookies,
	getPendingSelectionAuthToken,
	isInvitationAcceptRedirect,
	isPublicPath,
	isTransientRefreshFailure,
	refreshWithOrds,
	setOrganizationCacheCookies,
	setSessionCookies,
} from './lib/auth';
import { PanelAccessError, validatePanelSessionWithOrds } from './lib/panel-access';
import {
	clearPanelValidationCache,
	isPanelValidationFresh,
	setPanelValidationCache,
} from './lib/panel-validation-cache';
import { getCurrentOrganizationWithOrds } from './lib/organization';
import {
	ORG_ACCESS_INACTIVE_CODE,
	SESSION_EXPIRED_API_CODE,
	isOrgAccessInactiveResponse,
} from './lib/session-auth-messages';
import { isAccessJwtExpired, isOrgSelectionToken, parseTokenClaims } from './lib/token-claims';

const isInvitationLoginLanding = (pathname: string, searchParams: URLSearchParams) =>
	pathname === '/auth/login' &&
	(searchParams.get('invitationAccepted') === '1' || searchParams.has('invitationAccepted'));

const recoverableRefreshMessage = 'No fue posible renovar la sesión. Reintentá en unos segundos.';

export const onRequest = defineMiddleware(async (context, next) => {
	const { cookies, redirect, url } = context;

	if (isPublicPath(url.pathname)) {
		const tempToken = cookies.get('access_token')?.value;

		if (tempToken && (url.pathname === '/auth' || url.pathname.startsWith('/auth/'))) {
			const redirectToParam = url.searchParams.get('redirectTo') || '';

			if (
				url.pathname === '/auth/login' &&
				isInvitationAcceptRedirect(redirectToParam) &&
				url.searchParams.get('switch_account') !== '1'
			) {
				return redirect(redirectToParam);
			}

			const wantsSwitchAccountLogin =
				url.pathname === '/auth/login' && url.searchParams.get('switch_account') === '1';

			if (
				url.pathname.startsWith('/auth/accept-invite') ||
				url.pathname === '/auth/create-organization' ||
				url.pathname === '/auth/select-org' ||
				url.pathname === '/auth/forgot-password' ||
				url.pathname === '/auth/reset-password' ||
				wantsSwitchAccountLogin ||
				isInvitationLoginLanding(url.pathname, url.searchParams)
			) {
				if (isInvitationLoginLanding(url.pathname, url.searchParams) || wantsSwitchAccountLogin) {
					clearSessionCookies(cookies);
				}
				return next();
			}

			const tempClaims = parseTokenClaims(tempToken);

			if (isKnownRoleId(tempClaims.role_id) && !isAccessJwtExpired(tempToken)) {
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

	const respondTransientRefreshFailure = () => {
		if (url.pathname.startsWith('/api/')) {
			return Response.json(
				{
					status: 'error',
					message: recoverableRefreshMessage,
				},
				{ status: 503 }
			);
		}

		return new Response(recoverableRefreshMessage, {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		});
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
	const accessNeedsRefresh = !accessToken || isAccessJwtExpired(accessToken);
	let didRefreshAccess = false;

	if (accessNeedsRefresh && refreshToken) {
		try {
			const session = await refreshWithOrds(refreshToken);
			setSessionCookies(cookies, url, session);
			accessToken = session.access_token;
			clearPanelValidationCache(cookies);
			didRefreshAccess = true;
		} catch (error) {
			if (isTransientRefreshFailure(error)) {
				return respondTransientRefreshFailure();
			}
			// 401 por refresh ya rotado: no borrar cookies (otra request pudo ganar).
			return redirectToLogin();
		}
	}

	if (!accessToken) {
		return redirectToLogin();
	}

	let claims = parseTokenClaims(accessToken);
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

	try {
		if (!isPanelValidationFresh(cookies, claims)) {
			await validatePanelSessionWithOrds(accessToken);
			setPanelValidationCache(cookies, claims);
		}
	} catch (error) {
		if (error instanceof PanelAccessError) {
			clearPanelValidationCache(cookies);

			const orgInactive = isOrgAccessInactiveResponse({
				status: error.status,
				message: error.message,
				code: error.code,
			});

			if (orgInactive || error.code === ORG_ACCESS_INACTIVE_CODE) {
				clearSessionCookies(cookies);

				if (url.pathname.startsWith('/api/')) {
					return Response.json(
						{
							status: 'error',
							code: error.code,
							message: error.message,
						},
						{ status: 401 }
					);
				}

				const loginParams = new URLSearchParams();
				loginParams.set('error', error.message);
				return redirect(`/auth/login?${loginParams.toString()}`);
			}

			if (error.status >= 500) {
				if (url.pathname.startsWith('/api/')) {
					return Response.json(
						{
							status: 'error',
							code: error.code,
							message: error.message,
						},
						{ status: error.status }
					);
				}

				return new Response(error.message || recoverableRefreshMessage, {
					status: error.status,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				});
			}

			const currentRefresh = cookies.get('refresh_token')?.value;
			if (!currentRefresh || didRefreshAccess) {
				return redirectToLogin();
			}

			try {
				const session = await refreshWithOrds(currentRefresh);
				setSessionCookies(cookies, url, session);
				accessToken = session.access_token;
				clearPanelValidationCache(cookies);
				claims = parseTokenClaims(accessToken);

				if (!isKnownRoleId(claims.role_id)) {
					return redirectToLogin();
				}

				await validatePanelSessionWithOrds(accessToken);
				setPanelValidationCache(cookies, claims);
			} catch (refreshError) {
				if (refreshError instanceof PanelAccessError) {
					const retryOrgInactive = isOrgAccessInactiveResponse({
						status: refreshError.status,
						message: refreshError.message,
						code: refreshError.code,
					});
					if (retryOrgInactive || refreshError.code === ORG_ACCESS_INACTIVE_CODE) {
						clearSessionCookies(cookies);
					} else if (refreshError.status >= 500) {
						return respondTransientRefreshFailure();
					}
					if (url.pathname.startsWith('/api/')) {
						return Response.json(
							{
								status: 'error',
								code: refreshError.code,
								message: refreshError.message,
							},
							{ status: refreshError.status >= 500 ? refreshError.status : 401 }
						);
					}
					if (retryOrgInactive || refreshError.code === ORG_ACCESS_INACTIVE_CODE) {
						const loginParams = new URLSearchParams();
						loginParams.set('error', refreshError.message);
						return redirect(`/auth/login?${loginParams.toString()}`);
					}
					return redirectToLogin();
				}

				if (isTransientRefreshFailure(refreshError)) {
					return respondTransientRefreshFailure();
				}

				return redirectToLogin();
			}
		}
	}

	let organizationName = String(cookies.get('org_name')?.value || '').trim();
	let organizationLogoUrl = String(cookies.get('org_logo_url')?.value || '').trim();
	const orgLogoCookie = cookies.get('org_logo_url');
	const logoCacheConfirmed = cookies.get('org_logo_checked')?.value === '1';
	// Re-fetch si falta el nombre, la cookie de logo nunca se pobló, o el logo vacío
	// aún no fue confirmado contra /workspace (p. ej. logo subido después del login).
	const needsOrganizationRefresh =
		Boolean(accessToken) &&
		(!organizationName ||
			orgLogoCookie === undefined ||
			(!organizationLogoUrl && !logoCacheConfirmed));

	if (needsOrganizationRefresh) {
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
