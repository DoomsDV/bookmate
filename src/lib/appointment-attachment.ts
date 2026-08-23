/** Tope de producto; debe coincidir con ATTACHMENT_MAX_BYTES en PL/SQL. */
export const APPOINTMENT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Vercel serverless rechaza el body ~4.5 MB (413) antes de que corra el BFF.
 * El JSON con base64 pesa ~4/3 del archivo. Por debajo de este tope vamos por BFF.
 */
export const APPOINTMENT_ATTACHMENT_BFF_SAFE_JSON_BYTES = Math.floor(3.8 * 1024 * 1024);

export const estimateAttachmentJsonBytes = (payload: {
	file_base64: string;
	filename: string;
	mime_type: string;
}) =>
	payload.file_base64.length +
	payload.filename.length +
	payload.mime_type.length +
	80;
