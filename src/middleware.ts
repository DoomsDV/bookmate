import { defineMiddleware } from 'astro:middleware';

import { clearSessionCookies, isPublicPath, refreshWithOrds, setSessionCookies } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
	const { cookies, redirect, url } = context;

	if (isPublicPath(url.pathname)) {
		return next();
	}

	let accessToken = cookies.get('access_token')?.value;
	const refreshToken = cookies.get('refresh_token')?.value;

	if (!accessToken && refreshToken) {
		try {
			const session = await refreshWithOrds(refreshToken);
			setSessionCookies(cookies, url, session);
			accessToken = session.access_token;
		} catch {
			clearSessionCookies(cookies);
			return redirect('/login');
		}
	}

	if (!accessToken) {
		return redirect('/login');
	}

	context.locals.token = accessToken;
	return next();
});
