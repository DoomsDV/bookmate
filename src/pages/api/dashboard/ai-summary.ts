import type { APIRoute } from 'astro';

import {
	DashboardApiError,
	getDashboardAiSummaryWithOrds,
} from '../../../lib/dashboard';

const requireToken = (token: string | undefined) => {
	if (!token) {
		throw new DashboardApiError('No hay sesion valida para recuperar el resumen IA.', 401);
	}
	return token;
};

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const dashboardError =
		error instanceof DashboardApiError
			? error
			: new DashboardApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: dashboardError.message,
			details: dashboardError.details,
		},
		{ status: dashboardError.status }
	);
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		const summary = await getDashboardAiSummaryWithOrds(token);

		return Response.json(
			{
				status: 'success',
				data: summary,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener el resumen IA.');
	}
};
