import { resolveOrdsApiUrl } from './env-urls';
import {
	ORG_ACCESS_INACTIVE_CODE,
	ORG_ACCESS_INACTIVE_MESSAGE,
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

	constructor(message: string, status = 401, code = ORG_ACCESS_INACTIVE_CODE) {
		super(message);
		this.name = 'PanelAccessError';
		this.status = status;
		this.code = code;
	}
}

export const validatePanelSessionWithOrds = async (token: string) => {
	if (!token) {
		throw new PanelAccessError(ORG_ACCESS_INACTIVE_MESSAGE, 401);
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
			throw new PanelAccessError(ORG_ACCESS_INACTIVE_MESSAGE, response.status || 401);
		}
		return;
	}

	if (!response.ok || data?.status !== 'success') {
		const message =
			typeof data?.message === 'string' && data.message.trim()
				? data.message.trim()
				: ORG_ACCESS_INACTIVE_MESSAGE;
		const code =
			typeof data?.code === 'string' && data.code.trim()
				? data.code.trim()
				: ORG_ACCESS_INACTIVE_CODE;
		throw new PanelAccessError(message, response.status || 401, code);
	}
};
