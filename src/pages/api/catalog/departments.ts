import type { APIRoute } from 'astro';

import { CatalogApiError, listDepartmentsWithOrds } from '../../../lib/catalog';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const catalogError =
		error instanceof CatalogApiError ? error : new CatalogApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: catalogError.message,
			details: catalogError.details,
		},
		{ status: catalogError.status }
	);
};

export const GET: APIRoute = async () => {
	try {
		const departments = await listDepartmentsWithOrds();

		return Response.json(
			{
				status: 'success',
				data: departments,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los departamentos.');
	}
};
