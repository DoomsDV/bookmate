import { ordsFailureDetails } from './api-error-codes';
import { resolveOrdsApiUrl } from './env-urls';
import { ROLES } from '../config/roles';

export const PROFESSIONALS_URL = resolveOrdsApiUrl(
	import.meta.env.ORDS_PROFESSIONALS_URL,
	'ORDS_PROFESSIONALS_URL',
	'/professionals'
);
export const PROFESSIONALS_SLUG_SUGGEST_URL =
	resolveOrdsApiUrl(
		import.meta.env.ORDS_PROFESSIONALS_SLUG_SUGGEST_URL,
		'ORDS_PROFESSIONALS_SLUG_SUGGEST_URL',
		'/professionals/slug/suggest'
	);

export interface ProfessionalUser {
	id_user: number;
	apex_user_name: string;
	first_name: string;
	last_name: string;
	email: string;
	rol_id_role: number;
	is_active: 0 | 1;
}

export interface ProfessionalSpecialty {
	id_specialty: number;
	name: string;
}

export interface Professional {
	id_professional: number;
	display_name: string;
	profile_slug: string;
	profile_image_url: string;
	phone_number: string;
	is_active: 0 | 1;
	created_at: string;
	membership_status?: 'active' | 'pending_invite';
	invitation_status?: string;
	user: ProfessionalUser;
	specialty: ProfessionalSpecialty | null;
	services: number[];
}

/** Misma regla que el modal: inactivo solo cuando panel y visibilidad pública están apagados. */
export const isProfessionalAccountActive = (professional: Professional): boolean => {
	if (professional.membership_status === 'pending_invite') return false;

	const userActive = professional.user.is_active === 1 ? 1 : 0;
	const profActive = professional.is_active === 1 ? 1 : 0;
	return userActive === 1 || profActive === 1;
};

export interface ProfessionalsListMeta {
	current_page: number;
	per_page: number;
	total_records: number;
	total_pages: number;
}

export interface ProfessionalsListResult {
	data: Professional[];
	meta: ProfessionalsListMeta;
}

export interface ProfessionalFieldError {
	field: string;
	message: string;
}

export const PROFESSIONAL_SELF_ADMIN_ROLE_MESSAGE =
	'No puedes modificar tu propio rol de administrador.';

export const PROFESSIONAL_SELF_ADMIN_DELETE_MESSAGE =
	'No puedes eliminar tu propia cuenta de administrador.';

export const PROFESSIONAL_SELF_ADMIN_STATUS_MESSAGE =
	'No puedes modificar tu propio estado como administrador.';

export const isAdminRoleId = (roleId: number) => roleId === ROLES.ADMIN;

const isSelfAdminContext = (params: {
	targetUserId: number;
	callerUserId: number;
	currentRoleId: number;
}) =>
	params.targetUserId > 0 &&
	params.callerUserId > 0 &&
	params.targetUserId === params.callerUserId &&
	isAdminRoleId(params.currentRoleId);

export const getProfessionalDisplayName = (professional: Professional): string => {
	const displayName = String(professional.display_name || '').trim();
	if (displayName) return displayName;
	const email = String(professional.user?.email || '').trim();
	if (email) return email;
	return `Personal #${professional.id_professional}`;
};

export interface CreateProfessionalWithUserPayload {
	rol_id_role: number;
	apex_user_name?: string;
	display_name: string;
	email?: string;
	password?: string;
	user_is_active?: 0 | 1;
	phone_number: string;
	spe_id_specialty?: number;
	profile_slug?: string;
	prof_is_active?: 0 | 1;
	/** JPEG recortado en cliente (p. ej. 512×512) codificado en base64 sin prefijo data URL. */
	image_base64?: string;
	image_name?: string;
	image_mime?: string;
	services?: number[];
}

export interface UpdateProfessionalWithUserPayload {
	rol_id_role: number;
	/** Solo invitación pendiente; ignorado en backend para miembros activos. */
	apex_user_name?: string;
	display_name: string;
	/** Solo invitación pendiente; ignorado en backend para miembros activos. */
	email?: string;
	/** No permitido: el backend rechaza cambios de contraseña por admin. */
	password?: string;
	user_is_active?: 0 | 1;
	phone_number: string;
	spe_id_specialty?: number;
	profile_slug?: string;
	prof_is_active?: 0 | 1;
	/** JPEG recortado en cliente (p. ej. 512×512) codificado en base64 sin prefijo data URL. */
	image_base64?: string;
	image_name?: string;
	image_mime?: string;
	services?: number[];
}

