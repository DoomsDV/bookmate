import type { APIRoute } from 'astro';
import { google } from 'googleapis';

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

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

export const GET: APIRoute = async ({ locals }) => {
	try {
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

		return toRedirectResponse(authUrl);
	} catch (error) {
		console.error('[google-connect] error', error);
		return toRedirectResponse('/panel/calendar?error=google_connect_failed');
	}
};
