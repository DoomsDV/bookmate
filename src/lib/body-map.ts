import { resolveOrdsApiUrl } from './env-urls';
import type {
	BodyMark,
	BodySessionSnapshot,
	BodySilhouette,
	JointAssessment,
} from './clinical-ficha/types';

const BODY_SNAPSHOT_URL_TEMPLATE = resolveOrdsApiUrl(
	import.meta.env.ORDS_CUSTOMER_BODY_SNAPSHOTS_URL,
	'ORDS_CUSTOMER_BODY_SNAPSHOTS_URL',
	'/workspace/customers/:id/body-snapshots'
);

export const getBodySnapshotsUrl = (customerId: number | string) =>
	BODY_SNAPSHOT_URL_TEMPLATE.replace(':id', encodeURIComponent(String(customerId)));

export const getBodySnapshotUrl = (
	customerId: number | string,
	appointmentId: number | string
) =>
	`${getBodySnapshotsUrl(customerId)}/${encodeURIComponent(String(appointmentId))}`;

export class BodyMapApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'BodyMapApiError';
		this.status = status;
		this.details = details;
	}
}

interface BodyMapSuccessResponse {
	status: 'success';
	data?: unknown;
}

interface BodyMapFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
}

const toNumber = (value: unknown, fallback = 0): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMark = (value: unknown): BodyMark | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const id = String(source.id || '').trim();
	if (!id) return null;
	return {
		id,
		kind: String(source.kind || 'PAIN').trim().toUpperCase() as BodyMark['kind'],
		intensity: Math.max(0, Math.min(10, Math.floor(toNumber(source.intensity, 0)))),
		view: String(source.view || 'FRONT').trim().toUpperCase() as BodyMark['view'],
		regionCode: String(source.regionCode || source.region_code || '').trim(),
		nx: toNumber(source.nx, 0),
		ny: toNumber(source.ny, 0),
		side:
			source.side === 'L' || source.side === 'R'
				? source.side
				: null,
		note: String(source.note || '').trim(),
		createdAt: String(source.createdAt || source.created_at || new Date().toISOString()).trim(),
	};
};

const normalizeJoint = (value: unknown): JointAssessment | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const joint = String(source.joint || '').trim().toUpperCase();
	const side = source.side === 'L' || source.side === 'R' ? source.side : null;
	if (!joint || !side) return null;
	const romRaw = (source.rom ?? {}) as Record<string, unknown>;
	const rom: Record<string, number | undefined> = {};
	for (const [key, val] of Object.entries(romRaw)) {
		const num = toNumber(val, NaN);
		if (Number.isFinite(num)) rom[key] = num;
	}
	const testsRaw = Array.isArray(source.tests) ? source.tests : [];
	const tests = testsRaw.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const t = item as Record<string, unknown>;
		const code = String(t.code || '').trim();
		const result = String(t.result || 'NT').trim().toUpperCase();
		if (!code) return [];
		return [{ code, result: result as JointAssessment['tests'][0]['result'] }];
	});
	return {
		joint: joint as JointAssessment['joint'],
		side,
		rom,
		tests,
		eva: Math.max(0, Math.min(10, Math.floor(toNumber(source.eva, 0)))),
	};
};

export const normalizeBodySessionSnapshot = (
	customerId: number,
	appointmentId: number,
	value: unknown
): BodySessionSnapshot | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const snapshotRaw = source.snapshot ?? source;
	const snapshotObj =
		snapshotRaw && typeof snapshotRaw === 'object'
			? (snapshotRaw as Record<string, unknown>)
			: source;

	const marksRaw = Array.isArray(snapshotObj.marks) ? snapshotObj.marks : [];
	const jointsRaw = Array.isArray(snapshotObj.joints) ? snapshotObj.joints : [];
	const silhouette = String(
		snapshotObj.silhouette ?? source.silhouette ?? 'NEUTRAL'
	).trim().toUpperCase() as BodySilhouette;

	return {
		customerId,
		appointmentId,
		capturedAt: String(
			snapshotObj.capturedAt ?? snapshotObj.captured_at ?? source.captured_at ?? new Date().toISOString()
		).trim(),
		silhouette,
		marks: marksRaw.flatMap((item) => {
			const mark = normalizeMark(item);
			return mark ? [mark] : [];
		}),
		joints: jointsRaw.flatMap((item) => {
			const joint = normalizeJoint(item);
			return joint ? [joint] : [];
		}),
		sessionLabel:
			typeof snapshotObj.sessionLabel === 'string'
				? snapshotObj.sessionLabel
				: typeof snapshotObj.session_label === 'string'
					? snapshotObj.session_label
					: undefined,
	};
};

