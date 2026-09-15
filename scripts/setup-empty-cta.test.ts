import assert from 'node:assert/strict';
import {
	resolveBookableNextStep,
	resolvePublicProfileNextStep,
	SCREEN_EMPTY,
	SETUP_PATHS,
} from '../src/lib/setup-empty-cta.ts';

const none = resolveBookableNextStep({
	serviceCount: 0,
	professionalCount: 0,
	locationCount: 0,
});
assert.equal(none?.id, 'create_service');
assert.equal(none?.ctaLabel, SCREEN_EMPTY.services.ctaLabel);
assert.equal(none?.href, SETUP_PATHS.services);

const noTeam = resolveBookableNextStep({
	serviceCount: 2,
	professionalCount: 0,
});
assert.equal(noTeam?.id, 'create_professional');
assert.equal(noTeam?.ctaLabel, SCREEN_EMPTY.professionals.ctaLabel);

const unassigned = resolveBookableNextStep({
	serviceCount: 2,
	professionalCount: 1,
	assignedServiceProfessionalCount: 0,
});
assert.equal(unassigned?.id, 'assign_services');

const noLocation = resolveBookableNextStep({
	serviceCount: 2,
	professionalCount: 1,
	assignedServiceProfessionalCount: 1,
	locationCount: 0,
});
assert.equal(noLocation?.id, 'create_location');
assert.equal(noLocation?.href, SETUP_PATHS.locations);

const ready = resolveBookableNextStep({
	serviceCount: 2,
	professionalCount: 1,
	assignedServiceProfessionalCount: 1,
	locationCount: 1,
});
assert.equal(ready, null);

const ignoreUnassignedWhenOmitted = resolveBookableNextStep({
	serviceCount: 1,
	professionalCount: 1,
});
assert.equal(ignoreUnassignedWhenOmitted, null);

const profileNoStaff = resolvePublicProfileNextStep({
	serviceCount: 2,
	professionalCount: 0,
	hubListedProfessionalCount: 0,
	locationCount: 1,
});
assert.equal(profileNoStaff?.id, 'create_professional');
assert.equal(profileNoStaff?.title, SCREEN_EMPTY.professionals.title);
assert.equal(profileNoStaff?.ctaLabel, SCREEN_EMPTY.professionals.ctaLabel);

const profileStaffNotOnHub = resolvePublicProfileNextStep({
	serviceCount: 2,
	professionalCount: 4,
	hubListedProfessionalCount: 0,
	locationCount: 1,
});
assert.equal(profileStaffNotOnHub?.id, 'complete_professional_hub');
assert.equal(profileStaffNotOnHub?.title, SCREEN_EMPTY.professionalsNotOnHub.title);
assert.equal(profileStaffNotOnHub?.ctaLabel, SCREEN_EMPTY.professionalsNotOnHub.ctaLabel);
assert.equal(profileStaffNotOnHub?.href, SETUP_PATHS.professionals);
assert.notEqual(profileStaffNotOnHub?.title, SCREEN_EMPTY.professionals.title);
assert.notEqual(profileStaffNotOnHub?.ctaLabel, SCREEN_EMPTY.professionals.ctaLabel);

const profileHubReady = resolvePublicProfileNextStep({
	serviceCount: 2,
	professionalCount: 4,
	hubListedProfessionalCount: 1,
	locationCount: 1,
});
assert.equal(profileHubReady, null);

const profileServicesFirst = resolvePublicProfileNextStep({
	serviceCount: 0,
	professionalCount: 4,
	hubListedProfessionalCount: 0,
	locationCount: 0,
});
assert.equal(profileServicesFirst?.id, 'create_service');

console.log('setup-empty-cta: ok');
