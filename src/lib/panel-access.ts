import { INTERNAL_ERROR_API_CODE, SESSION_EXPIRED_API_CODE } from './api-error-codes';
import { resolveOrdsApiUrl } from './env-urls';
import {
	ORG_ACCESS_INACTIVE_CODE,
	ORG_ACCESS_INACTIVE_MESSAGE,
	isOrgAccessInactiveResponse,
} from './session-auth-messages';

export { ORG_ACCESS_INACTIVE_CODE, ORG_ACCESS_INACTIVE_MESSAGE };

const VALIDATE_PANEL_SESSION_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AUTH_VALIDATE_PANEL_URL,
	'ORDS_AUTH_VALIDATE_PANEL_URL',
	'/auth/validate-panel'
);

export class PanelAccessError extends Error {
	status: number;
	code: string;

	constructor(message: string, status = 401, code = SESSION_EXPIRED_API_CODE) {
		super(message);
		this.name = 'PanelAccessError';
		this.status = status;
		this.code = code;
	}
}

const resolvePanelAccessCode = (params: {
	status: number;
	message: string;
	codeFromBody: string;
}) => {
	if (params.codeFromBody) return params.codeFromBody;
	if (isOrgAccessInactiveResponse(params)) return ORG_ACCESS_INACTIVE_CODE;
	if (params.status >= 500) return INTERNAL_ERROR_API_CODE;
	return SESSION_EXPIRED_API_CODE;
};

export const validatePanelSessionWithOrds = async (token: string) => {
	if (!token) {
		throw new PanelAccessError('Token de acceso requerido.', 401, SESSION_EXPIRED_API_CODE);
	}

	const response = await fetch(VALIDATE_PANEL_SESSION_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	if (response.status === 404) {
		return;
	}

	let data: Record<string, unknown> | null = null;
	try {
		data = await response.json();
	} catch {
		if (!response.ok) {
			const status = response.status || 401;
			throw new PanelAccessError(
				status >= 500
					? 'No fue posible validar el acceso al panel.'
					: 'Token inválido o expirado.',
				status,
				status >= 500 ? INTERNAL_ERROR_API_CODE : SESSION_EXPIRED_API_CODE
			);
		}
		return;
	}

	if (!response.ok || data?.status !== 'success') {
		const message =
			typeof data?.message === 'string' && data.message.trim()
				? data.message.trim()
				: response.status >= 500
					? 'No fue posible validar el acceso al panel.'
					: 'Token inválido o expirado.';
		const codeFromBody =
			typeof data?.code === 'string' && data.code.trim() ? data.code.trim() : '';
		const status = response.status || 401;
		throw new PanelAccessError(
			message,
			status,
			resolvePanelAccessCode({ status, message, codeFromBody })
		);
	}
};
