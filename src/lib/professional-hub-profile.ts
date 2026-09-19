export const PROFESSIONAL_SHORT_BIO_MAX = 280;

export type ProfessionalHubGap = 'photo' | 'bio';

export const normalizeProfessionalShortBio = (value: unknown): string =>
	String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, PROFESSIONAL_SHORT_BIO_MAX);

export const hasProfessionalHubPhoto = (imageUrl: unknown): boolean =>
	String(imageUrl ?? '').trim().length > 0;

export const hasProfessionalHubBio = (bio: unknown): boolean =>
	normalizeProfessionalShortBio(bio).length > 0;

export const getProfessionalHubGaps = (params: {
	imageUrl?: unknown;
	profileImageUrl?: unknown;
	shortBio?: unknown;
}): ProfessionalHubGap[] => {
	const image = params.imageUrl ?? params.profileImageUrl ?? '';
	const gaps: ProfessionalHubGap[] = [];
	if (!hasProfessionalHubPhoto(image)) gaps.push('photo');
	if (!hasProfessionalHubBio(params.shortBio)) gaps.push('bio');
	return gaps;
};

/** True si el payload ORDS/API trajo el campo de bio (aunque esté vacío). */
export const payloadHasProfessionalShortBio = (value: unknown): boolean => {
	if (!value || typeof value !== 'object') return false;
	return (
		Object.prototype.hasOwnProperty.call(value, 'short_bio') ||
		Object.prototype.hasOwnProperty.call(value, 'shortBio')
	);
};

/**
 * HAS-112: foto y bio no son gate. El listado público lo decide ORDS
 * (activo + slug + org publicada) y el BFF (id, nombre, slug).
 */
export const isHubListedProfessional = (_params?: {
	imageUrl?: unknown;
	profileImageUrl?: unknown;
	shortBio?: unknown;
	shortBioPresent?: boolean;
}): boolean => true;

/** Compat: el payload no se oculta por foto/bio vacíos. */
export const isHubListedProfessionalPayload = (value: unknown): boolean => {
	return Boolean(value) && typeof value === 'object';
};

export const formatProfessionalHubGapsLabel = (gaps: ProfessionalHubGap[]): string => {
	if (gaps.includes('photo') && gaps.includes('bio')) return 'Falta foto y bio';
	if (gaps.includes('photo')) return 'Falta foto';
	if (gaps.includes('bio')) return 'Falta bio';
	return '';
};

export const formatProfessionalHubListingHint = (gaps: ProfessionalHubGap[]): string => {
	return formatProfessionalHubGapsLabel(gaps);
};
