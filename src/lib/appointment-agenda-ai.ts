import { resolveOrdsAiUrl } from './env-urls';
import { formatPersonName } from './format-person-name';
import type {
	AgendaScanResult,
	AgendaScanRow,
	AgendaScanRowConfidence,
} from './appointment-ai-types';

export const AGENDA_IMAGE_DRAFT_URL = resolveOrdsAiUrl(
	import.meta.env.ORDS_AI_AGENDA_IMAGE_DRAFT,
	'ORDS_AI_AGENDA_IMAGE_DRAFT',
	'/appointments/image-draft'
);

export class AgendaScanError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'AgendaScanError';
		this.status = status;
		this.details = details;
	}
}

const ALLOWED_IMAGE_TYPES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
]);

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const toText = (value: unknown) => String(value ?? '').trim();

const normalizeImageMimeType = (value: unknown): string => {
	const raw = toText(value).toLowerCase();
	if (!raw) return 'image/jpeg';
	const base = raw.split(';')[0].trim();
	return base === 'image/jpg' ? 'image/jpeg' : base || 'image/jpeg';
};

const isAllowedImageType = (mimeType: string): boolean => ALLOWED_IMAGE_TYPES.has(mimeType);

const toOptionalPositiveInt = (value: unknown): number | null => {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return null;
	return parsed;
};

const toConfidence = (value: unknown): AgendaScanRowConfidence | undefined =>
	value === 'high' || value === 'medium' || value === 'low' ? value : undefined;

const normalizeRow = (value: unknown): AgendaScanRow | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const customerId = toOptionalPositiveInt(source.id_customer);
	const rawCustomerName = toText(source.customer_name);

	return {
		customer_name: rawCustomerName
			? customerId
				? rawCustomerName
				: formatPersonName(rawCustomerName)
			: null,
		customer_phone: toText(source.customer_phone) || null,
		id_customer: customerId,
		pro_id_professional: toOptionalPositiveInt(source.pro_id_professional),
		loc_id_location: toOptionalPositiveInt(source.loc_id_location),
		ser_id_service: toOptionalPositiveInt(source.ser_id_service),
		start_time: toText(source.start_time) || null,
		end_time: toText(source.end_time) || null,
		confidence: toConfidence(source.confidence),
		missing_fields: Array.isArray(source.missing_fields)
			? source.missing_fields.map((item) => toText(item)).filter(Boolean)
			: [],
		interpretation: toText(source.interpretation) || null,
		row_confidence: toConfidence(source.row_confidence) ?? toConfidence(source.confidence),
		raw_text: toText(source.raw_text) || null,
	};
};

const parseJsonResponse = async (response: Response) => {
	let data: {
		status?: string;
		message?: string;
		cause?: string;
		data?: unknown;
		details?: unknown;
	} | null = null;
	try {
		data = await response.json();
	} catch {
		throw new AgendaScanError('No fue posible interpretar la respuesta de Oracle.', 502);
	}

	if (!response.ok || !data || data.status !== 'success') {
		const cause = toText(data?.cause);
		const plsqlMessage = cause.match(/Error Message:\s*([^\n]+)/i)?.[1];
		throw new AgendaScanError(
			plsqlMessage || toText(data?.message) || 'No fue posible leer la agenda.',
			response.status || 400,
			data?.details ?? (cause || undefined)
		);
	}

	return data.data;
};

const fileToBase64 = async (file: File): Promise<string> => {
	const buffer = Buffer.from(await file.arrayBuffer());
	return buffer.toString('base64');
};

export const processAgendaImageDraft = async (
	token: string,
	image: File,
	targetDate?: string | null
): Promise<AgendaScanResult> => {
	if (!token) {
		throw new AgendaScanError('No hay sesión válida para escanear la agenda.', 401);
	}

	const mimeType = normalizeImageMimeType(image.type);
	if (!isAllowedImageType(mimeType)) {
		throw new AgendaScanError('Formato de imagen no soportado. Usá JPG, PNG o WEBP.', 415);
	}
	if (image.size <= 0) {
		throw new AgendaScanError('La imagen está vacía.', 400);
	}
	if (image.size > MAX_IMAGE_BYTES) {
		throw new AgendaScanError('La imagen supera el tamaño máximo permitido.', 413);
	}

	const imageBase64 = await fileToBase64(image);
	const normalizedTargetDate = toText(targetDate);

	const response = await fetch(AGENDA_IMAGE_DRAFT_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			image_base64: imageBase64,
			mime_type: mimeType,
			...(normalizedTargetDate ? { target_date: normalizedTargetDate } : {}),
		}),
	});

	const data = await parseJsonResponse(response);
	if (!data || typeof data !== 'object') {
		throw new AgendaScanError('La respuesta de Oracle no tiene datos válidos.', 502);
	}

	const source = data as Record<string, unknown>;
	const rawRows = Array.isArray(source.appointments) ? source.appointments : [];
	const appointments = rawRows
		.map((row) => normalizeRow(row))
		.filter((row): row is AgendaScanRow => row !== null);

	return { appointments };
};
