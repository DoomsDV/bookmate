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
		address,
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

export const getLocationBranchTitle = (location: {
	name?: string | null;
	address?: string | null;
	id_location?: number;
}) => {
	const name = String(location.name || '').trim();
	const address = String(location.address || '').trim();
	if (name) return name;
	if (address) return address;
	const id = Number(location.id_location || 0);
	return id > 0 ? `Sucursal #${id}` : 'Sucursal';
};

/** Dirección bajo el nombre (vacío si no hay o es igual al nombre). */
export const getLocationAddressLine = (location: {
	name?: string | null;
	address?: string | null;
}) => {
	const name = String(location.name || '').trim();
	const address = String(location.address || '').trim();
	if (!address) return '';
	if (name && address.toLowerCase() === name.toLowerCase()) return '';
	return address;
};

export const buildGoogleMapsUrl = (location: {
	name?: string | null;
	address?: string | null;
	latitude?: number | null;
	longitude?: number | null;
}) => {
	const lat = Number(location.latitude);
	const lng = Number(location.longitude);
	if (Number.isFinite(lat) && Number.isFinite(lng)) {
		return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
	}
	const query = String(location.address || location.name || '').trim();
	if (!query) return null;
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

export const openGoogleMapsForLocation = (location: {
	name?: string | null;
	address?: string | null;
	latitude?: number | null;
	longitude?: number | null;
}) => {
	const url = buildGoogleMapsUrl(location);
	if (!url || typeof window === 'undefined') return false;
	window.open(url, '_blank', 'noopener,noreferrer');
	return true;
};

export const appendLocationSlotHeader = (
	parent: HTMLElement,
	location: {
		name?: string | null;
		address?: string | null;
		latitude?: number | null;
		longitude?: number | null;
		id_location?: number;
	},
	options?: {
		titleClassName?: string;
		onAddressClick?: (location: {
			name?: string | null;
			address?: string | null;
			latitude?: number | null;
			longitude?: number | null;
			id_location?: number;
		}) => void;
	}
) => {
	const header = document.createElement('div');
	header.className = 'public-slot-location';

	const title = document.createElement('h3');
	title.className =
		options?.titleClassName ||
		'text-sm font-semibold uppercase tracking-wide text-[var(--primary)]';
	title.textContent = getLocationBranchTitle(location);
	header.appendChild(title);

	const addressLine = getLocationAddressLine(location);
	if (addressLine) {
		const canOpen = typeof options?.onAddressClick === 'function';
		const row = canOpen
			? document.createElement('button')
			: document.createElement('p');

		if (canOpen) {
			const button = row as HTMLButtonElement;
			button.type = 'button';
			button.className = 'public-location-address';
			button.setAttribute('aria-label', `Ver mapa de ${addressLine}`);
			button.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				options?.onAddressClick?.(location);
			});
		} else {
			row.className = 'public-location-address public-location-address--static';
		}

		const icon = document.createElement('span');
		icon.className = 'material-symbols-rounded';
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = 'location_on';

		const text = document.createElement('span');
		text.textContent = addressLine;

		row.append(icon, text);
		header.appendChild(row);
	}

	parent.appendChild(header);
	return header;
};
