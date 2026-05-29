import { resolveOrdsPublicApiUrl } from './env-urls';

const toPositiveInt = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * ORDS (pendiente de registrar):
 * GET {ORDS_PUBLIC_USER_PROFILE_URL} → PKG_AOX_PUBLIC_BOOKING_API.PR_GET_USER_PUBLIC_PROFILE
 *
 * Path sugerido: /public/user/:public_slug
 * Placeholder en env: public/user/:slug
 */
export const PUBLIC_USER_PROFILE_API_URL = resolveOrdsPublicApiUrl(
	import.meta.env.ORDS_PUBLIC_USER_PROFILE_URL,
	'ORDS_PUBLIC_USER_PROFILE_URL',
	'public/user/:slug'
);

export interface PublicUserProfileService {
	id_service: number;
	name: string;
	duration_minutes: number;
	price: number;
	requires_deposit?: 0 | 1;
	deposit_type?: 'PERCENT' | 'FIXED' | null;
	deposit_value?: number | null;
	deposit_amount?: number | null;
}

export interface PublicUserProfileLocation {
	id_location: number;
	name: string;
	address: string;
	latitude?: number;
	longitude?: number;
	org_id_organization: number;
	organization_name: string;
	organization_slug: string;
	id_professional: number;
	services: PublicUserProfileService[];
}

export interface PublicUserProfile {
	public_slug: string;
	full_name: string;
	image_url: string;
	locations: PublicUserProfileLocation[];
}

export class PublicUserProfileApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 500, details?: unknown) {
		super(message);
		this.name = 'PublicUserProfileApiError';
		this.status = status;
		this.details = details;
	}
}

const resolvePublicUserProfileApiUrl = (publicSlug: string) => {
	const safeSlug = encodeURIComponent(String(publicSlug || '').trim());
	const template = String(PUBLIC_USER_PROFILE_API_URL || '').trim();
	if (!template) {
		throw new PublicUserProfileApiError('ORDS_PUBLIC_USER_PROFILE_URL no configurada.', 500);
	}

	if (template.includes(':slug')) {
		return template.replace(':slug', safeSlug);
	}

	return `${template.replace(/\/+$/, '')}/${safeSlug}`;
};

const normalizeService = (value: unknown): PublicUserProfileService | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const idService = toPositiveInt(source.id_service, 0);
	const name = String(source.name || '').trim();
	if (!idService || !name) return null;

	return {
		id_service: idService,
		name,
		duration_minutes: toPositiveInt(source.duration_minutes, 0),
		price: Number(source.price ?? 0) || 0,
		requires_deposit: Number(source.requires_deposit) === 1 ? 1 : 0,
		deposit_type:
			source.deposit_type === 'PERCENT' || source.deposit_type === 'FIXED'
				? source.deposit_type
				: null,
		deposit_value:
			source.deposit_value === null || source.deposit_value === undefined
				? null
				: Number(source.deposit_value),
		deposit_amount:
			source.deposit_amount === null || source.deposit_amount === undefined
				? null
				: Number(source.deposit_amount),
	};
};

const normalizeLocation = (value: unknown): PublicUserProfileLocation | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;

	const idLocation = toPositiveInt(source.id_location, 0);
	const orgId = toPositiveInt(source.org_id_organization ?? source.org_id, 0);
	const proId = toPositiveInt(source.id_professional ?? source.pro_id_professional, 0);
	const orgName = String(
		source.organization_name ?? source.org_name ?? source.business_name ?? ''
	).trim();
	const orgSlug = String(source.organization_slug ?? source.org_slug ?? '').trim();
	const address = String(source.address || '').trim();
	const name = String(source.name || '').trim();

	if (!idLocation || !orgId || !proId) return null;

	const latitude = Number(source.latitude);
	const longitude = Number(source.longitude);
	const services = Array.isArray(source.services)
		? source.services
				.map(normalizeService)
				.filter((service): service is PublicUserProfileService => service !== null)
		: [];

	return {
		id_location: idLocation,
		name: name || address || `Sucursal #${idLocation}`,
		address: address || name || '',
		latitude: Number.isFinite(latitude) ? latitude : undefined,
		longitude: Number.isFinite(longitude) ? longitude : undefined,
		org_id_organization: orgId,
		organization_name: orgName,
		organization_slug: orgSlug,
		id_professional: proId,
		services,
	};
};

export const normalizePublicUserProfile = (value: unknown): PublicUserProfile | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;

	const publicSlug = String(source.public_slug ?? source.profile_slug ?? '').trim();
	const fullName = String(source.full_name ?? source.fullname ?? '').trim();
	if (!publicSlug || !fullName) return null;

	const locations = Array.isArray(source.locations)
		? source.locations
				.map(normalizeLocation)
				.filter((location): location is PublicUserProfileLocation => location !== null)
		: [];

	return {
		public_slug: publicSlug,
		full_name: fullName,
		image_url: String(source.image_url ?? source.profile_image_url ?? '').trim(),
		locations,
	};
};

const parseApiResponse = async (response: Response, fallbackMessage: string) => {
	let data: { status?: string; message?: string; data?: unknown; details?: unknown } | null = null;
	try {
		data = await response.json();
	} catch {
		throw new PublicUserProfileApiError('No fue posible interpretar la respuesta del servidor.', 502);
	}

	if (!response.ok || !data || data.status !== 'success') {
		const message =
			(typeof data?.message === 'string' && data.message.trim()) || fallbackMessage;
		throw new PublicUserProfileApiError(message, response.status || 500, data?.details);
	}

	return data;
};

export const getPublicUserProfileWithOrds = async (
	publicSlug: string
): Promise<PublicUserProfile> => {
	const safeSlug = String(publicSlug || '').trim();
	if (!safeSlug) {
		throw new PublicUserProfileApiError('Slug de usuario requerido.', 400);
	}

	const response = await fetch(resolvePublicUserProfileApiUrl(safeSlug), {
		method: 'GET',
		headers: { Accept: 'application/json' },
	});

	const data = await parseApiResponse(response, 'No fue posible cargar el perfil público.');
	const profile = normalizePublicUserProfile(data.data);
	if (!profile) {
		throw new PublicUserProfileApiError('No fue posible interpretar el perfil público.', 502);
	}

	return profile;
};

export const buildPublicUserProfileMetaDescription = (params: {
	fullName: string;
	locationCount: number;
}): string => {
	const name = String(params.fullName || '').trim();
	const count = Math.max(0, Number(params.locationCount) || 0);

	if (count > 1) {
		return `Reservá con ${name} en ${count} sucursales. Elegí lugar, servicio y horario online.`;
	}

	return `Reservá tu turno con ${name}. Elegí sucursal, servicio y horario online.`;
};
