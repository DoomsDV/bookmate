import type { APIRoute } from 'astro';

import { ROLES } from '../../config/roles';
import { validateCustomerContactInput } from '../../lib/customer-contact';
import {
	createCustomerWithOrds,
	CustomersApiError,
	listCustomersWithOrds,
} from '../../lib/customers';
import {
	ORG_ACCESS_INACTIVE_CODE,
	ORG_ACCESS_INACTIVE_MESSAGE,
} from '../../lib/panel-access';
import { listProfessionalsLovWithOrds } from '../../lib/schedules';
import { parseTokenClaims } from '../../lib/token-claims';
import {
	parseRequestBody,
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
		const searchQuery = String(
			url.searchParams.get('search') || url.searchParams.get('q') || ''
		).trim();

		if (roleId === ROLES.PROFESIONAL) {
			const currentProfessionalId = await getCurrentProfessionalId(token);
			if (currentProfessionalId <= 0) {
				throw new CustomersApiError(ORG_ACCESS_INACTIVE_MESSAGE, 401, {
					code: ORG_ACCESS_INACTIVE_CODE,
				});
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
			search: searchQuery || undefined,
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

const parseCreateBody = (request: Request) =>
	parseRequestBody(request, (formData) => ({
		first_name: formData.get('first_name'),
		last_name: formData.get('last_name'),
		full_name: formData.get('full_name'),
		phone_number: formData.get('phone_number'),
		document_number: formData.get('document_number'),
		email: formData.get('email'),
	}));

export const POST: APIRoute = async ({ locals, request }) => {
	try {
		const token = requireToken(locals.token);
		const roleId = Number(locals.roleId ?? 0);
		if (roleId !== ROLES.ADMIN && roleId !== ROLES.RECEPCIONISTA) {
			throw new CustomersApiError('No tienes permisos para crear clientes.', 403);
		}

		const body = await parseCreateBody(request);
		const validated = validateCustomerContactInput(body);
		if (!validated.ok) {
			throw new CustomersApiError(
				validated.errors[0]?.message || 'Errores de validacion en los campos enviados.',
				400,
				undefined,
				validated.errors
			);
		}

		const created = await createCustomerWithOrds(token, validated.value);
		return Response.json(
			{
				status: 'success',
				data: created,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible crear el cliente.');
	}
};
