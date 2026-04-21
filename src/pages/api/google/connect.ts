import type { APIRoute } from 'astro';
import { google } from 'googleapis';

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
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

const toErrorRedirect = (reason: string, debugDetail?: string) => {
	const params = new URLSearchParams({ error: reason });
	const debug = String(debugDetail || '').trim();
	if (debug) {
		params.set('debug', debug.slice(0, 250));
	}
	return toRedirectResponse(`${PANEL_CALENDAR_PATH}?${params.toString()}`);
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		console.info('[google-connect] start', {
			hasSessionToken: Boolean(locals.token),
		});

		if (!locals.token) {
			return toRedirectResponse('/auth/login?redirectTo=%2Fpanel%2Fcalendar');
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

		const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
		const authUrl = oauth2Client.generateAuthUrl({
			access_type: 'offline',
			prompt: 'consent',
			scope: [GOOGLE_CALENDAR_SCOPE],
		});
		console.info('[google-connect] auth url generated', {
			scope: GOOGLE_CALENDAR_SCOPE,
			redirectUri,
		});

		return toRedirectResponse(authUrl);
	} catch (error) {
		console.error('[google-connect] error', error);
		const debugMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
		return toErrorRedirect('google_connect_failed', debugMessage);
	}
};
