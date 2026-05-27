import type { APIRoute } from 'astro';

import {
	AuthApiError,
	acceptInvitationWithAccessToken,
	CREATE_ORGANIZATION_PATH,
	isEmailVerificationRequiredError,
	parseInvitationTokenFromRedirect,
	isLoginSelectionResult,
	loginWithOrds,
	resolveVerificationEmailFromAuthError,
	clearOrgSelectionCookie,
	clearSessionCookies,
	setOrgSelectionCookie,
	setOrganizationCacheCookies,
	setSessionCookies,
} from '../../../lib/auth';
import { getCurrentOrganizationWithOrds } from '../../../lib/organization';

const mapFieldParamName = (field: string) => {
	if (field === 'username' || field === 'email' || field === 'identifier') return 'identifier_error';
	if (field === 'password') return 'password_error';
	return '';
};

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';

	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

const withQuery = (path: string, params: URLSearchParams) => {
	const queryString = params.toString();
	return queryString ? `${path}?${queryString}` : path;
};

const buildVerifyEmailRedirect = (verificationEmail: string) => {
	const verifyParams = new URLSearchParams();
	verifyParams.set('pending_login', '1');

	if (verificationEmail) {
		verifyParams.set('email', verificationEmail);
	}

	return withQuery('/auth/verify-email', verifyParams);
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

/** Acepta correo (flujo principal) o apex_user_name legacy en el mismo campo. */
const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		const body = await request.json();
		return {
			identifier: String(body.identifier || body.email || body.username || '').trim(),
			password: String(body.password || ''),
			redirectTo: sanitizeRedirectTo(body.redirectTo),
		};
	}

	const formData = await request.formData();
	return {
		identifier: String(formData.get('identifier') || formData.get('email') || '').trim(),
		password: String(formData.get('password') || ''),
		redirectTo: sanitizeRedirectTo(formData.get('redirectTo')),
	};
};

export const POST: APIRoute = async ({ request, cookies, url }) => {
	let identifier = '';
	let redirectTo = '';

	try {
		const parsedBody = await parseBody(request);
		identifier = parsedBody.identifier;
		redirectTo = parsedBody.redirectTo;
		const { password } = parsedBody;
		const postLoginRedirect = redirectTo || '/panel/dashboard';

		if (!identifier || !password) {
			throw new AuthApiError('Debes completar correo y contrasena.', 400);
		}

		const loginResult = await loginWithOrds({ email: identifier, password });

		if (isLoginSelectionResult(loginResult)) {
			clearOrgSelectionCookie(cookies);
			clearSessionCookies(cookies);
			setOrgSelectionCookie(cookies, {
				selection_token: loginResult.selection_token,
				organizations: loginResult.organizations,
				redirectTo: postLoginRedirect,
			});

			const invitationAcceptPath = parseInvitationTokenFromRedirect(postLoginRedirect)
				? postLoginRedirect
				: null;
			const nextPath =
				postLoginRedirect === CREATE_ORGANIZATION_PATH
					? CREATE_ORGANIZATION_PATH
					: invitationAcceptPath ?? withQuery('/auth/select-org', new URLSearchParams());

			if (wantsHtml(request)) {
				return new Response(null, {
					status: 302,
					headers: { Location: nextPath },
				});
			}

			return Response.json({
				success: true,
				selectionRequired: true,
				redirect: nextPath,
				organizations: loginResult.organizations,
			});
		}

		const session = loginResult;
		clearOrgSelectionCookie(cookies);
		setSessionCookies(cookies, url, session);
		cookies.set('fcm_prompt_pending', '1', {
			httpOnly: false,
			secure: import.meta.env.PROD,
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 30,
		});

		let finalRedirect = postLoginRedirect;
		const invitationToken = parseInvitationTokenFromRedirect(postLoginRedirect);

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
					// Si falla la cache de organización, no bloqueamos el acceso.
				}

				finalRedirect = '/panel/dashboard';
			} catch (inviteError) {
				const inviteErrorMessage =
					inviteError instanceof AuthApiError
						? inviteError.message
						: inviteError instanceof Error
							? inviteError.message
							: 'No fue posible aceptar la invitación.';

				const inviteParams = new URLSearchParams();
				inviteParams.set('token', invitationToken);
				inviteParams.set('error', inviteErrorMessage);
				finalRedirect = withQuery('/auth/accept-invite', inviteParams);

				try {
					const organization = await getCurrentOrganizationWithOrds(session.access_token);
					setOrganizationCacheCookies(cookies, url, organization);
				} catch {
					// Si falla la cache de organización, no bloqueamos el inicio de sesión.
				}
			}
		} else {
			try {
				const organization = await getCurrentOrganizationWithOrds(session.access_token);
				setOrganizationCacheCookies(cookies, url, organization);
			} catch {
				// Si falla la cache de organización, no bloqueamos el inicio de sesión.
			}
		}

		if (wantsHtml(request)) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: finalRedirect,
				},
			});
		}

		return Response.json({ success: true, redirect: finalRedirect });
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('Ocurrio un error inesperado al iniciar sesion.', 500);
		const fieldErrors = authError.fieldErrors;

		if (isEmailVerificationRequiredError(authError)) {
			const verificationEmail = resolveVerificationEmailFromAuthError(authError, identifier);
			const verifyRedirect = buildVerifyEmailRedirect(verificationEmail);

			if (wantsHtml(request)) {
				return new Response(null, {
					status: 302,
					headers: {
						Location: verifyRedirect,
					},
				});
			}

			return Response.json(
				{
					error:
						typeof authError.details === 'string' && authError.details.trim()
							? authError.details
							: authError.message,
					emailVerificationRequired: true,
					redirect: verifyRedirect,
				},
				{ status: authError.status }
			);
		}

		if (wantsHtml(request)) {
			const redirectParams = new URLSearchParams();

			if (redirectTo) {
				redirectParams.set('redirectTo', redirectTo);
			}

			redirectParams.set(
				'error',
				typeof authError.details === 'string' && authError.details.trim()
					? authError.details
					: authError.message
			);

			if (identifier) {
				redirectParams.set('identifier', identifier);
			}

			for (const fieldError of fieldErrors) {
				const fieldName = mapFieldParamName(fieldError.field);

				if (fieldName) {
					redirectParams.set(fieldName, fieldError.message);
				}
			}

			return new Response(null, {
				status: 302,
				headers: {
					Location: withQuery('/auth/login', redirectParams),
				},
			});
		}

		return Response.json(
			{
				error: authError.message,
				details: authError.details,
				fieldErrors,
			},
			{ status: authError.status }
		);
	}
};

export const GET: APIRoute = async ({ request, url }) => {
	if (wantsHtml(request)) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/auth/login',
			},
		});
	}

	return Response.json(
		{
			error: 'Metodo no permitido para este endpoint.',
			redirect: '/auth/login',
		},
		{ status: 405 }
	);
};
