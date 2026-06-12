import type { APIRoute } from 'astro';

import { AppointmentAiError, processVoiceAppointmentDraft } from '../../../../lib/appointment-ai';

const toErrorResponse = (error: unknown, fallbackMessage: string) => {
	const appointmentError =
		error instanceof AppointmentAiError
			? error
			: new AppointmentAiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: appointmentError.message,
			details: appointmentError.details,
		},
		{ status: appointmentError.status }
	);
};

export const POST: APIRoute = async ({ locals, request }) => {
	try {
		const token = String(locals.token || '').trim();
		if (!token) {
			throw new AppointmentAiError('No hay sesión válida para procesar la cita por voz.', 401);
		}

		const formData = await request.formData();
		const audioEntry = formData.get('audio');
		if (!(audioEntry instanceof File)) {
			throw new AppointmentAiError('Debes enviar un archivo de audio.', 400);
		}

		const result = await processVoiceAppointmentDraft(token, audioEntry);

		return Response.json(
			{
				status: 'success',
				data: result,
			},
			{ status: 200 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible procesar la cita por voz.');
	}
};
