import type { APIRoute } from 'astro';

import { FcmApiError, unregisterFcmTokenWithOrds } from '../../../lib/fcm';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new FcmApiError('No hay sesion valida para anular la suscripcion.', 401);
	}
	return token;
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		return request.json();
	}

	if (
		contentType.includes('application/x-www-form-urlencoded') ||
		contentType.includes('multipart/form-data')
	) {
		const formData = await request.formData();
		return {
			fcm_token: formData.get('fcm_token'),
		};
	}

	return {};
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const fcmError =
		error instanceof FcmApiError ? error : new FcmApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: fcmError.message,
			details: fcmError.details,
		},
		{ status: fcmError.status }
	);
};

const handleUnsubscribe: APIRoute = async ({ request, locals, cookies }) => {
	try {
		const token = requireToken(locals.token);
		const body = await parseBody(request);
		const bodyToken = String(body?.fcm_token ?? '').trim();
		const cookieToken = String(cookies.get('fcm_device_token')?.value || '').trim();
		const fcmToken = bodyToken || cookieToken;

		if (!fcmToken) {
			throw new FcmApiError('El token FCM es obligatorio para desuscribirse.', 400);
		}

		const result = await unregisterFcmTokenWithOrds(token, { fcm_token: fcmToken });
		cookies.delete('fcm_device_token', { path: '/' });

		return Response.json(
			{
				status: 'success',
				message: result.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible anular la suscripcion del dispositivo.');
	}
};

export const POST = handleUnsubscribe;
export const DELETE = handleUnsubscribe;
export const GET: APIRoute = async () =>
	Response.json(
		{
			status: 'error',
			message: 'Metodo no permitido.',
		},
		{ status: 405 }
	);
