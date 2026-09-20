import type { APIRoute } from 'astro';

import {
	PublicBookingApiError,
	validatePublicCustomerWithOrds,
	type PublicValidateCustomerPayload,
} from '../../../lib/public-booking';
import {
	parseRequestBody,
	publicBookingErrorResponse,
} from '../../../lib/public-api-handlers';

const parsePayload = (source: any): PublicValidateCustomerPayload => {
	const payload: PublicValidateCustomerPayload = {
		organization_slug: String(source?.organization_slug || source?.org_slug || '').trim(),
		customer_phone: String(source?.customer_phone || '').trim(),
	};

	if (!payload.organization_slug || !payload.customer_phone) {
		throw new PublicBookingApiError(
			'organization_slug y customer_phone son obligatorios.',
			400
		);
	}

	return payload;
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await parseRequestBody(request);
		const payload = parsePayload(body);
		const result = await validatePublicCustomerWithOrds(payload);

		return Response.json(
			{
				status: 'success',
				exists: result.exists,
				message: result.message,
				data: result.customer
					? {
							id_customer: result.customer.id_customer,
							full_name: result.customer.full_name,
						}
					: null,
			},
			{ status: 200 }
		);
	} catch (error) {
		return publicBookingErrorResponse(error, 'No fue posible validar el cliente.');
	}
};
