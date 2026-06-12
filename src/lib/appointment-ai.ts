import { resolveOrdsApiUrl } from './env-urls';
import { formatPersonName } from './format-person-name';
import type {
	AppointmentAiCandidate,
	AppointmentAiDraft,
	AppointmentAiDraftCandidates,
	AppointmentVoiceDraftResult,
} from './appointment-ai-types';

export const VOICE_APPOINTMENT_DRAFT_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_AI_VOICE_APPOINTMENT_DRAFT,
	'ORDS_AI_VOICE_APPOINTMENT_DRAFT',
	'/ai/appointments/voice-draft'
);

export class AppointmentAiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'AppointmentAiError';
		this.status = status;
		this.details = details;
	}
}

const ALLOWED_AUDIO_TYPES = new Set([
	'audio/webm',
	'audio/mp4',
	'audio/mpeg',
	'audio/ogg',
	'audio/wav',
	'audio/x-wav',
]);

const normalizeAudioMimeType = (value: unknown): string => {
	const raw = toText(value).toLowerCase();
	if (!raw) return 'audio/webm';
	return raw.split(';')[0].trim() || 'audio/webm';
};

const isAllowedAudioType = (mimeType: string): boolean => ALLOWED_AUDIO_TYPES.has(mimeType);

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const toText = (value: unknown) => String(value ?? '').trim();

const toOptionalPositiveInt = (value: unknown): number | null => {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return null;
	return parsed;
};

const normalizeCandidate = (value: unknown): AppointmentAiCandidate | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const entityId = toOptionalPositiveInt(source.entity_id);
	if (!entityId) return null;
	const label = toText(source.label) || toText(source.source_text);
	if (!label) return null;
	const score = Number(source.score);
	return {
		entity_id: entityId,
		label,
		score: Number.isFinite(score) ? score : 0,
		distance: Number.isFinite(Number(source.distance)) ? Number(source.distance) : undefined,
		source_text: toText(source.source_text) || undefined,
		entity_type: toText(source.entity_type) || undefined,
	};
};

const normalizeCandidateList = (value: unknown): AppointmentAiCandidate[] | undefined => {
	if (!Array.isArray(value)) return undefined;
	const items = value
		.map((item) => normalizeCandidate(item))
		.filter((item): item is AppointmentAiCandidate => item !== null);
	return items.length > 0 ? items : undefined;
};

const normalizeCandidates = (value: unknown): AppointmentAiDraftCandidates | undefined => {
	if (!value || typeof value !== 'object') return undefined;
	const source = value as Record<string, unknown>;
	const candidates: AppointmentAiDraftCandidates = {
		customer: normalizeCandidateList(source.customer),
		professional: normalizeCandidateList(source.professional),
		location: normalizeCandidateList(source.location),
		service: normalizeCandidateList(source.service),
	};
	const hasAny = Object.values(candidates).some((list) => list && list.length > 0);
	return hasAny ? candidates : undefined;
};

const normalizeDraft = (value: unknown): AppointmentAiDraft => {
	if (!value || typeof value !== 'object') return {};
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
		id_customer: toOptionalPositiveInt(source.id_customer),
		pro_id_professional: toOptionalPositiveInt(source.pro_id_professional),
		loc_id_location: toOptionalPositiveInt(source.loc_id_location),
		ser_id_service: toOptionalPositiveInt(source.ser_id_service),
		start_time: toText(source.start_time) || null,
		end_time: toText(source.end_time) || null,
		confidence:
			source.confidence === 'high' || source.confidence === 'medium' || source.confidence === 'low'
				? source.confidence
				: undefined,
		missing_fields: Array.isArray(source.missing_fields)
			? source.missing_fields.map((item) => toText(item)).filter(Boolean)
			: [],
		interpretation: toText(source.interpretation) || null,
		candidates: normalizeCandidates(source.candidates),
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
		throw new AppointmentAiError('No fue posible interpretar la respuesta de Oracle.', 502);
	}

	if (!response.ok || !data || data.status !== 'success') {
		const cause = toText(data?.cause);
		const plsqlMessage = cause.match(/Error Message:\s*([^\n]+)/i)?.[1];
		throw new AppointmentAiError(
			plsqlMessage || toText(data?.message) || 'No fue posible procesar la cita por voz.',
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

export const processVoiceAppointmentDraft = async (
	token: string,
	audio: File
): Promise<AppointmentVoiceDraftResult> => {
	if (!token) {
		throw new AppointmentAiError('No hay sesión válida para procesar la cita por voz.', 401);
	}

	const mimeType = normalizeAudioMimeType(audio.type);
	if (!isAllowedAudioType(mimeType)) {
		throw new AppointmentAiError('Formato de audio no soportado.', 415);
	}
	if (audio.size <= 0) {
		throw new AppointmentAiError('El audio está vacío.', 400);
	}
	if (audio.size > MAX_AUDIO_BYTES) {
		throw new AppointmentAiError('El audio supera el tamaño máximo permitido.', 413);
	}

	const audioBase64 = await fileToBase64(audio);

	const response = await fetch(VOICE_APPOINTMENT_DRAFT_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			audio_base64: audioBase64,
			mime_type: mimeType,
			filename: audio.name || (mimeType.includes('mp4') ? 'cita.mp4' : 'cita.webm'),
		}),
	});

	const data = await parseJsonResponse(response);
	if (!data || typeof data !== 'object') {
		throw new AppointmentAiError('La respuesta de Oracle no tiene datos válidos.', 502);
	}

	const source = data as Record<string, unknown>;
	const transcript = toText(source.transcript);
	const draft = normalizeDraft(source.draft);

	if (!transcript) {
		throw new AppointmentAiError('No se detectó voz en la grabación.', 422);
	}

	return { transcript, draft };
};
