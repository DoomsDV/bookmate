export type AssistantMessageRole = 'user' | 'assistant';

export type AssistantHistoryMessage = {
	role: AssistantMessageRole;
	content: string;
};

export type AssistantQueryPayload = {
	query: string;
	messages: AssistantHistoryMessage[];
	locale: string;
};

export class AssistantAgentError extends Error {
	status: number;
	code: string;

	constructor(message: string, status = 400, code = 'invalid_request') {
		super(message);
		this.name = 'AssistantAgentError';
		this.status = status;
		this.code = code;
	}
}

const MAX_QUERY_LENGTH = 4_000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_LENGTH = 12_000;
const DEFAULT_TIMEOUT_MS = 40_000;

const asText = (value: unknown) => String(value ?? '').trim();

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const configuredBaseUrl = () => asText(import.meta.env?.BOOKMATE_AGENT_BASE_URL);

export const isAssistantAgentConfigured = () => {
	const raw = configuredBaseUrl();
	if (!raw) return false;
	try {
		const url = new URL(raw);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
};

export const getAssistantAgentQueryUrl = (baseUrl = configuredBaseUrl()) => {
	const raw = asText(baseUrl);
	if (!raw) {
		throw new AssistantAgentError(
			'El asistente no está configurado en este ambiente.',
			503,
			'assistant_unavailable'
		);
	}

	try {
		const base = new URL(raw);
		if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('protocol');
		return new URL('v1/query', `${base.toString().replace(/\/+$/, '')}/`).toString();
	} catch {
		throw new AssistantAgentError(
			'La configuración del asistente no es válida.',
			503,
			'assistant_unavailable'
		);
	}
};

export const getAssistantAgentTimeoutMs = () => {
	const parsed = Number.parseInt(asText(import.meta.env?.BOOKMATE_AGENT_TIMEOUT_MS), 10);
	if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 120_000) return DEFAULT_TIMEOUT_MS;
	return parsed;
};

export const parseAssistantQueryPayload = (value: unknown): AssistantQueryPayload => {
	const body = asRecord(value);
	if (!body) throw new AssistantAgentError('El mensaje del asistente no es válido.');

	const allowedFields = new Set(['query', 'messages', 'locale']);
	if (Object.keys(body).some((key) => !allowedFields.has(key))) {
		throw new AssistantAgentError('El mensaje del asistente contiene campos no permitidos.');
	}

	const query = asText(body.query);
	if (!query || Array.from(query).length > MAX_QUERY_LENGTH) {
		throw new AssistantAgentError('La consulta debe tener entre 1 y 4.000 caracteres.');
	}

	const rawMessages = body.messages ?? [];
	if (!Array.isArray(rawMessages) || rawMessages.length > MAX_HISTORY_MESSAGES) {
		throw new AssistantAgentError('El historial de la conversación no es válido.');
	}

	let historyLength = 0;
	const messages = rawMessages.map((rawMessage) => {
		const message = asRecord(rawMessage);
		const role = asText(message?.role);
		const content = asText(message?.content);
		if ((role !== 'user' && role !== 'assistant') || !content || Array.from(content).length > MAX_QUERY_LENGTH) {
			throw new AssistantAgentError('El historial de la conversación no es válido.');
		}
		historyLength += Array.from(content).length;
		return { role, content } as AssistantHistoryMessage;
	});

	if (historyLength > MAX_HISTORY_LENGTH) {
		throw new AssistantAgentError('El historial de la conversación es demasiado largo.');
	}

	const locale = asText(body.locale);
	if (Array.from(locale).length > 20) {
		throw new AssistantAgentError('El idioma de la consulta no es válido.');
	}

	return { query, messages, locale };
};

const combinedSignal = (requestSignal: AbortSignal, timeoutMs: number) => {
	const timeout = AbortSignal.timeout(timeoutMs);
	return typeof AbortSignal.any === 'function'
		? AbortSignal.any([requestSignal, timeout])
		: timeout;
};

export const queryAssistantAgent = async (
	token: string,
	payload: AssistantQueryPayload,
	requestSignal: AbortSignal,
	fetchImpl: typeof fetch = fetch,
	options: { baseUrl?: string; timeoutMs?: number } = {}
) => {
	if (!asText(token)) {
		throw new AssistantAgentError('No hay una sesión válida para usar el asistente.', 401, 'unauthorized');
	}

	try {
		const timeoutMs = options.timeoutMs ?? getAssistantAgentTimeoutMs();
		return await fetchImpl(getAssistantAgentQueryUrl(options.baseUrl), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
			},
			body: JSON.stringify(payload),
			signal: combinedSignal(requestSignal, timeoutMs),
		});
	} catch (error) {
		if (requestSignal.aborted) throw error;
		if (error instanceof AssistantAgentError) throw error;
		if (error instanceof DOMException && error.name === 'TimeoutError') {
			throw new AssistantAgentError('El asistente tardó demasiado en responder.', 504, 'timeout');
		}
		throw new AssistantAgentError(
			'El asistente no está disponible en este momento.',
			502,
			'assistant_unavailable'
		);
	}
};
