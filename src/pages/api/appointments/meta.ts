import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import { AppointmentsApiError } from '../../../lib/appointments';
import { listProfessionalsLovWithOrds, listLocationsLovWithOrds } from '../../../lib/schedules';
import { listServicesLovWithOrds } from '../../../lib/services';
import { parseTokenClaims } from '../../../lib/token-claims';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const createAppointmentsError = (message: string, status = 400) =>
	new AppointmentsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createAppointmentsError, 'No hay sesion valida para consultar citas.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is AppointmentsApiError => value instanceof AppointmentsApiError,
		createError: createAppointmentsError,
	});

export const GET: APIRoute = async ({ locals }) => {
	try {
		console.info('[appointments-meta] request:start', {
			hasToken: Boolean(locals.token),
		});
		const token = requireToken(locals.token);
		const claims = parseTokenClaims(token);
		console.info('[appointments-meta] token-claims', {
			role_id: claims.role_id,
			user_id: claims.user_id,
			organization_id: claims.organization_id,
		});

		const [professionals, locations, services] = await Promise.all([
			listProfessionalsLovWithOrds(token, { onlyMe: claims.role_id === ROLES.PROFESIONAL }),
			listLocationsLovWithOrds(token),
			listServicesLovWithOrds(token),
		]);

		let currentProfessionalId = 0;
		if (claims.role_id === ROLES.PROFESIONAL && professionals.length > 0) {
			currentProfessionalId = Number(professionals[0]?.id_professional || 0);
		}

		const visibleProfessionals =
			claims.role_id === ROLES.PROFESIONAL && currentProfessionalId > 0
				? professionals.filter((professional) => professional.id_professional === currentProfessionalId)
				: professionals;
		console.info('[appointments-meta] request:success', {
			professionals: visibleProfessionals.length,
			locations: locations.length,
			services: services.length,
			currentProfessionalId,
		});

		return Response.json(
			{
				status: 'success',
				data: {
					professionals: visibleProfessionals,
					locations,
					services,
					session: {
						role_id: claims.role_id,
						user_id: claims.user_id,
						professional_id: currentProfessionalId,
					},
				},
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('[appointments-meta] request:error', error);
		return toErrorResponse(error, 'No fue posible obtener los catalogos del calendario.');
	}
};
