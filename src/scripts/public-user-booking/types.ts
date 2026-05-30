import type { PublicUserProfile, PublicUserProfileLocation, PublicUserProfileService } from '../../lib/public-user-profile';

export type UserBookingWizardStep = 1 | 2 | 3 | 4 | 5;

export type UserBookingContext = PublicUserProfileLocation;

export type UserBookingProfile = PublicUserProfile;

export type UserBookingService = PublicUserProfileService;

export type UserBookingState = {
	step: UserBookingWizardStep;
	expandedLocationId: number;
	selectedContext: UserBookingContext | null;
	selectedService: UserBookingService | null;
	selectedDate: string;
	selectedTime: string;
	visibleMonth: Date;
	isLoadingSlots: boolean;
	isSubmitting: boolean;
};

export const USER_BOOKING_STEP_LABELS: Record<1 | 2 | 3 | 4, string> = {
	1: 'Servicio',
	2: 'Fecha',
	3: 'Horario',
	4: 'Datos',
};

export type LocationCardKey = `${number}:${number}`;

export const buildLocationCardKey = (location: Pick<UserBookingContext, 'id_location' | 'org_id_organization'>) =>
	`${location.org_id_organization}:${location.id_location}` as LocationCardKey;

export const parseProfileFromDom = (root: HTMLElement): UserBookingProfile | null => {
	const node = root.querySelector<HTMLElement>('#public-user-profile-json');
	if (!node?.textContent) return null;

	try {
		const parsed = JSON.parse(node.textContent) as UserBookingProfile;
		if (!parsed || typeof parsed !== 'object') return null;
		if (!Array.isArray(parsed.locations)) parsed.locations = [];
		return parsed;
	} catch {
		return null;
	}
};