export {
	PROFILE_IMAGE_ACCEPT_MIME,
	PROFILE_IMAGE_OUTPUT_SIZE,
	PROFILE_IMAGE_RECOMMENDED_MAX_BYTES,
	isAcceptedProfileImage,
} from './profile-image-crop';

interface CreateProfessionalSuccessResponse {
	status: 'success';
	message?: string;
	id_user?: number;
	id_professional: number;
	invitation_sent?: number | boolean;
	email_sent?: number;
}

interface ProfessionalsSuccessResponse {
	status: 'success';
	data: unknown[];
	meta?: unknown;
}

interface ProfessionalSuccessResponse {
	status: 'success';
	data: unknown;
}

interface ProfessionalActionSuccessResponse {
	status: 'success';
	message?: string;
}

interface ProfessionalsFailureResponse {
	status?: string;
	code?: string;
	message?: string;
	details?: unknown;
	errors?: unknown;
	can_reactivate?: number | boolean;
	reactivate_professional_id?: number;
	deactivate?: number | boolean;
}

interface SlugSuggestSuccessResponse {
	status: 'success';
	slug: string;
}

export class ProfessionalsApiError extends Error {
	status: number;
	details?: unknown;
	fieldErrors: ProfessionalFieldError[];

	constructor(
		message: string,
		status = 400,
		details?: unknown,
		fieldErrors: ProfessionalFieldError[] = []
	) {
		super(message);
		this.name = 'ProfessionalsApiError';
		this.status = status;
		this.details = details;
		this.fieldErrors = fieldErrors;
	}
}

export const assertProfessionalSelfAdminRoleChange = (params: {
	targetUserId: number;
	callerUserId: number;
	currentRoleId: number;
	nextRoleId: number;
}) => {
	const effectiveNextRoleId =
		params.nextRoleId > 0 ? params.nextRoleId : params.currentRoleId;

	if (
		isSelfAdminContext(params) &&
		effectiveNextRoleId !== params.currentRoleId
	) {
		throw new ProfessionalsApiError(
			PROFESSIONAL_SELF_ADMIN_ROLE_MESSAGE,
			409,
			undefined,
			[{ field: 'rol_id_role', message: PROFESSIONAL_SELF_ADMIN_ROLE_MESSAGE }]
		);
	}
};

export const assertProfessionalSelfAdminUpdate = (params: {
	targetUserId: number;
	callerUserId: number;
	currentRoleId: number;
	nextRoleId: number;
	currentUserIsActive: 0 | 1;
	nextUserIsActive?: 0 | 1;
	currentProfIsActive: 0 | 1;
	nextProfIsActive?: 0 | 1;
}) => {
	if (!isSelfAdminContext(params)) return;

	assertProfessionalSelfAdminRoleChange(params);

	if (
		params.nextUserIsActive !== undefined &&
		params.nextUserIsActive !== params.currentUserIsActive
	) {
		throw new ProfessionalsApiError(
			PROFESSIONAL_SELF_ADMIN_STATUS_MESSAGE,
			409,
			undefined,
			[{ field: 'user_is_active', message: PROFESSIONAL_SELF_ADMIN_STATUS_MESSAGE }]
		);
	}

	if (
		params.nextProfIsActive !== undefined &&
		params.nextProfIsActive !== params.currentProfIsActive
	) {
		throw new ProfessionalsApiError(
			PROFESSIONAL_SELF_ADMIN_STATUS_MESSAGE,
			409,
			undefined,
			[{ field: 'prof_is_active', message: PROFESSIONAL_SELF_ADMIN_STATUS_MESSAGE }]
		);
	}
};

export const assertProfessionalSelfAdminDelete = (params: {
	targetUserId: number;
	callerUserId: number;
	currentRoleId: number;
}) => {
	if (isSelfAdminContext(params)) {
		throw new ProfessionalsApiError(PROFESSIONAL_SELF_ADMIN_DELETE_MESSAGE, 409);
	}
};

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const parseSingleFieldError = (value: unknown): ProfessionalFieldError | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const field = String(source.field || '').trim();
	const message = String(source.message || '').trim();
	if (!field || !message) return null;

	return { field, message };
};

const parseFieldErrors = (value: unknown): ProfessionalFieldError[] => {
	if (Array.isArray(value)) {
		return value
			.map(parseSingleFieldError)
			.filter((fieldError): fieldError is ProfessionalFieldError => fieldError !== null);
	}

	if (value && typeof value === 'object') {
		const single = parseSingleFieldError(value);
		return single ? [single] : [];
	}

	if (typeof value === 'string' && value.trim()) {
		try {
			return parseFieldErrors(JSON.parse(value));
		} catch {
			return [];
		}
	}

	return [];
};

