import type { APIRoute } from 'astro';

import {
	AuthApiError,
	clearOrgSelectionCookie,
	createOrganizationWithOrds,
	getCreateOrganizationAuthToken,
	isEmailVerificationRequiredError,
	resolveVerificationEmailFromAuthError,
	setOrganizationCacheCookies,
	setSessionCookies,
	type CreateOrganizationPayload,
} from '../../../lib/auth';
import { getCurrentOrganizationWithOrds } from '../../../lib/organization';
import { parseRequestBody, toErrorResponse } from '../../../utils/api-helpers';

const sanitizeText = (value: unknown) => String(value || '').trim();

const parseSpecialtyId = (value: unknown) => {
	const raw = String(value ?? '').trim();
	if (!raw) return NaN;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : NaN;
};

const parsePayload = (body: Record<string, unknown>): CreateOrganizationPayload => ({
	business_name: sanitizeText(body.business_name),
	phone: sanitizeText(body.phone),
	company_email: sanitizeText(body.company_email),
	id_org_specialty: parseSpecialtyId(body.id_org_specialty),
});

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';
	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

const validatePayload = (payload: CreateOrganizationPayload) => {
	const fieldErrors: Array<{ field: string; message: string }> = [];

	if (!payload.business_name) {
		fieldErrors.push({ field: 'business_name', message: 'El nombre de la empresa es obligatorio.' });
	}
	if (!payload.company_email) {
		fieldErrors.push({ field: 'company_email', message: 'El correo de la compania es obligatorio.' });
	}
	if (!payload.phone) {
		fieldErrors.push({ field: 'phone', message: 'El telefono corporativo es obligatorio.' });
	}
	if (!Number.isInteger(payload.id_org_specialty) || payload.id_org_specialty <= 0) {
		fieldErrors.push({ field: 'id_org_specialty', message: 'Selecciona una especialidad valida.' });
	}

	if (fieldErrors.length > 0) {
		throw new AuthApiError('Por favor, corrige los errores del formulario.', 400, undefined, fieldErrors);
	}
};

export const POST: APIRoute = async ({ request, cookies, url, locals }) => {
	try {
		const token =
			String(locals.token || '').trim() || getCreateOrganizationAuthToken(cookies);
		if (!token) {
			throw new AuthApiError('Debes iniciar sesion para crear una organizacion.', 401);
		}
		const body = await parseRequestBody<CreateOrganizationPayload>(request, (formData) =>
			parsePayload({
				business_name: formData.get('business_name'),
				phone: formData.get('phone'),
				company_email: formData.get('company_email'),
				id_org_specialty: formData.get('id_org_specialty'),
			})
		);
		const payload = parsePayload(body as Record<string, unknown>);

		validatePayload(payload);

		const session = await createOrganizationWithOrds(token, payload);

		clearOrgSelectionCookie(cookies);
		setSessionCookies(cookies, url, session);
		cookies.set('fcm_prompt_pending', '1', {
			httpOnly: false,
			secure: import.meta.env.PROD,
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 30,
		});

		try {
			const organization = await getCurrentOrganizationWithOrds(session.access_token);
			setOrganizationCacheCookies(cookies, url, organization);
		} catch {
			// Si falla la cache de organizacion, no bloqueamos el acceso.
		}

		return Response.json({
			success: true,
			redirect: '/panel/dashboard',
			organization_id: session.organization_id,
		});
	} catch (error) {
		if (error instanceof AuthApiError && isEmailVerificationRequiredError(error)) {
			const email = resolveVerificationEmailFromAuthError(error);
			const verifyParams = new URLSearchParams({ pending_login: '1' });
			if (email) verifyParams.set('email', email);
			const verifyRedirect = `/auth/verify-email?${verifyParams.toString()}`;

			if (wantsHtml(request)) {
				return new Response(null, {
					status: 302,
					headers: { Location: verifyRedirect },
				});
			}

			return Response.json(
				{
					status: 'error',
					message: error.message,
					emailVerificationRequired: true,
					redirect: verifyRedirect,
				},
				{ status: error.status }
			);
		}

		return toErrorResponse(error, 'No fue posible crear la organizacion.', {
			isKnownError: (value): value is AuthApiError => value instanceof AuthApiError,
			createError: (message, status) => new AuthApiError(message, status),
		});
	}
};
