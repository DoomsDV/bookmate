import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hubLib = readFileSync(new URL('../src/lib/public-org-hub.ts', import.meta.url), 'utf8');
const hubPage = readFileSync(new URL('../src/pages/[orgSlug]/index.astro', import.meta.url), 'utf8');
const preview = readFileSync(
	new URL('../src/components/PublicProfilePreview.tsx', import.meta.url),
	'utf8'
);
const listingRule = readFileSync(
	new URL('../src/lib/professional-hub-profile.ts', import.meta.url),
	'utf8'
);

test('HAS-112: el BFF no filtra el hub por foto ni bio', () => {
	assert.doesNotMatch(hubLib, /isHubListedProfessionalPayload/);
	assert.match(hubLib, /if \(!id \|\| !fullName \|\| !profileSlug\) return null;/);
	assert.match(listingRule, /foto y bio no son gate/i);
	assert.match(listingRule, /isHubListedProfessional = \(_params\?: \{/);
	assert.match(listingRule, /\}\): boolean => true;/);
});

test('HAS-112: hub y preview tienen placeholder de iniciales', () => {
	assert.match(hubPage, /hub-pro-card__avatar--ph/);
	assert.match(hubPage, /hub-pro-card__initials/);
	assert.match(hubPage, /initialsFromName\(pro\.full_name\)/);
	assert.match(preview, /hub-pro-card__avatar--ph/);
	assert.match(preview, /hub-pro-card__initials/);
	assert.doesNotMatch(hubPage, /Sin foto y bio no aparece/);
});
