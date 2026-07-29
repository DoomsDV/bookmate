import type { APIRoute } from 'astro';

import { AgendaScanError, processAgendaImageDraft } from '../../../../lib/appointment-agenda-ai';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const scanError =
		error instanceof AgendaScanError ? error : new AgendaScanError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: scanError.message,
			details: scanError.details,
		},
		{ status: scanError.status }
	);
};

export const POST: APIRoute = async ({ locals, request }) => {
	try {
		const token = String(locals.token || '').trim();
		if (!token) {
			throw new AgendaScanError('No hay sesión válida para escanear la agenda.', 401);
		}

		const formData = await request.formData();
		const imageEntry = formData.get('image');
		if (!(imageEntry instanceof File)) {
			throw new AgendaScanError('Debes enviar una imagen de la agenda.', 400);
		}

		const targetDateEntry = formData.get('target_date');
		const targetDate = typeof targetDateEntry === 'string' ? targetDateEntry : null;

		const result = await processAgendaImageDraft(token, imageEntry, targetDate);

		return Response.json(
			{
				status: 'success',
				data: result,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible leer la agenda.');
	}
};
