import type { APIRoute } from 'astro';

import {
	FcmApiError,
	registerFcmTokenWithOrds,
	type RegisterFcmPayload,
} from '../../../lib/fcm';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

const getCookieOptions = () => ({
	httpOnly: false,
	secure: import.meta.env.PROD,
	sameSite: 'lax' as const,
	path: '/',
	maxAge: ONE_YEAR_IN_SECONDS,
});

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new FcmApiError('No hay sesion valida para registrar notificaciones.', 401);
	}
	return token;
};

const requireUserId = (userId: number | undefined) => {
	if (!Number.isFinite(userId) || Number(userId) <= 0) {
		throw new FcmApiError('No hay usuario valido para registrar notificaciones.', 401);
	}
	return Number(userId);
};

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		return request.json();
	}

	const formData = await request.formData();
	return {
		fcm_token: formData.get('fcm_token'),
		platform: formData.get('platform'),
	};
};

const inferPlatform = (request: Request) => {
	const userAgent = String(request.headers.get('user-agent') || '').toLowerCase();
	if (userAgent.includes('android')) return 'android';
	if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ios')) {
		return 'ios';
	}
	return 'web';
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

export const POST: APIRoute = async ({ request, locals, cookies }) => {
	try {
		const token = requireToken(locals.token);
		const userId = requireUserId(locals.userId);
		const rawBody = await parseBody(request);

		const fcmToken = String(rawBody?.fcm_token ?? '').trim();
		const platform = String(rawBody?.platform ?? '').trim() || inferPlatform(request);

		if (!fcmToken) {
			throw new FcmApiError('El token FCM es obligatorio.', 400);
		}

		const payload: RegisterFcmPayload = {
			user_id: userId,
			fcm_token: fcmToken,
			platform,
		};

		const result = await registerFcmTokenWithOrds(token, payload);
		cookies.set('fcm_device_token', fcmToken, getCookieOptions());
		cookies.delete('fcm_prompt_pending', { path: '/' });

		return Response.json(
			{
				status: 'success',
				message: result.message,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible suscribir el dispositivo.');
	}
};

export const GET: APIRoute = async () =>
	Response.json(
		{
			status: 'error',
			message: 'Metodo no permitido.',
		},
		{ status: 405 }
	);
