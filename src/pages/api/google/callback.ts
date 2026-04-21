import type { APIRoute } from 'astro';
import { google } from 'googleapis';

const PROVIDER = 'google_calendar';
const PANEL_CALENDAR_PATH = '/panel/calendar';

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

const buildSaveIntegrationBody = (provider: string, accessToken: string, refreshToken?: string) => {
	const payload: {
		provider: string;
		access_token: string;
		refresh_token?: string;
	} = {
		provider,
		access_token: accessToken,
	};

	const normalizedRefresh = String(refreshToken || '').trim();
	if (normalizedRefresh) {
		payload.refresh_token = normalizedRefresh;
	}

	return JSON.stringify(payload);
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
	const redirectError = (reason: string, debugDetail?: string) => {
		const params = new URLSearchParams({ error: reason });
		const debug = String(debugDetail || '').trim();
		if (debug) {
			params.set('debug', debug.slice(0, 250));
		}
		return toRedirectResponse(`${PANEL_CALENDAR_PATH}?${params.toString()}`);
	};

	try {
		console.info('[google-callback] start', {
			hasSessionToken: Boolean(locals.token),
		});

		if (!locals.token) {
			return toRedirectResponse('/auth/login?redirectTo=%2Fpanel%2Fcalendar');
		}

		const callbackUrl = new URL(request.url);
		const googleError = String(callbackUrl.searchParams.get('error') || '').trim();
		if (googleError) {
			const googleErrorDescription = String(
				callbackUrl.searchParams.get('error_description') || ''
			).trim();
			console.error('[google-callback] oauth denied/error', {
				googleError,
				googleErrorDescription,
			});
			return redirectError(
				'google_oauth_error',
				`${googleError}${googleErrorDescription ? `: ${googleErrorDescription}` : ''}`
			);
		}

		const authCode = String(callbackUrl.searchParams.get('code') || '').trim();
		if (!authCode) {
			return redirectError('google_missing_code', 'Callback sin query param "code".');
		}
		console.info('[google-callback] auth code received', {
			codeLength: authCode.length,
		});

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
		console.info('[google-callback] env resolved', {
			redirectUri,
			integrationUrl,
		});

		const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
		const { tokens } = await oauth2Client.getToken(authCode);
		console.info('[google-callback] token exchange success', {
			hasAccessToken: Boolean(tokens.access_token),
			hasRefreshToken: Boolean(tokens.refresh_token),
			expiryDate: tokens.expiry_date ?? null,
		});

		const accessToken = String(tokens.access_token || '').trim();
		const refreshToken = String(tokens.refresh_token || '').trim();
		if (!accessToken) {
			return redirectError(
				'google_token_exchange_failed',
				'Google devolvió tokens sin access_token.'
			);
		}

		const bodyText = buildSaveIntegrationBody(PROVIDER, accessToken, refreshToken);
		if (!bodyText || bodyText === '{}') {
			return redirectError(
				'google_ords_payload_invalid',
				'No se pudo construir el body JSON para pr_save_integration.'
			);
		}
		console.info('[google-callback] ords save payload ready', {
			bodyBytes: bodyText.length,
			includesRefreshToken: Boolean(refreshToken),
		});

		const ordsResponse = await fetch(integrationUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${locals.token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: bodyText,
		});
		console.info('[google-callback] ords save response', {
			status: ordsResponse.status,
			ok: ordsResponse.ok,
		});

		if (!ordsResponse.ok) {
			const message = await getErrorMessageFromResponse(ordsResponse);
			console.error('[google-callback] ords save failed', {
				status: ordsResponse.status,
				message,
			});
			return redirectError('google_ords_save_failed', `ORDS ${ordsResponse.status}: ${message}`);
		}

		return toRedirectResponse('/panel/calendar?success=google_connected');
	} catch (error) {
		console.error('[google-callback] error', error);
		const debugMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
		return redirectError('google_callback_failed', debugMessage);
	}
};
