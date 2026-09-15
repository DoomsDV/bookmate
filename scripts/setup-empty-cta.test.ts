import assert from 'node:assert/strict';
import {
	renderSetupEmptyCta,
	renderSetupEmptyCtaContent,
	resolveBookableNextStep,
	resolveHubTeamEmpty,
	resolvePublicProfileNextStep,
	SCREEN_EMPTY,
	SETUP_EMPTY_CTA_ICON,
	SETUP_PATHS,
} from '../src/lib/setup-empty-cta.ts';
import { HUB_NO_ONLINE_SLOTS_MESSAGE, HUB_NO_TEAM_MESSAGE } from '../src/lib/workspace-settings-shared.ts';

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

const profileUnknownStaff = resolvePublicProfileNextStep({
	serviceCount: 2,
	professionalCount: null,
	hubListedProfessionalCount: 0,
	locationCount: 1,
});
assert.equal(profileUnknownStaff, null);
assert.notEqual(profileUnknownStaff?.id, 'create_professional');

assert.equal(SCREEN_EMPTY.professionalsNotOnHub.ctaLabel, 'Completar en Personal');
assert.equal(SCREEN_EMPTY.professionalsNotOnHub.ctaLabel.includes('→'), false);

const hubCta = renderSetupEmptyCtaContent(SCREEN_EMPTY.professionalsNotOnHub.ctaLabel);
assert.equal(hubCta.includes('→'), false);
assert.match(hubCta, /Completar en Personal/);
assert.match(hubCta, /material-symbols-rounded/);
assert.match(hubCta, /text-\[1\.1rem\]/);
assert.match(hubCta, new RegExp(SETUP_EMPTY_CTA_ICON));

const legacyArrowStripped = renderSetupEmptyCtaContent('Completar en Personal →');
assert.equal(legacyArrowStripped.includes('→'), false);
assert.match(legacyArrowStripped, /Completar en Personal<span class="material-symbols-rounded/);

const linkedCta = renderSetupEmptyCta({
	label: SCREEN_EMPTY.professionalsNotOnHub.ctaLabel,
	href: SETUP_PATHS.professionals,
});
assert.match(linkedCta, /class="panel-empty-cta"/);
assert.match(linkedCta, /arrow_forward/);
assert.equal(linkedCta.includes('→'), false);

const publicTeamEmpty = resolveHubTeamEmpty({
	hubListedCount: 0,
	audience: 'public',
});
assert.equal(publicTeamEmpty?.kind, 'none_published');
assert.equal(publicTeamEmpty?.title, HUB_NO_TEAM_MESSAGE);
assert.notEqual(publicTeamEmpty?.title, HUB_NO_ONLINE_SLOTS_MESSAGE);
assert.equal(publicTeamEmpty?.ctaLabel, undefined);

const ownerIncomplete = resolveHubTeamEmpty({
	hubListedCount: 0,
	staffCount: 4,
	audience: 'owner',
});
assert.equal(ownerIncomplete?.kind, 'staff_incomplete');
assert.equal(ownerIncomplete?.title, SCREEN_EMPTY.professionalsNotOnHub.title);
assert.equal(ownerIncomplete?.href, SETUP_PATHS.professionals);
assert.equal(ownerIncomplete?.ctaLabel, 'Completar en Personal');
assert.equal(ownerIncomplete?.ctaLabel?.includes('→'), false);

const ownerUnknownStaff = resolveHubTeamEmpty({
	hubListedCount: 0,
	staffCount: null,
	audience: 'owner',
});
assert.equal(ownerUnknownStaff?.kind, 'staff_incomplete');
assert.notEqual(ownerUnknownStaff?.title, SCREEN_EMPTY.professionals.title);

const ownerNoStaff = resolveHubTeamEmpty({
	hubListedCount: 0,
	staffCount: 0,
	audience: 'owner',
});
assert.equal(ownerNoStaff?.kind, 'no_staff');
assert.equal(ownerNoStaff?.title, SCREEN_EMPTY.professionals.title);

assert.equal(
	resolveHubTeamEmpty({ hubListedCount: 1, staffCount: 4, audience: 'owner' }),
	null
);

console.log('setup-empty-cta: ok');
