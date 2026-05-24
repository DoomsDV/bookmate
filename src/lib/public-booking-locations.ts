export type PublicBookingLocationRecord = {
	id_location: number;
	name: string;
	address: string;
	latitude?: number;
	longitude?: number;
};

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeLocationRecord = (value: unknown): PublicBookingLocationRecord | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idLocation = toPositiveInt(source.id_location, 0);
	if (!idLocation) return null;

	const name = String(source.name || '').trim();
	const address = String(source.address || '').trim();
	const latitude = Number(source.latitude);
	const longitude = Number(source.longitude);

	return {
		id_location: idLocation,
		name: name || address || `Sucursal #${idLocation}`,
		address: address || name || '',
		latitude: Number.isFinite(latitude) ? latitude : undefined,
		longitude: Number.isFinite(longitude) ? longitude : undefined,
	};
};

export const normalizePublicBookingLocations = (
	value: unknown
): PublicBookingLocationRecord[] => {
	if (!Array.isArray(value)) return [];

	return value
		.map((item) => normalizeLocationRecord(item))
		.filter((location): location is PublicBookingLocationRecord => location !== null);
};

export const mergePublicBookingLocations = (
	...groups: PublicBookingLocationRecord[][]
): PublicBookingLocationRecord[] => {
	const byId = new Map<number, PublicBookingLocationRecord>();

	for (const group of groups) {
		for (const location of group) {
			const id = toPositiveInt(location.id_location, 0);
			if (!id) continue;
			byId.set(id, location);
		}
	}

	return Array.from(byId.values());
};
