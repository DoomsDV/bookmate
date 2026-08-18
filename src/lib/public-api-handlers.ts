import { PublicBookingApiError } from './public-booking';

export const toPositiveInt = (value: unknown) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const parseRequestBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return request.json();
	}

	return Object.fromEntries(await request.formData());
};

const toSafeApiStatus = (value: number) => {
	if (value === 555) return 502;
	return Number.isInteger(value) && value >= 400 && value <= 599 ? value : 500;
};

export const PUBLIC_READ_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export const publicCachedJsonResponse = (
	body: Record<string, unknown>,
	status = 200,
) =>
	Response.json(body, {
		status,
		headers: {
			'Cache-Control': PUBLIC_READ_CACHE_CONTROL,
		},
	});

export const isUpstreamTimeoutError = (error: unknown): boolean => {
	if (!error || typeof error !== 'object') return false;
	const err = error as Error;
	const name = String(err.name || '');
	if (name === 'TimeoutError' || name === 'AbortError') return true;
	const message = String(err.message || '').toLowerCase();
	return (
		message.includes('timed out') ||
		message.includes('timeout') ||
		message.includes('aborted') ||
		message.includes('abort')
	);
};

export const publicBookingErrorResponse = (error: unknown, fallbackMessage: string) => {
	const bookingError =
		error instanceof PublicBookingApiError
			? error
			: new PublicBookingApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: bookingError.message,
			details: bookingError.details,
		},
		{ status: toSafeApiStatus(bookingError.status) }
	);
};

export const publicReceiptUploadErrorResponse = (error: unknown, fallbackMessage: string) => {
	if (isUpstreamTimeoutError(error)) {
		return Response.json(
			{
				status: 'error',
				code: 'UPSTREAM_TIMEOUT',
				message: 'El comprobante sigue procesándose. Esperá unos segundos.',
				...(import.meta.env.DEV
					? { details: { name: (error as Error).name || 'TimeoutError' } }
					: {}),
			},
			{ status: 504 }
		);
	}

	return publicBookingErrorResponse(error, fallbackMessage);
};
