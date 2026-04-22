import { google, type calendar_v3 } from 'googleapis';

const PROVIDER = 'google_calendar';

type IntegrationCredentials = {
	accessToken: string;
	refreshToken: string;
};

export type GoogleCalendarEvent = {
	id: string;
	title: string;
	start: string;
	end?: string;
	allDay?: boolean;
	backgroundColor: string;
	borderColor: string;
	textColor: string;
	classNames: string[];
	editable: false;
	startEditable: false;
	durationEditable: false;
	extendedProps: {
		source: 'google';
		description: string;
		location: string;
		htmlLink: string;
		status: string;
	};
};

export type GoogleCalendarEventsResult = {
	connected: boolean;
	events: GoogleCalendarEvent[];
};

export class GoogleCalendarApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'GoogleCalendarApiError';
		this.status = status;
		this.details = details;
	}
}

const getRequiredEnv = (value: string | undefined, envName: string) => {
	const resolved = String(value || '').trim();
	if (!resolved) {
		throw new GoogleCalendarApiError(
			`Missing required environment variable: ${envName}`,
			500
		);
	}
	return resolved;
};

const ensureToken = (token: string) => {
	if (!token) {
		throw new GoogleCalendarApiError(
			'No hay sesion valida para consultar Google Calendar.',
			401
		);
	}
};

const parseJsonResponse = async (response: Response) => {
	try {
		return await response.json();
	} catch {
		throw new GoogleCalendarApiError(
			'No fue posible interpretar la respuesta de integraciones.',
			502
		);
	}
};

const parseMessageFromPayload = (payload: unknown, fallback: string) => {
	if (!payload || typeof payload !== 'object') return fallback;
	if (!('message' in payload)) return fallback;
	const message = String(payload.message || '').trim();
	return message || fallback;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
};

const resolveIntegrationData = (payload: unknown) => {
	const source = toRecord(payload);
	if (!source) return null;
	const rawData = source.data;
	if (Array.isArray(rawData)) {
		return toRecord(rawData[0]);
	}
	return toRecord(rawData);
};

const getIntegrationCredentials = async (
	token: string
): Promise<IntegrationCredentials | null> => {
	const baseUrl = getRequiredEnv(import.meta.env.ORDS_INTEGRATIONS_URL, 'ORDS_INTEGRATIONS_URL');
	const integrationUrl = `${baseUrl.replace(/\/+$/, '')}/${PROVIDER}`;

	const response = await fetch(integrationUrl, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	if (response.status === 404) return null;

	const payload = await parseJsonResponse(response);
	if (!response.ok) {
		throw new GoogleCalendarApiError(
			parseMessageFromPayload(payload, 'No fue posible consultar la integracion de Google Calendar.'),
			response.status
		);
	}

	const data = resolveIntegrationData(payload);
	if (!data) return null;

	const accessToken = String(data.access_token || '').trim();
	const refreshToken = String(data.refresh_token || '').trim();
	if (!accessToken) return null;

	return {
		accessToken,
		refreshToken,
	};
};

const toIsoDateRange = (start: string, end: string) => {
	const startDate = new Date(start);
	const endDate = new Date(end);

	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		throw new GoogleCalendarApiError(
			'Las fechas de inicio y fin para Google Calendar son invalidas.',
			400
		);
	}

	return {
		timeMin: startDate.toISOString(),
		timeMax: endDate.toISOString(),
	};
};

const getDateTimeWithFallback = (startValue: string, endValue: string) => {
	const startDate = new Date(startValue);
	const endDate = new Date(endValue);
	if (Number.isNaN(startDate.getTime())) return { start: startValue, end: undefined };
	if (!Number.isNaN(endDate.getTime())) return { start: startDate.toISOString(), end: endDate.toISOString() };
	return {
		start: startDate.toISOString(),
		end: new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(),
	};
};

const getAllDayEndDate = (startDate: string, endDate: string) => {
	if (endDate) return endDate;
	const start = new Date(`${startDate}T00:00:00`);
	if (Number.isNaN(start.getTime())) return undefined;
	start.setDate(start.getDate() + 1);
	return start.toISOString().slice(0, 10);
};

