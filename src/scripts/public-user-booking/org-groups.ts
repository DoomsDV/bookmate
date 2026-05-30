import type { UserBookingContext, UserBookingService } from './types';

export type OrganizationBookingGroup = {
	org_id_organization: number;
	organization_name: string;
	organization_slug: string;
	id_professional: number;
	locations: UserBookingContext[];
	services: UserBookingService[];
};

export type LocationSlotGroup = {
	location: UserBookingContext;
	slots: string[];
};

const mergeServices = (
	target: UserBookingService[],
	incoming: UserBookingService[]
): UserBookingService[] => {
	const next = [...target];
	for (const service of incoming) {
		if (next.some((item) => item.id_service === service.id_service)) continue;
		next.push(service);
	}
	return next.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
};

export const buildOrganizationGroups = (
	locations: UserBookingContext[]
): OrganizationBookingGroup[] => {
	const map = new Map<number, OrganizationBookingGroup>();

	for (const location of locations) {
		const orgId = location.org_id_organization;
		let group = map.get(orgId);
		if (!group) {
			group = {
				org_id_organization: orgId,
				organization_name: location.organization_name,
				organization_slug: location.organization_slug,
				id_professional: location.id_professional,
				locations: [],
				services: [],
			};
			map.set(orgId, group);
		}

		group.locations.push(location);
		group.services = mergeServices(group.services, location.services);
	}

	return Array.from(map.values())
		.map((group) => ({
			...group,
			locations: group.locations.sort((a, b) =>
				String(a.name || a.address || '').localeCompare(String(b.name || b.address || ''), 'es', {
					sensitivity: 'base',
				})
			),
		}))
		.sort((a, b) =>
			a.organization_name.localeCompare(b.organization_name, 'es', { sensitivity: 'base' })
		);
};

export const findOrganizationGroup = (
	groups: OrganizationBookingGroup[],
	orgId: number
) => groups.find((group) => group.org_id_organization === orgId) ?? null;
