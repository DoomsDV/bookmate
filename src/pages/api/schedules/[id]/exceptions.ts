import type { APIRoute } from 'astro';
import { z } from 'zod';

import { ROLES } from '../../../../config/roles';
import {
	SchedulesApiError,
	listScheduleExceptionsWithOrds,
} from '../../../../lib/schedules';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../../utils/api-helpers';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const createSchedulesError = (message: string, status = 400) => new SchedulesApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createSchedulesError, 'No hay sesion valida para consultar excepciones.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is SchedulesApiError => value instanceof SchedulesApiError,
		createError: createSchedulesError,
	});

const parseProfessionalId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const rangeSchema = z.object({
	from: z.string().regex(DATE_KEY_REGEX, 'from debe ser YYYY-MM-DD.'),
	to: z.string().regex(DATE_KEY_REGEX, 'to debe ser YYYY-MM-DD.'),
});

export const GET: APIRoute = async ({ params, url, locals }) => {
	try {
		const token = requireToken(locals.token);
		const professionalId = parseProfessionalId(params.id);

		if (!professionalId) {
			throw new SchedulesApiError('ID de profesional invalido.', 400);
		}

		const parsedRange = rangeSchema.safeParse({
			from: url.searchParams.get('from')?.trim() ?? '',
			to: url.searchParams.get('to')?.trim() ?? '',
		});

		if (!parsedRange.success) {
			throw new SchedulesApiError('Debes indicar from y to en formato YYYY-MM-DD.', 400);
		}

		const roleId = Number(locals.roleId ?? 0);
		if (roleId === ROLES.PROFESIONAL) {
			// El profesional solo consulta; el listado se filtra por profesional seleccionado en UI.
		}

		const exceptions = await listScheduleExceptionsWithOrds(
			token,
			professionalId,
			parsedRange.data.from,
			parsedRange.data.to
		);

		return Response.json(
			{
				status: 'success',
				data: exceptions,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener las excepciones del calendario.');
	}
};
