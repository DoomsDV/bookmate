import { resolveOrdsApiUrl } from './env-urls';

export const FCM_SUBSCRIBE_URL = resolveOrdsApiUrl(
	import.meta.env.FCM_SUSCRIBE_URL,
	'FCM_SUSCRIBE_URL',
	'/fcm/subscribe'
);

export const FCM_UNSUBSCRIBE_URL = resolveOrdsApiUrl(
	import.meta.env.FCM_UNSUSCRIBE_URL,
	'FCM_UNSUSCRIBE_URL',
	'/fcm/unsubscribe'
);

interface FcmSuccessResponse {
	status: 'success';
	message?: string;
}

interface FcmFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

export interface RegisterFcmPayload {
	user_id: number;
	fcm_token: string;
	platform?: string;
}

export interface UnregisterFcmPayload {
	fcm_token: string;
}

export class FcmApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'FcmApiError';
		this.status = status;
		this.details = details;
	}
}

const parseFcmResponse = async (
	response: Response,
	fallbackMessage: string
): Promise<{ message: string }> => {
	let data: FcmSuccessResponse | FcmFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new FcmApiError('No fue posible interpretar la respuesta de notificaciones.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failure = (data ?? {}) as FcmFailureResponse;
		throw new FcmApiError(
			failure.message || fallbackMessage,
			response.status || 400,
			failure.details
		);
	}

	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: fallbackMessage,
	};
};

export const registerFcmTokenWithOrds = async (
	accessToken: string,
	payload: RegisterFcmPayload
) => {
	if (!accessToken) {
		throw new FcmApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(FCM_SUBSCRIBE_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseFcmResponse(response, 'No fue posible registrar el token FCM.');
};

export const unregisterFcmTokenWithOrds = async (
	accessToken: string,
	payload: UnregisterFcmPayload
) => {
	if (!accessToken) {
		throw new FcmApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(FCM_UNSUBSCRIBE_URL, {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseFcmResponse(response, 'No fue posible anular la suscripcion FCM.');
};
