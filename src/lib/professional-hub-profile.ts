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

export const isHubListedProfessional = (params: {
	imageUrl?: unknown;
	profileImageUrl?: unknown;
	shortBio?: unknown;
	/**
	 * `false` = payload legacy sin campo bio (ORDS hub actual no lo emite).
	 * En ese caso no se descalifica por bio vacía: Personal ya exige foto+bio
	 * y el listado público no debe vaciarse por un campo omitido.
	 * Default `true` = mismo criterio que Personal (foto + bio).
	 */
	shortBioPresent?: boolean;
}): boolean => {
	if (!hasProfessionalHubPhoto(params.imageUrl ?? params.profileImageUrl)) {
		return false;
	}
	if (params.shortBioPresent === false) return true;
	return hasProfessionalHubBio(params.shortBio);
};

/** Misma regla que el hub público aplica a cada ítem de `professionals`. */
export const isHubListedProfessionalPayload = (value: unknown): boolean => {
	if (!value || typeof value !== 'object') return false;
	const source = value as Record<string, unknown>;
	return isHubListedProfessional({
		imageUrl: source.image_url ?? source.profile_image_url,
		shortBio: source.short_bio ?? source.shortBio,
		shortBioPresent: payloadHasProfessionalShortBio(source),
	});
};

export const formatProfessionalHubGapsLabel = (gaps: ProfessionalHubGap[]): string => {
	if (gaps.includes('photo') && gaps.includes('bio')) return 'Falta foto y bio';
	if (gaps.includes('photo')) return 'Falta foto';
	if (gaps.includes('bio')) return 'Falta bio';
	return '';
};

export const formatProfessionalHubListingHint = (gaps: ProfessionalHubGap[]): string => {
	const missing = formatProfessionalHubGapsLabel(gaps);
	if (!missing) return '';
	return `No aparece en el hub · ${missing}`;
};
