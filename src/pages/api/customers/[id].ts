import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import {
	CustomersApiError,
	getCustomerProfileWithOrds,
	updateCustomerProfileWithOrds,
} from '../../../lib/customers';
import {
	ORG_ACCESS_INACTIVE_CODE,
	ORG_ACCESS_INACTIVE_MESSAGE,
} from '../../../lib/panel-access';
import { listProfessionalsLovWithOrds } from '../../../lib/schedules';
import { PARAGUAY_MOBILE_PHONE_ERROR, parseParaguayMobilePhone } from '../../../lib/paraguay-phone';
import {
	parseRequestBody,
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toOptionalPositiveInt,
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

const parseCustomerId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const getCurrentProfessionalId = async (token: string) => {
	const professionals = await listProfessionalsLovWithOrds(token, { onlyMe: true });
	return Number(professionals[0]?.id_professional || 0);
};

const parseUpdateBody = (request: Request) =>
	parseRequestBody(request, (formData) => ({
		full_name: formData.get('full_name'),
		phone_number: formData.get('phone_number'),
	}));

export const GET: APIRoute = async ({ locals, params, url }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parseCustomerId(params.id);

		if (customerId <= 0) {
			throw new CustomersApiError('ID de cliente invalido.', 400);
		}

		const roleId = Number(locals.roleId ?? 0);
		let professionalId = toOptionalPositiveInt(url.searchParams.get('pro_id'));

		if (roleId === ROLES.PROFESIONAL) {
			const currentProfessionalId = await getCurrentProfessionalId(token);
			if (currentProfessionalId <= 0) {
				throw new CustomersApiError(ORG_ACCESS_INACTIVE_MESSAGE, 401, {
					code: ORG_ACCESS_INACTIVE_CODE,
				});
			}

			if (professionalId && professionalId !== currentProfessionalId) {
				throw new CustomersApiError(
					'No tienes permisos para consultar clientes de otro profesional.',
					403
				);
			}

			professionalId = currentProfessionalId;
		}

		const profile = await getCustomerProfileWithOrds(token, customerId, {
			pro_id: professionalId,
		});

		return Response.json(
			{
				status: 'success',
				data: profile,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el perfil del cliente.');
	}
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parseCustomerId(params.id);

		if (customerId <= 0) {
			throw new CustomersApiError('ID de cliente invalido.', 400);
		}

		const roleId = Number(locals.roleId ?? 0);
		if (roleId !== ROLES.ADMIN && roleId !== ROLES.RECEPCIONISTA) {
			throw new CustomersApiError('No tienes permisos para editar clientes.', 403);
		}

		const body = await parseUpdateBody(request);
		const fullName = String(body.full_name ?? '').trim();
		const phoneNumberRaw = body.phone_number;
		const phoneNumber =
			phoneNumberRaw === null || phoneNumberRaw === undefined
				? ''
				: String(phoneNumberRaw).trim();

		if (!fullName) {
			throw new CustomersApiError('El nombre es obligatorio.', 400, undefined, [
				{ field: 'full_name', message: 'El nombre es obligatorio.' },
			]);
		}

		const parsedPhone = parseParaguayMobilePhone(phoneNumber);
		if (!parsedPhone.isValid) {
			throw new CustomersApiError('El telefono es obligatorio.', 400, undefined, [
				{
					field: 'phone_number',
					message: phoneNumber ? PARAGUAY_MOBILE_PHONE_ERROR : 'El telefono es obligatorio.',
				},
			]);
		}

		const updated = await updateCustomerProfileWithOrds(token, customerId, {
			full_name: fullName,
			phone_number: parsedPhone.e164,
		});

		return Response.json(
			{
				status: 'success',
				data: updated,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible actualizar el cliente.');
	}
};
