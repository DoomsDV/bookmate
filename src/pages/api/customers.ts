import type { APIRoute } from 'astro';

import { ROLES } from '../../config/roles';
import { CustomersApiError, listCustomersWithOrds } from '../../lib/customers';
import { listProfessionalsLovWithOrds } from '../../lib/schedules';
import { parseTokenClaims } from '../../lib/token-claims';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toOptionalPositiveInt,
	toPositiveInt,
} from '../../utils/api-helpers';

const createCustomersError = (message: string, status = 400) =>
	new CustomersApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createCustomersError, 'No hay sesion valida para consultar clientes.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is CustomersApiError => value instanceof CustomersApiError,
		createError: createCustomersError,
	});

const getCurrentProfessionalId = async (token: string) => {
	const professionals = await listProfessionalsLovWithOrds(token, { onlyMe: true });
	return Number(professionals[0]?.id_professional || 0);
};

export const GET: APIRoute = async ({ locals, url }) => {
	try {
		const token = requireToken(locals.token);
		const claims = parseTokenClaims(token);
		const roleId = Number(locals.roleId ?? claims.role_id ?? 0);

		const page = toPositiveInt(url.searchParams.get('page'), 1);
		const limit = toPositiveInt(url.searchParams.get('limit'), 9);
		let professionalId = toOptionalPositiveInt(url.searchParams.get('pro_id'));

		if (roleId === ROLES.PROFESIONAL) {
			const currentProfessionalId = await getCurrentProfessionalId(token);
			if (currentProfessionalId <= 0) {
				throw new CustomersApiError(
					'No fue posible determinar el perfil profesional de tu sesion.',
					403
				);
			}

			if (professionalId && professionalId !== currentProfessionalId) {
				throw new CustomersApiError('No tienes permisos para consultar clientes de otro profesional.', 403);
			}

			professionalId = currentProfessionalId;
		}

		const result = await listCustomersWithOrds(token, {
			page,
			limit,
			pro_id: professionalId,
		});

		return Response.json(
			{
				status: 'success',
				data: result.data,
				meta: result.meta,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el listado de clientes.');
	}
};
