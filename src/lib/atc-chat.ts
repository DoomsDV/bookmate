export class AtcChatApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'AtcChatApiError';
		this.status = status;
		this.details = details;
	}
}

const toText = (value: unknown) => String(value ?? '').trim();

const getEnvUrl = (envName: keyof ImportMetaEnv) => {
	const value = String(import.meta.env[envName] || '').trim();
	if (!value) {
		throw new AtcChatApiError(`Falta configurar ${envName} en el entorno.`, 500);
	}

	const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
	try {
		return new URL(withScheme).toString();
	} catch {
		throw new AtcChatApiError(`URL invalida en ${envName}.`, 500);
	}
};

const parseJsonResponse = async (response: Response) => {
	const payload = (await response.json().catch(() => null)) as
		| { status?: string; data?: unknown; message?: string; details?: unknown }
		| null;

	if (!response.ok || !payload || typeof payload !== 'object' || payload.status !== 'success') {
		throw new AtcChatApiError(
			toText(payload?.message) || 'No fue posible consultar el asistente ATC.',
			response.status || 502,
			payload?.details
		);
	}

	return payload.data;
};

export const askAtcWithOrds = async (token: string, message: string): Promise<string> => {
	const trimmed = toText(message);
	if (!token) throw new AtcChatApiError('No hay sesion valida.', 401);
	if (!trimmed) throw new AtcChatApiError('El mensaje no puede estar vacio.', 400);

	const response = await fetch(getEnvUrl('ORDS_AI_ATC_ASK'), {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({ message: trimmed }),
	});

	const data = await parseJsonResponse(response);
	if (!data || typeof data !== 'object') {
		throw new AtcChatApiError('La respuesta ATC no tiene datos validos.', 502);
	}

	const answer = toText((data as Record<string, unknown>).response);
	if (!answer) {
		throw new AtcChatApiError('La respuesta ATC vino vacia.', 502);
	}

	return answer;
};
