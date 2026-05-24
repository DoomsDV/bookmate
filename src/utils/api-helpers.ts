import { SESSION_EXPIRED_API_CODE } from '../lib/session-auth-messages';

type ApiErrorLike = {
	message: string;
	status: number;
	details?: unknown;
	fieldErrors?: unknown;
};

type ApiErrorFactory<T extends ApiErrorLike> = (message: string, status: number) => T;

type ApiErrorOptions<T extends ApiErrorLike> = {
	isKnownError: (error: unknown) => error is T;
	createError: ApiErrorFactory<T>;
};

export const parseRequestBody = async <TFormDataBody>(
	request: Request,
	mapFormData: (formData: FormData) => TFormDataBody
) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return mapFormData(formData);
};

export const requireToken = <TError extends Error>(
	token: string | undefined,
	createError: (message: string, status: number) => TError,
	message = 'No hay sesion valida para procesar la solicitud.'
) => {
	if (!token) {
		throw createError(message, 401);
	}
	return token;
};

export const toErrorResponse = <TError extends ApiErrorLike>(
	error: unknown,
	fallbackMessage: string,
	options: ApiErrorOptions<TError>
) => {
	const resolvedError = options.isKnownError(error)
		? error
		: options.createError(fallbackMessage, 500);

	const payload: Record<string, unknown> = {
		status: 'error',
		message: resolvedError.message,
		details: resolvedError.details,
		errors: resolvedError.fieldErrors,
	};

	if (resolvedError.status === 401) {
		payload.code = SESSION_EXPIRED_API_CODE;
	}

	return Response.json(payload, { status: resolvedError.status });
};

export const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const toOptionalPositiveInt = (value: unknown) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