export type BodySnapshotSummary = {
	appointment_id: number;
	mark_count: number;
	captured_at: string;
	silhouette: BodySilhouette;
};

const parseApiResponse = async (response: Response) => {
	const data = (await response.json().catch(() => ({}))) as BodyMapSuccessResponse &
		BodyMapFailureResponse;
	if (!response.ok) {
		throw new BodyMapApiError(
			String(data.message || 'Error al procesar mapa corporal.').trim(),
			response.status,
			data.details ?? data
		);
	}
	return data;
};

export const getBodySnapshotWithOrds = async (
	token: string,
	customerId: number,
	appointmentId: number
): Promise<BodySessionSnapshot | null> => {
	if (!Number.isInteger(customerId) || customerId <= 0) {
		throw new BodyMapApiError('ID de cliente inválido.', 400);
	}
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
		throw new BodyMapApiError('ID de cita inválido.', 400);
	}

	const response = await fetch(getBodySnapshotUrl(customerId, appointmentId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const parsed = await parseApiResponse(response);
	if (parsed.data == null) return null;
	return normalizeBodySessionSnapshot(customerId, appointmentId, parsed.data);
};

export const saveBodySnapshotWithOrds = async (
	token: string,
	customerId: number,
	snapshot: BodySessionSnapshot
): Promise<{ mark_count: number }> => {
	if (!Number.isInteger(customerId) || customerId <= 0) {
		throw new BodyMapApiError('ID de cliente inválido.', 400);
	}
	if (!Number.isInteger(snapshot.appointmentId) || snapshot.appointmentId <= 0) {
		throw new BodyMapApiError('ID de cita inválido.', 400);
	}

	const payload = {
		customerId: snapshot.customerId,
		appointmentId: snapshot.appointmentId,
		capturedAt: snapshot.capturedAt,
		silhouette: snapshot.silhouette,
		marks: snapshot.marks,
		joints: snapshot.joints,
		sessionLabel: snapshot.sessionLabel ?? null,
	};

	const response = await fetch(getBodySnapshotUrl(customerId, snapshot.appointmentId), {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	});

	const parsed = await parseApiResponse(response);
	const data = (parsed.data ?? {}) as Record<string, unknown>;
	return { mark_count: Math.max(0, Math.floor(toNumber(data.mark_count, snapshot.marks.length))) };
};

export const listBodySnapshotSummariesWithOrds = async (
	token: string,
	customerId: number
): Promise<BodySnapshotSummary[]> => {
	if (!Number.isInteger(customerId) || customerId <= 0) {
		throw new BodyMapApiError('ID de cliente inválido.', 400);
	}

	const response = await fetch(getBodySnapshotsUrl(customerId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	const parsed = await parseApiResponse(response);
	const rows = Array.isArray(parsed.data) ? parsed.data : [];
	return rows.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const source = item as Record<string, unknown>;
		const appointmentId = toNumber(source.appointment_id, 0);
		if (!Number.isInteger(appointmentId) || appointmentId <= 0) return [];
		return [
			{
				appointment_id: appointmentId,
				mark_count: Math.max(0, Math.floor(toNumber(source.mark_count, 0))),
				captured_at: String(source.captured_at || '').trim(),
				silhouette: String(source.silhouette || 'NEUTRAL').trim().toUpperCase() as BodySilhouette,
			},
		];
	});
};
