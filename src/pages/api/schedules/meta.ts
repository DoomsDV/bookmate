import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import {
	SchedulesApiError,
	listLocationsLovWithOrds,
	listProfessionalsLovWithOrds,
	listScheduleDaysWithOrds,
} from '../../../lib/schedules';
import { parseTokenClaims } from '../../../lib/token-claims';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const createSchedulesError = (message: string, status = 400) => new SchedulesApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createSchedulesError, 'No hay sesion valida para consultar horarios.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is SchedulesApiError => value instanceof SchedulesApiError,
		createError: createSchedulesError,
	});

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		const claims = parseTokenClaims(token);
		const roleId = Number(locals.roleId ?? claims.role_id ?? 0);

		const [professionals, locations, days] = await Promise.all([
			listProfessionalsLovWithOrds(token, { onlyMe: roleId === ROLES.PROFESIONAL }),
			listLocationsLovWithOrds(token),
			listScheduleDaysWithOrds(token),
		]);

		return Response.json(
			{
				status: 'success',
				data: {
					professionals,
					locations,
					days,
				},
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los catalogos de horarios.');
	}
};
