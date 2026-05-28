import type { APIRoute } from 'astro';

import {
	AuthApiError,
	setOrganizationCacheCookies,
	setSessionCookies,
	switchOrganizationWithOrds,
} from '../../../lib/auth';
import { getCurrentOrganizationWithOrds } from '../../../lib/organization';
import { requireToken, toErrorResponse } from '../../../utils/api-helpers';

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

export const POST: APIRoute = async ({ request, cookies, url, locals }) => {
	try {
		const token = requireToken(locals.token, (message, status) => new AuthApiError(message, status));
		const body = await request.json().catch(() => ({}));
		const orgMemberId = Number(body?.org_member_id ?? 0);
		const redirectTo = sanitizeRedirectTo(body?.redirectTo) || '/panel/dashboard';

		if (!Number.isInteger(orgMemberId) || orgMemberId <= 0) {
			throw new AuthApiError('Debes seleccionar una organización válida.', 400);
		}

		const result = await switchOrganizationWithOrds(token, orgMemberId);

		if (result.access_token && result.refresh_token) {
			setSessionCookies(cookies, url, result);

			try {
				const organization = await getCurrentOrganizationWithOrds(result.access_token);
				setOrganizationCacheCookies(cookies, url, organization);
			} catch {
				// Si falla la cache de organización, no bloqueamos el cambio.
			}
		}

		return Response.json({
			success: true,
			redirect: redirectTo,
			organization_id: result.organization_id ?? null,
			user_id: result.user_id ?? null,
		});
	} catch (error) {
		return toErrorResponse(error, 'No fue posible cambiar de organización.', {
			isKnownError: (value): value is AuthApiError => value instanceof AuthApiError,
			createError: (message, status) => new AuthApiError(message, status),
		});
	}
};