const normalizeGoogleEvent = (
	item: calendar_v3.Schema$Event,
	index: number
): GoogleCalendarEvent | null => {
	const startDateTime = String(item.start?.dateTime || '').trim();
	const startDate = String(item.start?.date || '').trim();
	const endDateTime = String(item.end?.dateTime || '').trim();
	const endDate = String(item.end?.date || '').trim();
	const isAllDay = Boolean(startDate && !startDateTime);
	const startRaw = startDateTime || startDate;

	if (!startRaw) return null;

	let start = startRaw;
	let end: string | undefined = endDateTime || endDate || undefined;
	if (isAllDay) {
		start = startDate;
		end = getAllDayEndDate(startDate, endDate);
	} else {
		const normalized = getDateTimeWithFallback(startRaw, endDateTime);
		start = normalized.start;
		end = normalized.end;
	}

	const eventId = String(item.id || `${startRaw}-${index}`).trim();
	const title = String(item.summary || '').trim() || 'Evento de Google';
	const description = String(item.description || '').trim();

	return {
		id: `google:${eventId}`,
		title,
		start,
		end,
		allDay: isAllDay,
		backgroundColor: '#6b7280',
		borderColor: '#4b5563',
		textColor: '#f8fafc',
		classNames: ['fc-event-google'],
		editable: false,
		startEditable: false,
		durationEditable: false,
		extendedProps: {
			source: 'google',
			description,
			location: String(item.location || '').trim(),
			htmlLink: String(item.htmlLink || '').trim(),
			status: String(item.status || '').trim(),
		},
	};
};

const listGoogleEvents = async (
	credentials: IntegrationCredentials,
	timeMin: string,
	timeMax: string
) => {
	const clientId = getRequiredEnv(import.meta.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID');
	const clientSecret = getRequiredEnv(import.meta.env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET');
	const redirectUri = getRequiredEnv(import.meta.env.GOOGLE_REDIRECT_URI, 'GOOGLE_REDIRECT_URI');

	const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
	oauth2Client.setCredentials({
		access_token: credentials.accessToken,
		refresh_token: credentials.refreshToken || undefined,
	});

	const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
	const collected: GoogleCalendarEvent[] = [];

	let pageToken: string | undefined;
	do {
		const response = await calendar.events.list({
			calendarId: 'primary',
			timeMin,
			timeMax,
			singleEvents: true,
			orderBy: 'startTime',
			showDeleted: false,
			maxResults: 2500,
			pageToken,
		});

		const items = Array.isArray(response.data.items) ? response.data.items : [];
		for (let index = 0; index < items.length; index += 1) {
			const normalized = normalizeGoogleEvent(items[index], collected.length + index);
			if (normalized) collected.push(normalized);
		}

		pageToken = String(response.data.nextPageToken || '').trim() || undefined;
	} while (pageToken);

	return collected;
};

export const listGoogleCalendarEventsForRangeWithOrds = async (
	token: string,
	params: { start: string; end: string }
): Promise<GoogleCalendarEventsResult> => {
	ensureToken(token);
	const start = String(params.start || '').trim();
	const end = String(params.end || '').trim();
	if (!start || !end) {
		throw new GoogleCalendarApiError(
			'Las fechas de inicio y fin son obligatorias para Google Calendar.',
			400
		);
	}

	const credentials = await getIntegrationCredentials(token);
	if (!credentials) {
		return {
			connected: false,
			events: [],
		};
	}

	const { timeMin, timeMax } = toIsoDateRange(start, end);
	try {
		const events = await listGoogleEvents(credentials, timeMin, timeMax);
		return {
			connected: true,
			events,
		};
	} catch (error) {
		const debugMessage = error instanceof Error ? error.message : 'Unknown error';
		throw new GoogleCalendarApiError(
			`No fue posible cargar eventos de Google Calendar. ${debugMessage}`,
			502
		);
	}
};
