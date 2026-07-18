export type PublicProfilePreviewState = {
	organizationName: string;
	initials: string;
	description: string;
	logoUrl: string;
	bannerUrl: string;
	whatsappVisible: boolean;
	facebookUrl: string;
	instagramUrl: string;
	galleryUrls: string[];
	serviceCategories: string[];
};

export const PUBLIC_PROFILE_PREVIEW_EVENT = 'ppe:preview-update';

export const emitPublicProfilePreviewUpdate = (
	detail: Partial<PublicProfilePreviewState>
) => {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(
		new CustomEvent(PUBLIC_PROFILE_PREVIEW_EVENT, { detail })
	);
};
