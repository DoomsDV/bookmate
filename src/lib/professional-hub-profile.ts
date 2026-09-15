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

export const isHubListedProfessional = (params: {
	imageUrl?: unknown;
	profileImageUrl?: unknown;
	shortBio?: unknown;
}): boolean => getProfessionalHubGaps(params).length === 0;

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
