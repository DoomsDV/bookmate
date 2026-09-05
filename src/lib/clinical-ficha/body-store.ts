import type { BodySessionSnapshot } from './types';

const snapshotsByCustomer = new Map<number, BodySessionSnapshot[]>();

export const listBodySnapshots = (customerId: number): BodySessionSnapshot[] => {
	const list = snapshotsByCustomer.get(customerId) ?? [];
	return [...list].sort(
		(a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
	);
};

export const getBodySnapshot = (
	customerId: number,
	appointmentId: number
): BodySessionSnapshot | null => {
	return (
		listBodySnapshots(customerId).find((item) => item.appointmentId === appointmentId) ?? null
	);
};

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
		return ordered[0] ?? null;
	}
	return ordered[index + 1] ?? null;
};
