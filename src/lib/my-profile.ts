import { resolveOrdsApiUrl } from './env-urls';

export const MY_PROFILE_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_PROFILE_ME_URL,
	'ORDS_PROFILE_ME_URL',
	'/profile/me'
);

export const MY_PROFILE_PUBLIC_SLUG_SUGGEST_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_PROFILE_PUBLIC_SLUG_SUGGEST_URL,
	'ORDS_PROFILE_PUBLIC_SLUG_SUGGEST_URL',
	'/profile/me/public-slug/suggest'
);

export interface MyPublicProfile {
	public_slug: string;
	image_url: string;
}

export interface MyProfileProfessional {
	id_professional: number;
	phone_number: string;
	specialty: string;
}

export interface MyProfileData {
	id_user: number;
	first_name: string;
	last_name: string;
	email: string;
	role_id: number;
	org_id: number;
	public_profile?: MyPublicProfile;
	professional_profile?: MyProfileProfessional;
}

export interface UpdateMyProfilePayload {
	first_name?: string;
	last_name?: string;
	phone_number?: string;
	public_slug?: string;
	image_base64?: string;
	image_name?: string;
	image_mime?: string;
}

export interface MyProfileFieldError {
	field: string;
	message: string;
}

interface MyProfileSuccessResponse {
	status: 'success';
	data?: unknown;
	message?: string;
	slug?: string;
}

interface MyProfileFailureResponse {
	status?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
}

export class MyProfileApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: MyProfileFieldError[];

	constructor(
		message: string,
		status = 400,
		details?: unknown,
		fieldErrors: MyProfileFieldError[] = []
	) {
		super(message);
		this.name = 'MyProfileApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const parseFieldErrors = (value: unknown): MyProfileFieldError[] => {
	if (!Array.isArray(value)) return [];

	return value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const source = item as Record<string, unknown>;
		const field = String(source.field || '').trim();
		const message = String(source.message || '').trim();
		if (!field || !message) return [];
		return [{ field, message }];
	});
};

const normalizePublicProfile = (value: unknown): MyPublicProfile | undefined => {
	if (!value || typeof value !== 'object') return undefined;
	const source = value as Record<string, unknown>;

	return {
		public_slug: String(source.public_slug || '').trim(),
		image_url: String(source.image_url || '').trim(),
	};
};

const normalizeProfessionalProfile = (value: unknown): MyProfileProfessional | undefined => {
	if (!value || typeof value !== 'object') return undefined;
	const source = value as Record<string, unknown>;
	const idProfessional = toNumber(source.id_professional, 0);
	if (!idProfessional) return undefined;

	return {
		id_professional: idProfessional,
		phone_number: String(source.phone_number || '').trim(),
		specialty: String(source.specialty || '').trim(),
	};
};

const normalizeMyProfile = (value: unknown): MyProfileData | null => {
	if (!value || typeof value !== 'object') return null;
	const source = value as Record<string, unknown>;
	const idUser = toNumber(source.id_user, 0);
	if (!idUser) return null;

	return {
		id_user: idUser,
		first_name: String(source.first_name || '').trim(),
		last_name: String(source.last_name || '').trim(),
		email: String(source.email || '').trim(),
		role_id: toNumber(source.role_id, 0),
		org_id: toNumber(source.org_id, 0),
		public_profile: normalizePublicProfile(source.public_profile),
		professional_profile: normalizeProfessionalProfile(source.professional_profile),
	};
};

const parseProfileResponse = async (response: Response) => {
	let data: MyProfileSuccessResponse | MyProfileFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new MyProfileApiError('No fue posible interpretar la respuesta del perfil.', 502);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		const failureData = (data ?? {}) as MyProfileFailureResponse;
		throw new MyProfileApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible obtener el perfil.',
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const normalized = normalizeMyProfile(data.data);
	if (!normalized) {
		throw new MyProfileApiError('No fue posible interpretar el perfil del usuario.', 502);
	}

	return normalized;
};

const parseProfileActionResponse = async (response: Response) => {
	let data: MyProfileSuccessResponse | MyProfileFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new MyProfileApiError('No fue posible interpretar la respuesta del perfil.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as MyProfileFailureResponse;
		throw new MyProfileApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible actualizar el perfil.',
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	return {
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Perfil actualizado correctamente.',
	};
};

const parseSlugSuggestResponse = async (response: Response) => {
	let data: MyProfileSuccessResponse | MyProfileFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new MyProfileApiError('No fue posible interpretar la sugerencia de enlace.', 502);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as MyProfileFailureResponse;
		throw new MyProfileApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible sugerir el enlace personal.',
			response.status || 400,
			failureData.details,
			parseFieldErrors(failureData.errors)
		);
	}

	const slug = typeof data.slug === 'string' ? data.slug.trim() : '';
	if (!slug) {
		throw new MyProfileApiError('No fue posible interpretar la sugerencia de enlace.', 502);
	}

	return { slug };
};

export const getMyProfileWithOrds = async (token: string) => {
	if (!token) throw new MyProfileApiError('Token de acceso requerido.', 401);

	const response = await fetch(MY_PROFILE_URL, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseProfileResponse(response);
};

export const updateMyProfileWithOrds = async (token: string, payload: UpdateMyProfilePayload) => {
	if (!token) throw new MyProfileApiError('Token de acceso requerido.', 401);

	const response = await fetch(MY_PROFILE_URL, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseProfileActionResponse(response);
};

export const suggestPublicSlugWithOrds = async (token: string, fullName: string) => {
	if (!token) throw new MyProfileApiError('Token de acceso requerido.', 401);

	const safeName = String(fullName || '').trim();
	if (!safeName) {
		throw new MyProfileApiError('Debe proporcionar un nombre para generar el enlace.', 400);
	}

	const url = new URL(MY_PROFILE_PUBLIC_SLUG_SUGGEST_URL);
	url.searchParams.set('name', safeName);

	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseSlugSuggestResponse(response);
};