const fallbackMessageByStatus = (
	status: number,
	action: 'list' | 'get' | 'create' | 'update' | 'delete'
) => {
	switch (status) {
		case 400:
		case 422:
			return 'Errores de validacion en los campos enviados.';
		case 401:
			return 'Sesion no autorizada. Inicia sesion nuevamente.';
		case 403:
			return 'No tienes permisos para realizar esta acción.';
		case 404:
			return action === 'get'
				? 'Personal no encontrado.'
				: 'No se encontro el recurso solicitado.';
		case 409:
			if (action === 'create') return 'Existe un conflicto y no se pudo crear el personal.';
			if (action === 'delete')
				return 'No se puede eliminar el personal porque esta siendo utilizado en otros registros.';
			return 'Existe un conflicto al procesar la solicitud.';
		case 500:
			return 'Error interno del servidor. Intenta nuevamente.';
		default:
			if (action === 'create') return 'No fue posible crear el personal.';
			if (action === 'update') return 'No fue posible actualizar el personal.';
			if (action === 'delete') return 'No fue posible eliminar el personal.';
			if (action === 'get') return 'No fue posible obtener el personal.';
			return 'No fue posible obtener el listado de personal.';
	}
};

const normalizeProfessionalUser = (value: unknown): ProfessionalUser => {
	if (!value || typeof value !== 'object') {
		return {
			id_user: 0,
			apex_user_name: '',
			first_name: '',
			last_name: '',
			email: '',
			rol_id_role: 0,
			is_active: 0,
		};
	}

	const source = value as Record<string, unknown>;
	return {
		id_user: toNumber(source.id_user),
		apex_user_name: String(source.apex_user_name || '').trim(),
		first_name: String(source.first_name || '').trim(),
		last_name: String(source.last_name || '').trim(),
		email: String(source.email || '').trim(),
		rol_id_role: toNumber(source.rol_id_role),
		is_active:
			source.is_active === 1 || source.is_active === '1' || source.is_active === true ? 1 : 0,
	};
};

const normalizeProfessionalSpecialty = (value: unknown): ProfessionalSpecialty | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idSpecialty = toNumber(source.id_specialty, NaN);
	if (!Number.isFinite(idSpecialty)) return null;

	return {
		id_specialty: idSpecialty,
		name: String(source.name || '').trim(),
	};
};

const normalizeProfessionalServices = (value: unknown): number[] => {
	if (!Array.isArray(value)) return [];

	return value
		.map((item) => Number(item))
		.filter((serviceId) => Number.isInteger(serviceId) && serviceId > 0);
};

const normalizeProfessional = (value: unknown): Professional | null => {
	if (!value || typeof value !== 'object') return null;

	const source = value as Record<string, unknown>;
	const idProfessional = toNumber(source.id_professional, NaN);
	if (!Number.isFinite(idProfessional)) return null;

	const membershipStatus = String(source.membership_status || '').trim();
	return {
		id_professional: idProfessional,
		display_name: String(source.display_name || '').trim(),
		profile_slug: String(source.profile_slug || '').trim(),
		profile_image_url: String(source.profile_image_url || '').trim(),
		phone_number: String(source.phone_number || '').trim(),
		is_active:
			source.is_active === 1 || source.is_active === '1' || source.is_active === true ? 1 : 0,
		created_at: String(source.created_at || ''),
		membership_status:
			membershipStatus === 'pending_invite' ? 'pending_invite' : 'active',
		invitation_status: String(source.invitation_status || '').trim() || undefined,
		user: normalizeProfessionalUser(source.user),
		specialty: normalizeProfessionalSpecialty(source.specialty),
		services: normalizeProfessionalServices(source.services),
	};
};

const normalizeMeta = (
	value: unknown,
	fallback: { page: number; limit: number; totalRecords: number }
): ProfessionalsListMeta => {
	if (!value || typeof value !== 'object') {
		return {
			current_page: fallback.page,
			per_page: fallback.limit,
			total_records: fallback.totalRecords,
			total_pages: Math.max(1, Math.ceil(fallback.totalRecords / fallback.limit)),
		};
	}

	const source = value as Record<string, unknown>;
	const currentPage = toNumber(source.current_page, fallback.page);
	const perPage = toNumber(source.per_page, fallback.limit);
	const totalRecords = toNumber(source.total_records, fallback.totalRecords);
	const totalPages = toNumber(
		source.total_pages,
		Math.max(1, Math.ceil(Math.max(0, totalRecords) / Math.max(1, perPage)))
	);

	return {
		current_page: Math.max(1, Math.floor(currentPage)),
		per_page: Math.max(1, Math.floor(perPage)),
		total_records: Math.max(0, Math.floor(totalRecords)),
		total_pages: Math.max(1, Math.floor(totalPages)),
	};
};

