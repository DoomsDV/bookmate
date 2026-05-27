import type { APIRoute } from 'astro';

import {
	AuthApiError,
	acceptInvitationWithAccessToken,
	clearOrgSelectionCookie,
	getOrgSelectionCookie,
	parseInvitationTokenFromRedirect,
	selectOrganizationWithOrds,
	setOrganizationCacheCookies,
	setSessionCookies,
} from '../../../lib/auth';
import { getCurrentOrganizationWithOrds } from '../../../lib/organization';

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';
	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

const withQuery = (path: string, params: URLSearchParams) => {
	const queryString = params.toString();
	return queryString ? `${path}?${queryString}` : path;
};

const sanitizeRedirectTo = (value: unknown) => {
	const redirectTo = String(value || '').trim();

	if (!redirectTo || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
		return '';
	}

	if (redirectTo.includes('\r') || redirectTo.includes('\n')) {
		return '';
	}

	if (redirectTo.startsWith('/auth/login') || redirectTo.startsWith('/api/')) {
		return '';
	}

	return redirectTo;
};

export const POST: APIRoute = async ({ request, cookies, url }) => {
	let redirectTo = '/panel/dashboard';

	try {
		const selectionContext = getOrgSelectionCookie(cookies);
		if (!selectionContext) {
			throw new AuthApiError('Tu sesión de selección expiró. Vuelve a iniciar sesión.', 401);
		}

		let orgMemberId = 0;
		const contentType = request.headers.get('content-type') || '';

		if (contentType.includes('application/json')) {
			const body = await request.json();
			orgMemberId = Number(body.org_member_id || 0);
			const bodyRedirect = sanitizeRedirectTo(body.redirectTo);
			if (bodyRedirect) redirectTo = bodyRedirect;
		} else {
			const formData = await request.formData();
			orgMemberId = Number(formData.get('org_member_id') || 0);
			const formRedirect = sanitizeRedirectTo(formData.get('redirectTo'));
			if (formRedirect) redirectTo = formRedirect;
		}

		if (!redirectTo || redirectTo === '/panel/dashboard') {
			redirectTo = selectionContext.redirectTo || redirectTo;
		}

		if (!Number.isInteger(orgMemberId) || orgMemberId <= 0) {
			throw new AuthApiError('Debes seleccionar una organización.', 400);
		}

		const allowed = selectionContext.organizations.some(
			(item) => item.org_member_id === orgMemberId
		);
		if (!allowed) {
			throw new AuthApiError('La organización seleccionada no es válida.', 400);
		}

		const session = await selectOrganizationWithOrds({
			selection_token: selectionContext.selection_token,
			org_member_id: orgMemberId,
		});

		clearOrgSelectionCookie(cookies);
		setSessionCookies(cookies, url, session);
		cookies.set('fcm_prompt_pending', '1', {
			httpOnly: false,
			secure: import.meta.env.PROD,
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 30,
		});

		let finalRedirect = redirectTo;
		const invitationToken = parseInvitationTokenFromRedirect(redirectTo);

		if (invitationToken) {
			try {
				const acceptedSession = await acceptInvitationWithAccessToken(
					session.access_token,
					invitationToken
				);
				setSessionCookies(cookies, url, acceptedSession);

				try {
					const organization = await getCurrentOrganizationWithOrds(acceptedSession.access_token);
					setOrganizationCacheCookies(cookies, url, organization);
				} catch {
					// No bloqueamos el acceso si falla la carga de branding de la org.
				}

				finalRedirect = '/panel/dashboard';
			} catch {
				try {
					const organization = await getCurrentOrganizationWithOrds(session.access_token);
					setOrganizationCacheCookies(cookies, url, organization);
				} catch {
					// No bloqueamos el acceso si falla la carga de branding de la org.
				}
			}
		} else {
			try {
				const organization = await getCurrentOrganizationWithOrds(session.access_token);
				setOrganizationCacheCookies(cookies, url, organization);
			} catch {
				// No bloqueamos el acceso si falla la carga de branding de la org.
			}
		}

		if (wantsHtml(request)) {
			return new Response(null, {
				status: 302,
				headers: { Location: finalRedirect },
			});
		}

		return Response.json({ success: true, redirect: finalRedirect });
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible acceder a la organización seleccionada.', 500);

		if (wantsHtml(request)) {
			const params = new URLSearchParams();
			params.set('error', authError.message);
			if (authError.status === 401) {
				return new Response(null, {
					status: 302,
					headers: { Location: '/auth/login' },
				});
			}
			return new Response(null, {
				status: 302,
				headers: { Location: withQuery('/auth/select-org', params) },
			});
		}

		return Response.json({ error: authError.message }, { status: authError.status });
	}
};

export const GET: APIRoute = async () =>
	new Response(null, {
		status: 302,
		headers: { Location: '/auth/select-org' },
	});
