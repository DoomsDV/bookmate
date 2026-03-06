import type { APIRoute } from 'astro';

import { RolesApiError, listRolesWithOrds } from '../../lib/roles';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const rolesError = error instanceof RolesApiError ? error : new RolesApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: rolesError.message,
			details: rolesError.details,
		},
		{ status: rolesError.status }
	);
};

export const GET: APIRoute = async () => {
	try {
		const roles = await listRolesWithOrds();

		return Response.json(
			{
				status: 'success',
				data: roles,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible obtener los roles.');
	}
};
