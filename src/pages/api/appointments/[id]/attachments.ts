import type { APIRoute } from 'astro';

import { APPOINTMENT_ATTACHMENT_MAX_BYTES } from '../../../../lib/appointment-attachment';
import {
	AppointmentsApiError,
	uploadAppointmentAttachmentWithOrds,
} from '../../../../lib/appointments';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
	toPositiveInt,
} from '../../../../utils/api-helpers';

const createAppointmentsError = (message: string, status = 400) =>
	new AppointmentsApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createAppointmentsError, 'No hay sesion valida para procesar citas.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is AppointmentsApiError => value instanceof AppointmentsApiError,
		createError: createAppointmentsError,
	});

// Hardening (auditoría ORDS R2/R4): debe coincidir con ATTACHMENT_MAX_BYTES en PL/SQL
// (PKG_AOX_APPOINTMENT_API.pr_upload_attachment). Vercel corta ~4.5 MB (413) antes
// de llegar acá; el cliente comprime fotos y, si el JSON sigue grande, sube a ORDS.
const MAX_ATTACHMENT_BYTES = APPOINTMENT_ATTACHMENT_MAX_BYTES;
const MAX_ATTACHMENT_CONTENT_LENGTH = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4096;

const assertContentLengthWithinLimit = (request: Request) => {
	const contentLength = Number(request.headers.get('content-length') || 0);
	if (contentLength > 0 && contentLength > MAX_ATTACHMENT_CONTENT_LENGTH) {
		throw new AppointmentsApiError(
			`El archivo adjunto supera el tamaño máximo permitido (${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).`,
			413
		);
	}
};

export const POST: APIRoute = async ({ request, params, locals }) => {
	try {
		const token = requireToken(locals.token);
		assertContentLengthWithinLimit(request);
		const appointmentId = toPositiveInt(params.id, 0);
		if (!appointmentId) {
			throw new AppointmentsApiError('ID de cita invalido.', 400);
		}

		let body: unknown = null;
		try {
			body = await request.json();
		} catch {
			throw new AppointmentsApiError('No se pudo interpretar el archivo enviado.', 400);
		}

		const source = (body ?? {}) as Record<string, unknown>;
		const fileBase64 = String(source.file_base64 ?? '').trim();
		const filename = String(source.filename ?? '').trim();
		const mimeType = String(source.mime_type ?? '').trim();

		if (!fileBase64) {
			throw new AppointmentsApiError('Debes seleccionar un archivo.', 400);
		}

		const result = await uploadAppointmentAttachmentWithOrds(token, appointmentId, {
			file_base64: fileBase64,
			filename: filename || 'archivo',
			mime_type: mimeType || 'application/octet-stream',
		});

		return Response.json(
			{
				status: 'success',
				message: result.message,
				data: result.attachment,
			},
			{ status: 201 }
		);
	} catch (error) {
		return toErrorResponse(error, 'No fue posible subir el archivo adjunto.');
	}
};
