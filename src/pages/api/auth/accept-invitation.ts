import type { APIRoute } from 'astro';

import {
	AuthApiError,
	acceptInvitationWithOrds,
	clearSessionCookies,
	isLoginSelectionResult,
	setOrganizationCacheCookies,
	setSessionCookies,
} from '../../../lib/auth';
import { getCurrentOrganizationWithOrds } from '../../../lib/organization';

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		const body = await request.json();
		return {
			token: String(body?.token || '').trim(),
			password: String(body?.password || ''),
			first_name: String(body?.first_name || '').trim(),
			last_name: String(body?.last_name || '').trim(),
		};
	}

	const formData = await request.formData();
	return {
		token: String(formData.get('token') || '').trim(),
		password: String(formData.get('password') || ''),
		first_name: String(formData.get('first_name') || '').trim(),
		last_name: String(formData.get('last_name') || '').trim(),
	};
};

export const POST: APIRoute = async ({ request, cookies, url }) => {
	try {
		const body = await parseBody(request);
		if (!body.token) {
			throw new AuthApiError('El token de invitación es obligatorio.', 400);
		}

		const isNewAccountSignup = body.password.trim().length >= 8;
		const accessToken = isNewAccountSignup ? undefined : cookies.get('access_token')?.value;

		const result = await acceptInvitationWithOrds(
			accessToken ? `Bearer ${accessToken}` : undefined,
			{
				token: body.token,
				...(body.password ? { password: body.password } : {}),
				...(body.first_name ? { first_name: body.first_name } : {}),
				...(body.last_name ? { last_name: body.last_name } : {}),
			}
		);

		clearSessionCookies(cookies);

		if (
			result &&
			typeof result === 'object' &&
			'access_token' in result &&
			'refresh_token' in result &&
			!isLoginSelectionResult(result)
		) {
			setSessionCookies(cookies, url, result);
			cookies.set('fcm_prompt_pending', '1', {
				httpOnly: false,
				secure: import.meta.env.PROD,
				sameSite: 'lax',
				path: '/',
				maxAge: 60 * 60 * 24 * 30,
			});

			try {
				const organization = await getCurrentOrganizationWithOrds(result.access_token);
				setOrganizationCacheCookies(cookies, url, organization);
			} catch {
				// Si falla la cache de organización, no bloqueamos el acceso.
			}

			return Response.json({
				success: true,
				redirect: '/panel/dashboard',
			});
		}

		return Response.json({
			success: true,
			redirect: '/auth/login?invitationAccepted=1',
		});
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible aceptar la invitación.', 500);

		return Response.json(
			{
				error: authError.message,
				message: authError.message,
				login_required: authError.loginRequired,
			},
			{ status: authError.status }
		);
	}
};
