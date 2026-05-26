import type { APIRoute } from 'astro';

import { AuthApiError, acceptInvitationWithOrds } from '../../../lib/auth';

const parseBody = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		const body = await request.json();
		return {
			token: String(body?.token || '').trim(),
			password: String(body?.password || ''),
			first_name: String(body?.first_name || '').trim(),
			last_name: String(body?.last_name || '').trim(),
		};
	}

	const formData = await request.formData();
	return {
		token: String(formData.get('token') || '').trim(),
		password: String(formData.get('password') || ''),
		first_name: String(formData.get('first_name') || '').trim(),
		last_name: String(formData.get('last_name') || '').trim(),
	};
};

export const POST: APIRoute = async ({ request, cookies }) => {
	try {
		const body = await parseBody(request);
		if (!body.token) {
			throw new AuthApiError('El token de invitación es obligatorio.', 400);
		}

		const accessToken = cookies.get('access_token')?.value;
		const payload = {
			token: body.token,
			...(body.password ? { password: body.password } : {}),
			...(body.first_name ? { first_name: body.first_name } : {}),
			...(body.last_name ? { last_name: body.last_name } : {}),
		};

		await acceptInvitationWithOrds(
			accessToken ? `Bearer ${accessToken}` : undefined,
			payload
		);

		return Response.json({
			success: true,
			redirect: '/auth/login?invitationAccepted=1',
		});
	} catch (error) {
		const authError =
			error instanceof AuthApiError
				? error
				: new AuthApiError('No fue posible aceptar la invitación.', 500);

		return Response.json(
			{
				error: authError.message,
				message: authError.message,
				login_required: authError.loginRequired,
			},
			{ status: authError.status }
		);
	}
};
