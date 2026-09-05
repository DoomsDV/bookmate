import type { APIRoute } from 'astro';

import {
	BodyMapApiError,
	getBodySnapshotWithOrds,
	saveBodySnapshotWithOrds,
} from '../../../../../lib/body-map';
import type { BodySessionSnapshot } from '../../../../../lib/clinical-ficha/types';
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

const parsePositiveInt = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const parseSnapshotPayload = (
	customerId: number,
	appointmentId: number,
	source: unknown
): BodySessionSnapshot => {
	if (!source || typeof source !== 'object') {
		throw new BodyMapApiError('Cuerpo de solicitud inválido.', 400);
	}
	const body = source as Record<string, unknown>;
	const marks = Array.isArray(body.marks) ? body.marks : [];
	const joints = Array.isArray(body.joints) ? body.joints : [];
	return {
		customerId,
		appointmentId,
		capturedAt: String(body.capturedAt || body.captured_at || new Date().toISOString()).trim(),
		silhouette: String(body.silhouette || 'NEUTRAL').trim().toUpperCase() as BodySessionSnapshot['silhouette'],
		marks: marks as BodySessionSnapshot['marks'],
		joints: joints as BodySessionSnapshot['joints'],
		sessionLabel:
			typeof body.sessionLabel === 'string'
				? body.sessionLabel
				: typeof body.session_label === 'string'
					? body.session_label
					: undefined,
	};
};

export const GET: APIRoute = async ({ locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parsePositiveInt(params.id);
		const appointmentId = parsePositiveInt(params.appointmentId);
		if (customerId <= 0 || appointmentId <= 0) {
			throw new BodyMapApiError('Parámetros inválidos.', 400);
		}

		const snapshot = await getBodySnapshotWithOrds(token, customerId, appointmentId);
		return Response.json({ status: 'success', data: snapshot }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el mapa corporal.');
	}
};

export const PUT: APIRoute = async ({ request, locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parsePositiveInt(params.id);
		const appointmentId = parsePositiveInt(params.appointmentId);
		if (customerId <= 0 || appointmentId <= 0) {
			throw new BodyMapApiError('Parámetros inválidos.', 400);
		}

		const body = await request.json().catch(() => ({}));
		const snapshot = parseSnapshotPayload(customerId, appointmentId, body);
		const result = await saveBodySnapshotWithOrds(token, customerId, snapshot);

		return Response.json({ status: 'success', data: result }, { status: 200 });
	} catch (error) {
		return toErrorResponse(error, 'No fue posible guardar el mapa corporal.');
	}
};
