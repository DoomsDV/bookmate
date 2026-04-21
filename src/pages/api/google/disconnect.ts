import type { APIRoute } from 'astro';

const PROVIDER = 'google_calendar';

const toRedirectResponse = (location: string, status = 302) =>
	new Response(null, {
		status,
		headers: {
			Location: location,
		},
	});

const wantsHtml = (request: Request) => {
	const accept = request.headers.get('accept') || '';
	const contentType = request.headers.get('content-type') || '';
	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
};

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

const handleDisconnect = async (request: Request, token: string | undefined) => {
	const htmlMode = wantsHtml(request);

	if (!token) {
		if (htmlMode) {
			return toRedirectResponse('/auth/login?redirectTo=%2Fpanel%2Fcalendar');
		}

		return Response.json(
			{
				status: 'error',
				message: 'No hay sesion valida para desconectar Google Calendar.',
			},
			{ status: 401 }
		);
	}

	try {
		const integrationUrl = buildIntegrationUrl();
		const ordsResponse = await fetch(integrationUrl, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
		});

		if (ordsResponse.status !== 200 && ordsResponse.status !== 404) {
			const message = await getErrorMessageFromResponse(ordsResponse);
			throw new Error(message);
		}

		if (htmlMode) {
			return toRedirectResponse('/panel/calendar?success=google_disconnected');
		}

		return Response.json(
			{
				status: 'success',
				message: 'Google Calendar desconectado correctamente.',
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('[google-disconnect] error', error);

		if (htmlMode) {
			return toRedirectResponse('/panel/calendar?error=google_disconnect_failed');
		}

		return Response.json(
			{
				status: 'error',
				message: 'No fue posible desconectar Google Calendar.',
			},
			{ status: 500 }
		);
	}
};

export const DELETE: APIRoute = async ({ request, locals }) => handleDisconnect(request, locals.token);

export const POST: APIRoute = async ({ request, locals }) => handleDisconnect(request, locals.token);
