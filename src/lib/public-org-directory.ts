import { resolveOrdsPublicApiUrl } from './env-urls';
import { PublicBookingApiError } from './public-booking';

const PUBLIC_DIRECTORY_API_BASE = resolveOrdsPublicApiUrl(
	import.meta.env.ORDS_PUBLIC_DIRECTORY_URL,
	'ORDS_PUBLIC_DIRECTORY_URL',
	'directory'
);

export interface OrgDirectorySpecialty {
	code: string;
	label: string;
}

export interface OrgDirectoryCity {
	id: number;
	name: string;
	department_id: number;
}

export interface OrgDirectoryItem {
	slug: string;
	name: string;
	logo_url: string;
	banner_url: string;
	specialty: OrgDirectorySpecialty;
	city_name: string;
	latitude?: number;
	longitude?: number;
}

export interface OrgDirectoryFacets {
	specialties: OrgDirectorySpecialty[];
	cities: OrgDirectoryCity[];
}

export interface OrgDirectoryResult {
	items: OrgDirectoryItem[];
	has_more: boolean;
	facets: OrgDirectoryFacets;
}

export interface OrgDirectorySearchParams {
	q?: string;
	specialty?: string;
	city_id?: number;
	department_id?: number;
}

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeSpecialty = (value: unknown): OrgDirectorySpecialty => {
	if (!value || typeof value !== 'object') {
		return { code: '', label: '' };
	}
	const source = value as Record<string, unknown>;
	return {
		code: String(source.code || '').trim(),
		label: String(source.label || '').trim(),
	};
};

const normalizeCity = (value: unknown): OrgDirectoryCity | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const id = toPositiveInt(source.id, 0);
	const name = String(source.name || '').trim();
	const departmentId = toPositiveInt(source.department_id, 0);
	if (!id || !name) return null;
	return { id, name, department_id: departmentId };
};

const normalizeItem = (value: unknown): OrgDirectoryItem | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const slug = String(source.slug || '').trim();
	const name = String(source.name || '').trim();
	if (!slug || !name) return null;

	const item: OrgDirectoryItem = {
		slug,
		name,
		logo_url: String(source.logo_url || '').trim(),
		banner_url: String(source.banner_url || '').trim(),
		specialty: normalizeSpecialty(source.specialty),
		city_name: String(source.city_name || '').trim(),
	};

	const lat = Number(source.latitude);
	const lng = Number(source.longitude);
	if (Number.isFinite(lat) && Number.isFinite(lng)) {
		item.latitude = lat;
		item.longitude = lng;
	}

	return item;
};

const normalizeFacets = (value: unknown): OrgDirectoryFacets => {
	if (!value || typeof value !== 'object') {
		return { specialties: [], cities: [] };
	}
	const source = value as Record<string, unknown>;
	const specialties = Array.isArray(source.specialties)
		? source.specialties.map(normalizeSpecialty).filter((item) => item.code && item.label)
		: [];
	const cities = Array.isArray(source.cities)
		? source.cities
				.map(normalizeCity)
				.filter((item): item is OrgDirectoryCity => item !== null)
		: [];
	return { specialties, cities };
};

const normalizeDirectoryResult = (value: unknown): OrgDirectoryResult => {
	if (!value || typeof value !== 'object') {
		return { items: [], has_more: false, facets: { specialties: [], cities: [] } };
	}
	const source = value as Record<string, unknown>;
	const items = Array.isArray(source.items)
		? source.items
				.map(normalizeItem)
				.filter((item): item is OrgDirectoryItem => item !== null)
		: [];
	return {
		items,
		has_more:
			source.has_more === true ||
			source.has_more === 1 ||
			source.has_more === '1' ||
			source.has_more === 'true',
		facets: normalizeFacets(source.facets),
	};
};

const parseApiResponse = async (response: Response, fallbackMessage: string) => {
	let payload: Record<string, unknown> | null = null;
	try {
		payload = (await response.json()) as Record<string, unknown>;
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message =
			String(payload?.message || payload?.error || '').trim() || fallbackMessage;
		throw new PublicBookingApiError(message, response.status || 502);
	}

	return payload || {};
};

export const searchOrgDirectory = async (
	params: OrgDirectorySearchParams = {}
): Promise<OrgDirectoryResult> => {
	const searchParams = new URLSearchParams();
	const query = String(params.q || '').trim();
	const specialty = String(params.specialty || '').trim();
	const cityId = toPositiveInt(params.city_id, 0);
	const departmentId = toPositiveInt(params.department_id, 0);

	if (query) searchParams.set('search', query);
	if (specialty) searchParams.set('specialty', specialty);
	if (cityId) searchParams.set('city_id', String(cityId));
	if (departmentId) searchParams.set('department_id', String(departmentId));

	const base = PUBLIC_DIRECTORY_API_BASE.replace(/\/+$/, '');
	const suffix = searchParams.toString();
	const url = suffix ? `${base}?${suffix}` : base;

	const response = await fetch(url, {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});

	const payload = await parseApiResponse(
		response,
		'No fue posible cargar el directorio de negocios.'
	);
	return normalizeDirectoryResult(payload.data);
};
