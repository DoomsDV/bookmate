import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../config/capabilities';
import {
	AnalyticsApiError,
	getAnalyticsWithOrds,
} from '../../lib/analytics';
import { requireCapability } from '../../lib/permissions';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new AnalyticsApiError('No hay sesion valida para consultar analíticas.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const analyticsError =
		error instanceof AnalyticsApiError ? error : new AnalyticsApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: analyticsError.message,
			details: analyticsError.details,
		},
		{ status: analyticsError.status }
	);
};

export const GET: APIRoute = async ({ locals, url }) => {
	try {
		const token = requireToken(locals.token);
		requireCapability(
			locals,
			CAPABILITIES.ANALYTICS_VIEW,
			(message, status) => new AnalyticsApiError(message, status),
			'No tienes permisos para ver analíticas.'
		);

		const data = await getAnalyticsWithOrds(token, {
			days: url.searchParams.get('days'),
			location_id: url.searchParams.get('location_id'),
			professional_id: url.searchParams.get('professional_id'),
		});

		return Response.json(
			{
				status: 'success',
				data,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener las analíticas.');
	}
};
