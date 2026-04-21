import type { APIRoute } from 'astro';
import { google } from 'googleapis';

const PROVIDER = 'google_calendar';

const toRedirectResponse = (location: string, status = 302) =>
	new Response(null, {
		status,
		headers: {
			Location: location,
		},
	});

const getRequiredEnv = (value: string | undefined, envName: string) => {
	const resolved = String(value || '').trim();
	if (!resolved) {
		throw new Error(`Missing required environment variable: ${envName}`);
	}
	return resolved;
};

const buildIntegrationUrl = () => {
	const baseUrl = getRequiredEnv(import.meta.env.ORDS_INTEGRATIONS_URL, 'ORDS_INTEGRATIONS_URL');
	return `${baseUrl.replace(/\/+$/, '')}/${PROVIDER}`;
};

const getErrorMessageFromResponse = async (response: Response) => {
	try {
		const data = await response.json();
		if (data && typeof data === 'object' && 'message' in data) {
			const message = String(data.message || '').trim();
			if (message) return message;
		}
	} catch {
		// Ignore parse errors and fallback below.
	}
	return `Request failed with status ${response.status}.`;
};

export const GET: APIRoute = async ({ request, locals }) => {
	const redirectError = (reason: string) =>
		toRedirectResponse(`/panel/calendar?error=${encodeURIComponent(reason)}`);

	try {
		if (!locals.token) {
			return toRedirectResponse('/auth/login?redirectTo=%2Fpanel%2Fcalendar');
		}

		const callbackUrl = new URL(request.url);
		const authCode = String(callbackUrl.searchParams.get('code') || '').trim();
		if (!authCode) {
			return redirectError('google_missing_code');
		}

		const clientId = getRequiredEnv(import.meta.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID');
		const clientSecret = getRequiredEnv(
			import.meta.env.GOOGLE_CLIENT_SECRET,
			'GOOGLE_CLIENT_SECRET'
		);
		const redirectUri = getRequiredEnv(
			import.meta.env.GOOGLE_REDIRECT_URI,
			'GOOGLE_REDIRECT_URI'
		);
		const integrationUrl = buildIntegrationUrl();

		const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
		const { tokens } = await oauth2Client.getToken(authCode);

		const accessToken = String(tokens.access_token || '').trim();
		const refreshToken = String(tokens.refresh_token || '').trim();
		if (!accessToken) {
			throw new Error('Google no devolvio access_token.');
		}

		const payload: Record<string, string> = {
			provider: PROVIDER,
			access_token: accessToken,
		};
		if (refreshToken) {
			payload.refresh_token = refreshToken;
		}

		const ordsResponse = await fetch(integrationUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${locals.token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(payload),
		});

		if (!ordsResponse.ok) {
			const message = await getErrorMessageFromResponse(ordsResponse);
			throw new Error(message);
		}

		return toRedirectResponse('/panel/calendar?success=google_connected');
	} catch (error) {
		console.error('[google-callback] error', error);
		return redirectError('google_callback_failed');
	}
};