const parseProfessionalsResponse = async (
	response: Response,
	pagination: { page: number; limit: number }
): Promise<ProfessionalsListResult> => {
	let data: ProfessionalsSuccessResponse | ProfessionalsFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new ProfessionalsApiError(
			'No fue posible interpretar la respuesta del servidor de personal.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data) ||
		!Array.isArray(data.data)
	) {
		const failureData = (data ?? {}) as ProfessionalsFailureResponse;
		throw new ProfessionalsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'list'),
			response.status || 400,
			ordsFailureDetails(failureData as Record<string, unknown>),
			parseFieldErrors(failureData.errors)
		);
	}

	const normalizedProfessionals = data.data
		.map(normalizeProfessional)
		.filter((professional): professional is Professional => professional !== null);

	return {
		data: normalizedProfessionals,
		meta: normalizeMeta(data.meta, {
			page: pagination.page,
			limit: pagination.limit,
			totalRecords: normalizedProfessionals.length,
		}),
	};
};

export const listProfessionals = async (
	token: string,
	options: { page?: number; limit?: number } = {}
): Promise<ProfessionalsListResult> => {
	if (!token) {
		throw new ProfessionalsApiError('Token de acceso requerido.', 401);
	}

	const page = Number.isInteger(options.page) && Number(options.page) > 0 ? Number(options.page) : 1;
	const limit =
		Number.isInteger(options.limit) && Number(options.limit) > 0 ? Number(options.limit) : 9;

	const professionalUrl = new URL(PROFESSIONALS_URL);
	professionalUrl.searchParams.set('page', String(page));
	professionalUrl.searchParams.set('limit', String(limit));

	const response = await fetch(professionalUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseProfessionalsResponse(response, { page, limit });
};

const parseProfessionalResponse = async (response: Response) => {
	let data: ProfessionalSuccessResponse | ProfessionalsFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new ProfessionalsApiError(
			'No fue posible interpretar la respuesta del servidor de personal.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('data' in data)
	) {
		const failureData = (data ?? {}) as ProfessionalsFailureResponse;
		throw new ProfessionalsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'get'),
			response.status || 400,
			ordsFailureDetails(failureData as Record<string, unknown>),
			parseFieldErrors(failureData.errors)
		);
	}

	const normalized = normalizeProfessional(data.data);
	if (!normalized) {
		throw new ProfessionalsApiError('No fue posible interpretar el personal solicitado.', 502);
	}

	return normalized;
};

const parseProfessionalActionResponse = async (
	response: Response,
	action: 'update' | 'delete'
) => {
	let data: ProfessionalActionSuccessResponse | ProfessionalsFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new ProfessionalsApiError(
			'No fue posible interpretar la respuesta del servidor de personal.',
			502
		);
	}

	if (!response.ok || !data || typeof data !== 'object' || data.status !== 'success') {
		const failureData = (data ?? {}) as ProfessionalsFailureResponse;
		const conflictMeta: Record<string, unknown> = {};
		if (failureData.deactivate === 1 || failureData.deactivate === true) {
			conflictMeta.deactivate = 1;
		}
		throw new ProfessionalsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, action),
			response.status || 400,
			Object.keys(conflictMeta).length > 0
				? { ...ordsFailureDetails(failureData as Record<string, unknown>), ...conflictMeta }
				: ordsFailureDetails(failureData as Record<string, unknown>),
			parseFieldErrors(failureData.errors)
		);
	}

	if (typeof data.message === 'string' && data.message.trim()) {
		return { message: data.message };
	}

	return {
		message:
			action === 'update'
				? 'Personal actualizado correctamente.'
				: 'Personal eliminado correctamente.',
	};
};

