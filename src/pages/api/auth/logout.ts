import type { APIRoute } from 'astro';

import { clearSessionCookies, logoutWithOrds } from '../../../lib/auth';

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';

	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const refreshToken = cookies.get('refresh_token')?.value;

	try {
		await logoutWithOrds(refreshToken);
	} catch {
		// El logout debe ser idempotente: aunque ORDS falle, limpiamos la sesión local.
	}

	clearSessionCookies(cookies);

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
	const refreshToken = cookies.get('refresh_token')?.value;

	try {
		await logoutWithOrds(refreshToken);
	} catch {
		// El logout debe ser idempotente: aunque ORDS falle, limpiamos la sesión local.
	}

	clearSessionCookies(cookies);

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
