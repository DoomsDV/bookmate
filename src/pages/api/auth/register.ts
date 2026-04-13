import type { APIRoute } from 'astro';

import { AuthApiError, registerWithOrds } from '../../../lib/auth';

const ADMIN_STEP = 'admin';
const ORGANIZATION_STEP = 'organization';

type RegisterStep = typeof ADMIN_STEP | typeof ORGANIZATION_STEP;

const ADMIN_FIELDS = new Set(['first_name', 'last_name', 'email', 'password']);
const ORGANIZATION_FIELDS = new Set(['business_name', 'phone']);

const mapFieldParamName = (field: string) => {
	if (field === 'first_name') return 'first_name_error';
	if (field === 'last_name') return 'last_name_error';
	if (field === 'email') return 'email_error';
	if (field === 'password') return 'password_error';
	if (field === 'business_name') return 'business_name_error';
	if (field === 'phone') return 'phone_error';
	return '';
};

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';

	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

const normalizeStep = (value: unknown): RegisterStep =>
	String(value || '').trim().toLowerCase() === ORGANIZATION_STEP ? ORGANIZATION_STEP : ADMIN_STEP;

const sanitizeText = (value: unknown) => String(value || '').trim();

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
		step: normalizeStep(formData.get('step')),
	};
};

const resolveStepFromErrors = (
	fieldErrors: Array<{ field: string; message: string }>,
	fallbackStep: RegisterStep,
	message = ''
): RegisterStep => {
	const hasAdminFieldError = fieldErrors.some((item) => ADMIN_FIELDS.has(String(item.field || '').trim()));
	if (hasAdminFieldError) return ADMIN_STEP;

	const hasOrganizationFieldError = fieldErrors.some((item) =>
		ORGANIZATION_FIELDS.has(String(item.field || '').trim())
	);
	if (hasOrganizationFieldError) return ORGANIZATION_STEP;

	if (String(message || '').toLowerCase().includes('correo')) return ADMIN_STEP;
	return fallbackStep;
};

export const POST: APIRoute = async ({ request, url }) => {
	let body = {
		first_name: '',
		last_name: '',
		email: '',
		password: '',
		business_name: '',
		phone: '',
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
		});

		const redirectTo = `/auth/login?identifier=${encodeURIComponent(body.email)}&registered=1`;

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
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible completar el registro.', 500);

		const fieldErrors = authError.fieldErrors;
		const resolvedStep = resolveStepFromErrors(fieldErrors, body.step, authError.message);

		if (wantsHtml(request)) {
			const redirectUrl = new URL('/auth/register', url);

			redirectUrl.searchParams.set('step', resolvedStep);
			redirectUrl.searchParams.set(
				'error',
				typeof authError.details === 'string' && authError.details.trim()
					? authError.details
					: authError.message
			);

			if (body.first_name) redirectUrl.searchParams.set('first_name', body.first_name);
			if (body.last_name) redirectUrl.searchParams.set('last_name', body.last_name);
			if (body.email) redirectUrl.searchParams.set('email', body.email);
			if (body.business_name) redirectUrl.searchParams.set('business_name', body.business_name);
			if (body.phone) redirectUrl.searchParams.set('phone', body.phone);

			for (const fieldError of fieldErrors) {
				const fieldName = mapFieldParamName(fieldError.field);
				if (fieldName) {
					redirectUrl.searchParams.set(fieldName, fieldError.message);
				}
			}

			return new Response(null, {
				status: 302,
				headers: {
					Location: redirectUrl.toString(),
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