const parseCreateProfessionalResponse = async (response: Response) => {
	let data: CreateProfessionalSuccessResponse | ProfessionalsFailureResponse | null = null;

	try {
		data = await response.json();
	} catch {
		throw new ProfessionalsApiError(
			'No fue posible interpretar la respuesta del servidor de personal.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('id_professional' in data)
	) {
		const failureData = (data ?? {}) as ProfessionalsFailureResponse;
		const conflictMeta: Record<string, unknown> = {};
		if (failureData.can_reactivate === 1 || failureData.can_reactivate === true) {
			conflictMeta.can_reactivate = 1;
			const reactivateId = Number(failureData.reactivate_professional_id);
			if (Number.isInteger(reactivateId) && reactivateId > 0) {
				conflictMeta.reactivate_professional_id = reactivateId;
			}
		}
		throw new ProfessionalsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				fallbackMessageByStatus(response.status || 400, 'create'),
			response.status || 400,
			Object.keys(conflictMeta).length > 0
				? { ...ordsFailureDetails(failureData as Record<string, unknown>), ...conflictMeta }
				: ordsFailureDetails(failureData as Record<string, unknown>),
			parseFieldErrors(failureData.errors)
		);
	}

	return {
		id_user: toNumber(data.id_user, 0),
		id_professional: toNumber(data.id_professional, 0),
		invitation_sent: data.invitation_sent === 1 || data.invitation_sent === true,
		email_sent: toNumber(data.email_sent, 0),
		message:
			typeof data.message === 'string' && data.message.trim()
				? data.message
				: 'Invitación enviada correctamente.',
	};
};

const getProfessionalUrlById = (professionalId: number) => `${PROFESSIONALS_URL}/${professionalId}`;

export const createProfessionalWithUserWithOrds = async (
	token: string,
	payload: CreateProfessionalWithUserPayload
) => {
	if (!token) {
		throw new ProfessionalsApiError('Token de acceso requerido.', 401);
	}

	const response = await fetch(PROFESSIONALS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseCreateProfessionalResponse(response);
};

export const getProfessionalByIdWithOrds = async (token: string, professionalId: number) => {
	if (!token) {
		throw new ProfessionalsApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new ProfessionalsApiError('ID de personal invalido.', 400);
	}

	const response = await fetch(getProfessionalUrlById(professionalId), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseProfessionalResponse(response);
};

export const updateProfessionalWithUserWithOrds = async (
	token: string,
	professionalId: number,
	payload: UpdateProfessionalWithUserPayload
) => {
	if (!token) {
		throw new ProfessionalsApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new ProfessionalsApiError('ID de personal invalido.', 400);
	}

	const response = await fetch(getProfessionalUrlById(professionalId), {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify(payload),
	});

	return parseProfessionalActionResponse(response, 'update');
};

export const deleteProfessionalWithUserWithOrds = async (token: string, professionalId: number) => {
	if (!token) {
		throw new ProfessionalsApiError('Token de acceso requerido.', 401);
	}

	if (!Number.isInteger(professionalId) || professionalId <= 0) {
		throw new ProfessionalsApiError('ID de personal invalido.', 400);
	}

	const response = await fetch(getProfessionalUrlById(professionalId), {
		method: 'DELETE',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	return parseProfessionalActionResponse(response, 'delete');
};

export const suggestProfessionalSlugWithOrds = async (token: string, fullName: string) => {
	if (!token) {
		throw new ProfessionalsApiError('Token de acceso requerido.', 401);
	}

	const safeName = String(fullName || '').trim();
	if (!safeName) {
		throw new ProfessionalsApiError('Debe proporcionar un nombre para generar el slug.', 400);
	}

	const suggestUrl = new URL(PROFESSIONALS_SLUG_SUGGEST_URL);
	suggestUrl.searchParams.set('name', safeName);

	const response = await fetch(suggestUrl.toString(), {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
		},
	});

	let data: SlugSuggestSuccessResponse | ProfessionalsFailureResponse | null = null;
	try {
		data = await response.json();
	} catch {
		throw new ProfessionalsApiError(
			'No fue posible interpretar la respuesta del servidor de personal.',
			502
		);
	}

	if (
		!response.ok ||
		!data ||
		typeof data !== 'object' ||
		data.status !== 'success' ||
		!('slug' in data)
	) {
		const failureData = (data ?? {}) as ProfessionalsFailureResponse;
		throw new ProfessionalsApiError(
			(typeof failureData.message === 'string' && failureData.message.trim()) ||
				'No fue posible sugerir el slug del perfil.',
			response.status || 400,
			ordsFailureDetails(failureData as Record<string, unknown>),
			parseFieldErrors(failureData.errors)
		);
	}

	const slug = String(data.slug || '').trim();
	if (!slug) {
		throw new ProfessionalsApiError('No fue posible sugerir el slug del perfil.', 502);
	}

	return { slug };
};
