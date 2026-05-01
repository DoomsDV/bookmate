import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import { CustomersApiError } from '../../../lib/customers';
import { listProfessionalsLovWithOrds } from '../../../lib/schedules';
import { parseTokenClaims } from '../../../lib/token-claims';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const createCustomersError = (message: string, status = 400) =>
	new CustomersApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createCustomersError, 'No hay sesion valida para consultar clientes.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is CustomersApiError => value instanceof CustomersApiError,
		createError: createCustomersError,
	});

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		const claims = parseTokenClaims(token);
		const roleId = Number(locals.roleId ?? claims.role_id ?? 0);
		const isProfessional = roleId === ROLES.PROFESIONAL;

		const professionals = await listProfessionalsLovWithOrds(token, {
			onlyMe: isProfessional,
		});
		const currentProfessionalId = isProfessional
			? Number(professionals[0]?.id_professional || 0)
			: 0;

		if (isProfessional && currentProfessionalId <= 0) {
			throw new CustomersApiError(
				'No fue posible determinar el perfil profesional de tu sesion.',
				403
			);
		}

		return Response.json(
			{
				status: 'success',
				data: {
					professionals,
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
		return toErrorResponse(error, 'No fue posible obtener los catalogos de clientes.');
	}
};
