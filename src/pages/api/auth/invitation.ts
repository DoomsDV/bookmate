import type { APIRoute } from 'astro';

import { AuthApiError, getInvitationWithOrds } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
	const token = new URL(request.url).searchParams.get('token')?.trim() || '';

	if (!token) {
		return Response.json(
			{ status: 'error', message: 'El token de invitación es obligatorio.' },
			{ status: 400 }
		);
	}

	try {
		const preview = await getInvitationWithOrds(token);
		return Response.json({ status: 'success', ...preview });
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible cargar la invitación.', 500);

		return Response.json(
			{
				status: 'error',
				message: authError.message,
			},
			{ status: authError.status }
		);
	}
};
