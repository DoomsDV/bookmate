import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import {
	SchedulesApiError,
	listLocationsLovWithOrds,
	listProfessionalsLovWithOrds,
	listScheduleDaysWithOrds,
} from '../../../lib/schedules';
import { parseTokenClaims } from '../../../lib/token-claims';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new SchedulesApiError('No hay sesion valida para consultar horarios.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const schedulesError =
		error instanceof SchedulesApiError ? error : new SchedulesApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: schedulesError.message,
			details: schedulesError.details,
			errors: schedulesError.fieldErrors,
		},
		{ status: schedulesError.status }
	);
};

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
