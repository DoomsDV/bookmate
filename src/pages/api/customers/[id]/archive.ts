import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../../config/capabilities';
import { archiveCustomerWithOrds, CustomersApiError } from '../../../../lib/customers';
import { requireCapability } from '../../../../lib/permissions';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../../utils/api-helpers';

const createCustomersError = (message: string, status = 400) =>
	new CustomersApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createCustomersError, 'No hay sesion valida para archivar clientes.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is CustomersApiError => value instanceof CustomersApiError,
		createError: createCustomersError,
	});

const parseCustomerId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const POST: APIRoute = async ({ locals, params }) => {
	try {
		const token = requireToken(locals.token);
		const customerId = parseCustomerId(params.id);

		if (customerId <= 0) {
			throw new CustomersApiError('ID de cliente invalido.', 400);
		}

		requireCapability(
			locals,
			CAPABILITIES.CUSTOMERS_EDIT,
			(message, status) => new CustomersApiError(message, status),
			'No tienes permisos para archivar clientes.'
		);

		const archived = await archiveCustomerWithOrds(token, customerId);
		return Response.json(
			{
				status: 'success',
				data: archived,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible archivar el cliente.');
	}
};
