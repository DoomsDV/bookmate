import { getCobrosPendingCountWithOrds } from './cobros';
import {
	type DashboardAlertCapabilities,
	type DashboardAlertsInput,
} from './dashboard-alerts';
import { getProfessionalHubGaps } from './professional-hub-profile';
import { isProfessionalAccountActive, listProfessionals, type Professional } from './professionals';
import {
	getProfessionalScheduleWithOrds,
	listLocationsLovWithOrds,
	listProfessionalsLovWithOrds,
} from './schedules';
import { listServicesLovWithOrds } from './services';

const SCHEDULE_SAMPLE_SIZE = 3;
const STAFF_PAGE_SIZE = 50;

const settledValue = <T>(result: PromiseSettledResult<T>): T | null =>
	result.status === 'fulfilled' ? result.value : null;

const countHubIncomplete = (professionals: Professional[]): number =>
	professionals.filter((professional) => {
		if (!isProfessionalAccountActive(professional)) return false;
		return (
			getProfessionalHubGaps({
				profileImageUrl: professional.profile_image_url,
				shortBio: professional.short_bio,
			}).length > 0
		);
	}).length;

const resolveSchedulePresence = async (
	token: string,
	professionals: Professional[]
): Promise<boolean | null> => {
	const sample = professionals
		.filter(isProfessionalAccountActive)
		.slice(0, SCHEDULE_SAMPLE_SIZE)
		.map((professional) => professional.id_professional);

	if (sample.length === 0) return null;

	const results = await Promise.allSettled(
		sample.map((id) => getProfessionalScheduleWithOrds(token, id))
	);
	const bundles = results
		.map(settledValue)
		.filter((bundle): bundle is NonNullable<typeof bundle> => bundle !== null);

	if (bundles.length === 0) return null;
	return bundles.some((bundle) => bundle.schedules.length > 0);
};

export const collectDashboardAlertSources = async (
	token: string,
	caps: DashboardAlertCapabilities
): Promise<DashboardAlertsInput> => {
	const empty: DashboardAlertsInput = {
		...caps,
		staffTotalCount: null,
		staffIncompleteCount: null,
		pendingPaymentsCount: null,
		serviceCount: null,
		locationCount: null,
		hasAnySchedule: null,
	};

	if (!token) return empty;

	const [professionalsResult, cobrosResult, servicesResult, locationsResult] = await Promise.allSettled([
		caps.canViewProfessionals
			? listProfessionals(token, { page: 1, limit: STAFF_PAGE_SIZE })
			: Promise.resolve(null),
		caps.canViewCobros ? getCobrosPendingCountWithOrds(token) : Promise.resolve(null),
		caps.canViewServices ? listServicesLovWithOrds(token) : Promise.resolve(null),
		caps.canViewLocations ? listLocationsLovWithOrds(token) : Promise.resolve(null),
	]);

	const professionalsList = settledValue(professionalsResult);
	const professionals = professionalsList?.data ?? null;
	const staffTotalCount = professionalsList ? professionalsList.meta.total_records : null;
	const staffIncompleteCount = professionals ? countHubIncomplete(professionals) : null;

	let hasAnySchedule: boolean | null = null;
	if (caps.canViewSchedules && professionals && professionals.length > 0) {
		hasAnySchedule = await resolveSchedulePresence(token, professionals);
	} else if (caps.canViewSchedules && !caps.canViewProfessionals) {
		try {
			const ownTeam = await listProfessionalsLovWithOrds(token, { onlyMe: true });
			if (ownTeam.length > 0) {
				const ownSchedules = await Promise.allSettled(
					ownTeam
						.slice(0, SCHEDULE_SAMPLE_SIZE)
						.map((item) => getProfessionalScheduleWithOrds(token, item.id_professional))
				);
				const bundles = ownSchedules
					.map(settledValue)
					.filter((bundle): bundle is NonNullable<typeof bundle> => bundle !== null);
				hasAnySchedule =
					bundles.length === 0 ? null : bundles.some((bundle) => bundle.schedules.length > 0);
			}
		} catch {
			hasAnySchedule = null;
		}
	}

	const services = settledValue(servicesResult);
	const locations = settledValue(locationsResult);

	return {
		...caps,
		staffTotalCount,
		staffIncompleteCount,
		pendingPaymentsCount: settledValue(cobrosResult),
		serviceCount: services ? services.length : null,
		locationCount: locations ? locations.length : null,
		hasAnySchedule,
	};
};
