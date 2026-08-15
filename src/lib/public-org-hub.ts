import type { BusinessHours } from './business-hours';
import { parseBusinessHours } from './business-hours';
import { resolveOrdsPublicApiUrl } from './env-urls';
import { normalizePublicBookingLocations } from './public-booking-locations';
import { PublicBookingApiError } from './public-booking';

const PUBLIC_ORG_HUB_API_BASE = resolveOrdsPublicApiUrl(
	import.meta.env.ORDS_PUBLIC_ORG_HUB_URL,
	'ORDS_PUBLIC_ORG_HUB_URL',
	'org'
);

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export interface PublicOrgHubLocation {
	id_location: number;
	name: string;
	address: string;
	latitude?: number;
	longitude?: number;
}

export interface PublicOrgHubProfessional {
	id_professional: number;
	full_name: string;
	specialty: string;
	image_url: string;
	profile_slug: string;
	booking_path: string;
	location_ids: number[];
	service_names: string[];
}

export interface PublicOrgHubGalleryImage {
	id: number;
	url: string;
	sort_order: number;
}

export interface PublicOrgHub {
	organization_name: string;
	organization_slug: string;
	logo_url: string;
	banner_url: string;
	facebook_url: string;
	instagram_url: string;
	/** Horario comercial informativo; null si no configurado. */
	business_hours: BusinessHours | null;
	description: string;
	public_whatsapp: string;
	maintenance: boolean;
	gallery_images: PublicOrgHubGalleryImage[];
	locations: PublicOrgHubLocation[];
	professionals: PublicOrgHubProfessional[];
	service_categories: string[];
}

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

const normalizeLocationIds = (value: unknown): number[] => {
	if (!Array.isArray(value)) return [];
	const ids = value
		.map((item) => toPositiveInt(item, 0))
		.filter((id) => id > 0);
	return Array.from(new Set(ids));
};

const normalizeServiceNames = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => String(item || '').trim())
		.filter(Boolean)
		.slice(0, 3);
};

const normalizeProfessional = (
	value: unknown,
	organizationSlug: string
): PublicOrgHubProfessional | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const id = toPositiveInt(source.id_professional, 0);
	const fullName = String(source.full_name || '').trim();
	const profileSlug = String(source.profile_slug || '').trim();
	const bookingPath = String(source.booking_path || '').trim();
	if (!id || !fullName || !profileSlug) return null;

	const fallbackPath =
		organizationSlug && profileSlug
			? `/${encodeURIComponent(organizationSlug)}/p/${encodeURIComponent(profileSlug)}`
			: '';

	return {
		id_professional: id,
		full_name: fullName,
		specialty: String(source.specialty || '').trim() || 'Sin especialidad',
		image_url: String(source.image_url || '').trim(),
		profile_slug: profileSlug,
		booking_path: bookingPath || fallbackPath,
		location_ids: normalizeLocationIds(source.location_ids),
		service_names: normalizeServiceNames(source.service_names),
	};
};

const normalizeOrgHub = (value: unknown): PublicOrgHub | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const organizationSlug = String(source.organization_slug || '').trim();
	const organizationName = String(source.organization_name || '').trim();
	if (!organizationSlug || !organizationName) return null;

	const locations = normalizePublicBookingLocations(
		source.locations
	) as PublicOrgHubLocation[];

	const professionals = Array.isArray(source.professionals)
		? source.professionals
				.map((item) => normalizeProfessional(item, organizationSlug))
				.filter((item): item is PublicOrgHubProfessional => item !== null)
		: [];

	const serviceCategories = Array.isArray(source.service_categories)
		? source.service_categories
				.map((item) => String(item || '').trim())
				.filter(Boolean)
		: [];

	const galleryImages = Array.isArray(source.gallery_images)
		? source.gallery_images
				.flatMap((item) => {
					if (!item || typeof item !== 'object') return [];
					const gal = item as Record<string, unknown>;
					const id = toPositiveInt(gal.id, 0);
					const url = String(gal.url || '').trim();
					if (!id || !url) return [];
					return [
						{
							id,
							url,
							sort_order: toPositiveInt(gal.sort_order, 0),
						} satisfies PublicOrgHubGalleryImage,
					];
				})
				.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
		: [];

	return {
		organization_name: organizationName,
		organization_slug: organizationSlug,
		logo_url: String(source.logo_url || '').trim(),
		banner_url: String(source.banner_url || '').trim(),
		facebook_url: String(source.facebook_url || '').trim(),
		instagram_url: String(source.instagram_url || '').trim(),
		business_hours:
			source.business_hours == null || source.business_hours === ''
				? null
				: parseBusinessHours(source.business_hours),
		description: String(source.description || '').trim(),
		public_whatsapp: String(source.public_whatsapp || '').trim(),
		maintenance:
			source.maintenance === true ||
			source.maintenance === 1 ||
			source.maintenance === '1' ||
			source.maintenance === 'true',
		gallery_images: galleryImages,
		locations,
		professionals,
		service_categories: serviceCategories,
	};
};

export const getPublicOrgHubWithOrds = async (orgSlug: string): Promise<PublicOrgHub> => {
	const safeSlug = String(orgSlug || '').trim();
	if (!safeSlug) {
		throw new PublicBookingApiError('Slug de organización requerido.', 400);
	}

	const base = PUBLIC_ORG_HUB_API_BASE.replace(/\/+$/, '');
	const url = base.endsWith('/org')
		? `${base}/${encodeURIComponent(safeSlug)}`
		: `${base}/org/${encodeURIComponent(safeSlug)}`;

	const response = await fetch(url, {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});

	const data = await parseApiResponse(response, 'No fue posible cargar el perfil del negocio.');
	const hub = normalizeOrgHub(data.data);
	if (!hub) {
		throw new PublicBookingApiError('No fue posible interpretar el perfil del negocio.', 502);
	}

	return hub;
};

export const appendLocIdToBookingPath = (bookingPath: string, locId: number): string => {
	const path = String(bookingPath || '').trim();
	const id = toPositiveInt(locId, 0);
	if (!path || !id) return path;
	const separator = path.includes('?') ? '&' : '?';
	return `${path}${separator}loc_id=${id}`;
};
