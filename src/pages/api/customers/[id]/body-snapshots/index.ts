import type { APIRoute } from 'astro';

import {
	BodyMapApiError,
	listBodySnapshotSummariesWithOrds,
} from '../../../../../lib/body-map';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../../../utils/api-helpers';

const createBodyMapError = (message: string, status = 400) =>
	new BodyMapApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createBodyMapError, 'No hay sesión válida.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is BodyMapApiError => value instanceof BodyMapApiError,
		createError: createBodyMapError,
	});

const parseCustomerId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const GET: APIRoute = async ({ locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parseCustomerId(params.id);
		if (customerId <= 0) {
			throw new BodyMapApiError('ID de cliente inválido.', 400);
		}

		const summaries = await listBodySnapshotSummariesWithOrds(token, customerId);
		return Response.json({ status: 'success', data: summaries }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible listar los mapas corporales.');
	}
};
