import type { APIRoute } from 'astro';

import { clearSessionCookies, logoutWithOrds } from '../../../lib/auth';
import { unregisterFcmTokenWithOrds } from '../../../lib/fcm';

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';

	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

const parseBodyToken = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		try {
			const body = await request.json();
			return String(body?.fcm_token ?? '').trim();
		} catch {
			return '';
		}
	}

	if (
		contentType.includes('application/x-www-form-urlencoded') ||
		contentType.includes('multipart/form-data')
	) {
		try {
			const formData = await request.formData();
			return String(formData.get('fcm_token') || '').trim();
		} catch {
			return '';
		}
	}

	return '';
};

const performLogout = async (
	request: Request,
	cookies: {
		get: (name: string) => { value: string } | undefined;
		delete: (name: string, options?: Record<string, unknown>) => void;
	}
) => {
	const refreshToken = cookies.get('refresh_token')?.value;
	const accessToken = cookies.get('access_token')?.value;
	const tokenFromBody = await parseBodyToken(request);
	const tokenFromCookie = String(cookies.get('fcm_device_token')?.value || '').trim();
	const fcmToken = tokenFromBody || tokenFromCookie;

	const tasks: Promise<unknown>[] = [];
	if (refreshToken) tasks.push(logoutWithOrds(refreshToken));
	if (accessToken && fcmToken) {
		tasks.push(unregisterFcmTokenWithOrds(accessToken, { fcm_token: fcmToken }));
	}

	if (tasks.length > 0) {
		await Promise.allSettled(tasks);
	}

	// El logout debe ser idempotente: aunque ORDS/FCM falle, limpiamos la sesion local.
	clearSessionCookies(cookies);
};

export const POST: APIRoute = async ({ request, cookies }) => {
	await performLogout(request, cookies);

	if (wantsHtml(request)) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/auth/login',
			},
		});
	}

	return Response.json({ success: true, redirect: '/auth/login' });
};

export const GET: APIRoute = async ({ request, cookies }) => {
	await performLogout(request, cookies);

	if (wantsHtml(request)) {
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/auth/login',
			},
		});
	}

	return Response.json({ success: true, redirect: '/auth/login' });
};
