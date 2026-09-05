import type { BodySessionSnapshot } from './clinical-ficha/types';

const snapshotsByCustomer = new Map<number, BodySessionSnapshot[]>();
const loadPromises = new Map<string, Promise<BodySessionSnapshot | null>>();

const cacheKey = (customerId: number, appointmentId: number) =>
	`${customerId}:${appointmentId}`;

export const listBodySnapshots = (customerId: number): BodySessionSnapshot[] => {
	const list = snapshotsByCustomer.get(customerId) ?? [];
	return [...list].sort(
		(a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
	);
};

export const getBodySnapshot = (
	customerId: number,
	appointmentId: number
): BodySessionSnapshot | null =>
	listBodySnapshots(customerId).find((item) => item.appointmentId === appointmentId) ?? null;

export const saveBodySnapshot = (snapshot: BodySessionSnapshot): void => {
	const customerId = snapshot.customerId;
	const existing = snapshotsByCustomer.get(customerId) ?? [];
	const next = existing.filter((item) => item.appointmentId !== snapshot.appointmentId);
	next.push({ ...snapshot, capturedAt: snapshot.capturedAt || new Date().toISOString() });
	snapshotsByCustomer.set(customerId, next);
};

export const getPreviousBodySnapshot = (
	customerId: number,
	appointmentId: number
): BodySessionSnapshot | null => {
	const ordered = listBodySnapshots(customerId);
	const index = ordered.findIndex((item) => item.appointmentId === appointmentId);
	if (index < 0) {
		return null;
	}
	return ordered[index + 1] ?? null;
};

export const getLatestBodySnapshot = (customerId: number): BodySessionSnapshot | null =>
	listBodySnapshots(customerId)[0] ?? null;

export const clearBodySnapshotCache = (customerId?: number): void => {
	if (customerId && customerId > 0) {
		snapshotsByCustomer.delete(customerId);
		for (const key of loadPromises.keys()) {
			if (key.startsWith(`${customerId}:`)) loadPromises.delete(key);
		}
		return;
	}
	snapshotsByCustomer.clear();
	loadPromises.clear();
};

export const fetchBodySnapshot = async (
	customerId: number,
	appointmentId: number
): Promise<BodySessionSnapshot | null> => {
	const key = cacheKey(customerId, appointmentId);
	const cached = getBodySnapshot(customerId, appointmentId);
	if (cached) return cached;

	const pending = loadPromises.get(key);
	if (pending) return pending;

	const promise = (async () => {
		const response = await fetch(
			`/api/customers/${customerId}/body-snapshots/${appointmentId}`,
			{ headers: { Accept: 'application/json' } }
		);
		if (!response.ok) {
			if (response.status === 404) return null;
			const body = await response.json().catch(() => ({}));
			throw new Error(String((body as { message?: string }).message || 'Error al cargar mapa.'));
		}
		const body = (await response.json()) as { data?: BodySessionSnapshot | null };
		const snapshot = body.data ?? null;
		if (snapshot) saveBodySnapshot(snapshot);
		return snapshot;
	})();

	loadPromises.set(key, promise);
	try {
		return await promise;
	} finally {
		loadPromises.delete(key);
	}
};

export const persistBodySnapshot = async (snapshot: BodySessionSnapshot): Promise<void> => {
	const response = await fetch(
		`/api/customers/${snapshot.customerId}/body-snapshots/${snapshot.appointmentId}`,
		{
			method: 'PUT',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(snapshot),
		}
	);
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(String((body as { message?: string }).message || 'No fue posible guardar el mapa.'));
	}
	saveBodySnapshot(snapshot);
};

export const prefetchBodySnapshotsForCustomer = async (customerId: number): Promise<void> => {
	if (customerId <= 0) return;
	const response = await fetch(`/api/customers/${customerId}/body-snapshots`, {
		headers: { Accept: 'application/json' },
	});
	if (!response.ok) return;
	const body = (await response.json()) as {
		data?: Array<{ appointment_id: number; mark_count: number; captured_at: string }>;
	};
	const rows = Array.isArray(body.data) ? body.data : [];
	for (const row of rows) {
		if (!row.appointment_id) continue;
		if (getBodySnapshot(customerId, row.appointment_id)) continue;
		void fetchBodySnapshot(customerId, row.appointment_id);
	}
};

export const fetchLatestBodySnapshot = async (
	customerId: number
): Promise<BodySessionSnapshot | null> => {
	if (customerId <= 0) return null;
	const response = await fetch(`/api/customers/${customerId}/body-snapshots`, {
		headers: { Accept: 'application/json' },
	});
	if (!response.ok) return getLatestBodySnapshot(customerId);
	const body = (await response.json()) as {
		data?: Array<{ appointment_id: number; captured_at: string }>;
	};
	const rows = Array.isArray(body.data) ? body.data : [];
	if (!rows.length) return getLatestBodySnapshot(customerId);
	const sorted = [...rows].sort(
		(a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
	);
	const latestId = sorted[0]?.appointment_id;
	if (!latestId) return null;
	return fetchBodySnapshot(customerId, latestId);
};
