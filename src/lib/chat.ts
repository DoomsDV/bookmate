export interface ChatSession {
	id_session: number;
	title: string;
	updated_at: string;
}

export interface ChatMessage {
	id_message: number;
	role: 'user' | 'assistant';
	content: string;
	created_at: string;
}

export interface SendChatMessageResult {
	session_id: number;
	response: string;
}

export interface AiChatQuickAction {
	label: string;
	message: string;
	icon: string;
}

export const AI_CHAT_SUGGESTED_QUESTIONS: AiChatQuickAction[] = [
	{
		label: '¿Qué citas tengo hoy?',
		message: 'Mostrame mis citas de hoy.',
		icon: 'today',
	},
	{
		label: '¿Qué turnos tengo esta semana?',
		message: 'Listame mis próximas citas de los próximos 7 días desde hoy.',
		icon: 'date_range',
	},
	{
		label: '¿Cómo está mi agenda?',
		message: 'Dame un resumen del estado de mi agenda y próximos turnos.',
		icon: 'auto_graph',
	},
];

export const AI_CHAT_QUICK_ACTIONS: AiChatQuickAction[] = [
	{
		label: 'Buscar horarios',
		message: 'Quiero buscar disponibilidad para crear una cita.',
		icon: 'event_available',
	},
	{
		label: 'Crear cita',
		message: 'Quiero crear una cita nueva.',
		icon: 'add_circle',
	},
	{
		label: 'Cancelar cita',
		message: 'Necesito cancelar una cita.',
		icon: 'event_busy',
	},
];

interface ChatSuccessResponse {
	status: 'success';
	data?: unknown;
}

interface ChatFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class ChatApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'ChatApiError';
		this.status = status;
		this.details = details;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value: unknown) => String(value ?? '').trim();

const getEnvUrl = (envName: keyof ImportMetaEnv) => {
	const value = String(import.meta.env[envName] || '').trim();
	if (!value) {
		throw new ChatApiError(`Falta configurar ${envName} en el entorno.`, 500);
	}

	const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
	try {
		return new URL(withScheme).toString();
	} catch {
		throw new ChatApiError(`URL invalida en ${envName}.`, 500);
	}
};

const getMessagesUrl = (sessionId: number) => {
	const rawUrl = getEnvUrl('ORDS_AI_GET_CHAT_MESSAGES');
	const encodedId = encodeURIComponent(String(sessionId));

	if (rawUrl.includes(':id')) return rawUrl.replace(':id', encodedId);
	if (rawUrl.includes('{id}')) return rawUrl.replace('{id}', encodedId);
	if (rawUrl.includes('/id/')) return rawUrl.replace('/id/', `/${encodedId}/`);

	const trimmed = rawUrl.replace(/\/+$/, '');
	if (/\/messages$/i.test(trimmed)) {
		return trimmed.replace(/\/messages$/i, `/${encodedId}/messages`);
	}

	return `${trimmed}/${encodedId}/messages`;
};

const getDeleteSessionUrl = (sessionId: number) => {
	const rawUrl = getEnvUrl('ORDS_AI_DELETE_CHAT_SESSION');
	const encodedId = encodeURIComponent(String(sessionId));

	if (rawUrl.includes(':id')) return rawUrl.replace(':id', encodedId);
	if (rawUrl.includes('{id}')) return rawUrl.replace('{id}', encodedId);
	if (rawUrl.includes('/id')) return rawUrl.replace(/\/id\/?$/i, `/${encodedId}`);

	return `${rawUrl.replace(/\/+$/, '')}/${encodedId}`;
};

const ensureToken = (token: string) => {
	if (!token) throw new ChatApiError('Token de acceso requerido.', 401);
};

const parseJsonResponse = async (response: Response) => {
	let data: ChatSuccessResponse | ChatFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new ChatApiError('No fue posible interpretar la respuesta del chat IA.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as ChatFailureResponse;
		throw new ChatApiError(
			toText(failureData.message) || 'No fue posible procesar la solicitud del chat IA.',
			response.status || 400,
			failureData.details
		);
	}

	return data.data;
};

const normalizeSession = (value: unknown): ChatSession | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const sessionId = toNumber(source.id_session, NaN);
	if (!Number.isInteger(sessionId) || sessionId <= 0) return null;

	return {
		id_session: sessionId,
		title: toText(source.title) || `Chat #${sessionId}`,
		updated_at: toText(source.updated_at),
	};
};

const normalizeMessage = (value: unknown): ChatMessage | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const messageId = toNumber(source.id_message, NaN);
	const roleRaw = toText(source.role || source.sender_role).toLowerCase();
	const role = roleRaw === 'assistant' ? 'assistant' : 'user';
	if (!Number.isInteger(messageId) || messageId <= 0) return null;

	return {
		id_message: messageId,
		role,
		content: toText(source.content),
		created_at: toText(source.created_at),
	};
};

export const sendChatMessageWithOrds = async (
	token: string,
	payload: { message: string; session_id?: number }
): Promise<SendChatMessageResult> => {
	ensureToken(token);

	const message = toText(payload.message);
	if (!message) throw new ChatApiError('El mensaje no puede estar vacio.', 400);

	const body: Record<string, unknown> = { message };
	if (Number.isInteger(payload.session_id) && Number(payload.session_id) > 0) {
		body.session_id = Number(payload.session_id);
	}

	const response = await fetch(getEnvUrl('ORDS_AI_SEND_CHAT'), {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(body),
	});

	const data = await parseJsonResponse(response);
	if (!data || typeof data !== 'object') {
		throw new ChatApiError('La respuesta del chat IA no tiene datos validos.', 502);
	}

	const source = data as Record<string, unknown>;
	const sessionId = toNumber(source.session_id, 0);
	return {
		session_id: sessionId,
		response: toText(source.response),
	};
};

export const listChatSessionsWithOrds = async (token: string): Promise<ChatSession[]> => {
	ensureToken(token);

	const response = await fetch(getEnvUrl('ORDS_AI_GET_CHAT_SESSION'), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const data = await parseJsonResponse(response);
	const rows = Array.isArray(data) ? data : [];
	return rows
		.map(normalizeSession)
		.filter((session): session is ChatSession => session !== null);
};

export const getChatMessagesWithOrds = async (
	token: string,
	sessionId: number
): Promise<ChatMessage[]> => {
	ensureToken(token);
	if (!Number.isInteger(sessionId) || sessionId <= 0) {
		throw new ChatApiError('ID de sesion invalido.', 400);
	}

	const response = await fetch(getMessagesUrl(sessionId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const data = await parseJsonResponse(response);
	const rows = Array.isArray(data) ? data : [];
	return rows
		.map(normalizeMessage)
		.filter((message): message is ChatMessage => message !== null);
};

export const deleteChatSessionWithOrds = async (
	token: string,
	sessionId: number
): Promise<{ id_session: number }> => {
	ensureToken(token);
	if (!Number.isInteger(sessionId) || sessionId <= 0) {
		throw new ChatApiError('ID de sesion invalido.', 400);
	}

	const response = await fetch(getDeleteSessionUrl(sessionId), {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const data = await parseJsonResponse(response);
	const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
	return {
		id_session: toNumber(source.id_session, sessionId),
	};
};
