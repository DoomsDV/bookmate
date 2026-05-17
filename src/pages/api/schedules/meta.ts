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

		const isProfessional = roleId === ROLES.PROFESIONAL;
		const [professionals, locations, days] = await Promise.all([
			listProfessionalsLovWithOrds(token, { onlyMe: isProfessional }),
			listLocationsLovWithOrds(token),
			listScheduleDaysWithOrds(token),
		]);

		const currentProfessionalId = isProfessional
			? Number(professionals[0]?.id_professional || 0)
			: 0;

		if (isProfessional && currentProfessionalId <= 0) {
			throw new SchedulesApiError(
				'No fue posible determinar el perfil profesional de tu sesion.',
				403
			);
		}

		return Response.json(
			{
				status: 'success',
				data: {
					professionals,
					locations,
					days,
					session: {
						role_id: roleId,
						user_id: Number(locals.userId ?? claims.user_id ?? 0),
						professional_id: currentProfessionalId,
					},
				},
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los catalogos de horarios.');
	}
};
