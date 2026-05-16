import type { APIRoute } from 'astro';

import { AuthApiError, registerWithOrds } from '../../../lib/auth';

const ADMIN_STEP = 'admin';
const ORGANIZATION_STEP = 'organization';

type RegisterStep = typeof ADMIN_STEP | typeof ORGANIZATION_STEP;

const ADMIN_FIELDS = new Set(['first_name', 'last_name', 'email', 'password']);
const ORGANIZATION_FIELDS = new Set(['business_name', 'phone', 'company_email', 'id_org_specialty']);

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';

	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

const normalizeStep = (value: unknown): RegisterStep =>
	String(value || '').trim().toLowerCase() === ORGANIZATION_STEP ? ORGANIZATION_STEP : ADMIN_STEP;

const sanitizeText = (value: unknown) => String(value || '').trim();
const parseSpecialtyId = (value: unknown) => {
	const raw = String(value ?? '').trim();
	if (!raw) return NaN;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : NaN;
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		const body = await request.json();
		return {
			first_name: sanitizeText(body.first_name),
			last_name: sanitizeText(body.last_name),
			email: sanitizeText(body.email),
			password: String(body.password || ''),
			business_name: sanitizeText(body.business_name),
			phone: sanitizeText(body.phone),
			company_email: sanitizeText(body.company_email),
			id_org_specialty: parseSpecialtyId(body.id_org_specialty),
			step: normalizeStep(body.step),
		};
	}

	const formData = await request.formData();
	return {
		first_name: sanitizeText(formData.get('first_name')),
		last_name: sanitizeText(formData.get('last_name')),
		email: sanitizeText(formData.get('email')),
		password: String(formData.get('password') || ''),
		business_name: sanitizeText(formData.get('business_name')),
		phone: sanitizeText(formData.get('phone')),
		company_email: sanitizeText(formData.get('company_email')),
		id_org_specialty: parseSpecialtyId(formData.get('id_org_specialty')),
		step: normalizeStep(formData.get('step')),
	};
};

const resolveStepFromErrors = (
	fieldErrors: Array<{ field: string; message: string }>,
	fallbackStep: RegisterStep,
	message = ''
): RegisterStep => {
	const hasAdminFieldError = fieldErrors.some((item) =>
		ADMIN_FIELDS.has(String(item.field || '').trim().toLowerCase())
	);
	if (hasAdminFieldError) return ADMIN_STEP;

	const hasOrganizationFieldError = fieldErrors.some((item) =>
		ORGANIZATION_FIELDS.has(String(item.field || '').trim().toLowerCase())
	);
	if (hasOrganizationFieldError) return ORGANIZATION_STEP;

	const normalizedMessage = String(message || '').toLowerCase();
	if (normalizedMessage.includes('especialidad') || normalizedMessage.includes('compania')) {
		return ORGANIZATION_STEP;
	}
	if (normalizedMessage.includes('correo')) return ADMIN_STEP;
	return fallbackStep;
};

const getClientErrorMessage = (error: AuthApiError) => {
	const message = String(error.message || '').trim();
	const details = typeof error.details === 'string' ? error.details.trim() : '';

	if (message && message !== 'No fue posible completar el registro.') {
		return message;
	}

	if (details && /especialidad/i.test(details)) {
		return details;
	}

	return message || 'No fue posible completar el registro.';
};

export const POST: APIRoute = async ({ request }) => {
	let body = {
		first_name: '',
		last_name: '',
		email: '',
		password: '',
		business_name: '',
		phone: '',
		company_email: '',
		id_org_specialty: NaN,
		step: ADMIN_STEP as RegisterStep,
	};

	try {
		body = await parseBody(request);

		const localFieldErrors: Array<{ field: string; message: string }> = [];

		if (!body.first_name) {
			localFieldErrors.push({ field: 'first_name', message: 'El nombre es obligatorio.' });
		}
		if (!body.last_name) {
			localFieldErrors.push({ field: 'last_name', message: 'El apellido es obligatorio.' });
		}
		if (!body.email) {
			localFieldErrors.push({ field: 'email', message: 'El correo electronico es obligatorio.' });
		}
		if (!body.password) {
			localFieldErrors.push({ field: 'password', message: 'La contrasena es obligatoria.' });
		}
		if (!body.business_name) {
			localFieldErrors.push({ field: 'business_name', message: 'El nombre de la empresa es obligatorio.' });
		}
		if (!body.company_email) {
			localFieldErrors.push({ field: 'company_email', message: 'El correo de la compania es obligatorio.' });
		}
		if (!body.phone) {
			localFieldErrors.push({ field: 'phone', message: 'El telefono corporativo es obligatorio.' });
		}
		if (!Number.isInteger(body.id_org_specialty) || body.id_org_specialty <= 0) {
			localFieldErrors.push({ field: 'id_org_specialty', message: 'Selecciona una especialidad valida.' });
		}

		if (localFieldErrors.length > 0) {
			throw new AuthApiError(
				'Por favor, corrige los errores del formulario.',
				400,
				undefined,
				localFieldErrors
			);
		}

		await registerWithOrds({
			first_name: body.first_name,
			last_name: body.last_name,
			email: body.email,
			password: body.password,
			business_name: body.business_name,
			phone: body.phone,
			company_email: body.company_email,
			id_org_specialty: body.id_org_specialty,
		});

		const redirectTo = `/auth/verify-email?email=${encodeURIComponent(body.email)}&registered=1`;

		if (wantsHtml(request)) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: redirectTo,
				},
			});
		}

		return Response.json({ success: true, redirect: redirectTo });
	} catch (error) {
		if (!(error instanceof AuthApiError)) {
			console.error('[api/auth/register] Unexpected registration error', error);
		}

		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible completar el registro.', 500);

		const fieldErrors = authError.fieldErrors;
		const resolvedStep = resolveStepFromErrors(fieldErrors, body.step, authError.message);
		const errorDetail = getClientErrorMessage(authError);

		return Response.json(
			{
				error: errorDetail,
				message: authError.message,
				details: authError.details,
				fieldErrors,
				errors: fieldErrors,
				step: resolvedStep,
			},
			{ status: authError.status }
		);
	}
};

export const GET: APIRoute = async ({ request }) => {
	if (wantsHtml(request)) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/auth/register',
			},
		});
	}

	return Response.json(
		{
			error: 'Metodo no permitido para este endpoint.',
			redirect: '/auth/register',
		},
		{ status: 405 }
	);
};
