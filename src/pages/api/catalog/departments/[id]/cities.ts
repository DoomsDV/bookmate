import type { APIRoute } from 'astro';

import { CatalogApiError, listCitiesByDepartmentWithOrds } from '../../../../../lib/catalog';

const parseDepartmentId = (value: string | undefined) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

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

export const GET: APIRoute = async ({ params }) => {
	try {
		const departmentId = parseDepartmentId(params.id);
		if (!departmentId) {
			throw new CatalogApiError('ID de departamento invalido.', 400);
		}

		const cities = await listCitiesByDepartmentWithOrds(departmentId);

		return Response.json(
			{
				status: 'success',
				data: cities,
			},
			{ status: 200, headers:{
				'Cache-Control': 'private, no-store',
				'Content-Type': 'application/json'
			}}
		);
	} catch (error) {
		return toErrorResponse(
			error,
			'No fue posible obtener las ciudades del departamento seleccionado.'
		);
	}
};
