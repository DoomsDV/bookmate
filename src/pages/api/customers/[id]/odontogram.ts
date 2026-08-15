import type { APIRoute } from 'astro';

import {
	addOdontogramEventWithOrds,
	type AddOdontogramEventPayload,
	OdontogramApiError,
	getOdontogramWithOrds,
} from '../../../../lib/odontogram';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../../utils/api-helpers';

const createOdontogramError = (message: string, status = 400) =>
	new OdontogramApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createOdontogramError, 'No hay sesión válida.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is OdontogramApiError => value instanceof OdontogramApiError,
		createError: createOdontogramError,
	});

const parseCustomerId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const parseEventPayload = (source: unknown): AddOdontogramEventPayload => {
	if (!source || typeof source !== 'object') {
		throw new OdontogramApiError('Cuerpo de solicitud inválido.', 400);
	}

	const body = source as Record<string, unknown>;
	const toothFdi = Number(body.tooth_fdi);
	if (!Number.isInteger(toothFdi) || toothFdi <= 0) {
		throw new OdontogramApiError('Pieza dental inválida.', 400);
	}

	const findingCode = String(body.finding_code || '').trim().toUpperCase();
	if (!findingCode) {
		throw new OdontogramApiError('Falta el tipo de hallazgo.', 400);
	}

	const facesSource = (body.faces ?? {}) as Record<string, unknown>;
	const toFace = (value: unknown) => value === 1 || value === true || value === '1';

	return {
		tooth_fdi: toothFdi,
		finding_code: findingCode as AddOdontogramEventPayload['finding_code'],
		notes: body.notes == null ? null : String(body.notes),
		faces: {
			occlusal: toFace(facesSource.occlusal),
			vestibular: toFace(facesSource.vestibular),
			palatal: toFace(facesSource.palatal),
			mesial: toFace(facesSource.mesial),
			distal: toFace(facesSource.distal),
		},
	};
};

export const GET: APIRoute = async ({ locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parseCustomerId(params.id);

		if (customerId <= 0) {
			throw new OdontogramApiError('ID de cliente inválido.', 400);
		}

		const chart = await getOdontogramWithOrds(token, customerId);

		return Response.json(
			{
				status: 'success',
				data: chart,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el odontograma.');
	}
};

export const POST: APIRoute = async ({ request, locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parseCustomerId(params.id);

		if (customerId <= 0) {
			throw new OdontogramApiError('ID de cliente inválido.', 400);
		}

		const body = await request.json().catch(() => ({}));
		const payload = parseEventPayload(body);
		const event = await addOdontogramEventWithOrds(token, customerId, payload);

		return Response.json(
			{
				status: 'success',
				data: event,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible registrar el hallazgo en el odontograma.');
	}
};
