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

	return Response.json(
		{
			status: 'error',
			message: resolvedError.message,
			details: resolvedError.details,
			errors: resolvedError.fieldErrors,
		},
		{ status: resolvedError.status }
	);
};
