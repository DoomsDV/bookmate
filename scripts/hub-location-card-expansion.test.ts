import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	isHubLocationExpanded,
	shouldCollapseHubLocationOnPointerDown,
	toggleHubLocationExpansion,
} from '../src/lib/hub-location-card-expansion.ts';

test('HAS-47: toggle solo afecta el id clickeado', () => {
	const afterFirst = toggleHubLocationExpansion([], 11);
	assert.deepEqual(afterFirst, [11]);
	assert.equal(isHubLocationExpanded(afterFirst, 11), true);
	assert.equal(isHubLocationExpanded(afterFirst, 22), false);

	const afterSecond = toggleHubLocationExpansion(afterFirst, 22);
	assert.deepEqual(afterSecond.slice().sort((a, b) => a - b), [11, 22]);
	assert.equal(isHubLocationExpanded(afterSecond, 11), true);
	assert.equal(isHubLocationExpanded(afterSecond, 22), true);

	const afterCollapseFirst = toggleHubLocationExpansion(afterSecond, 11);
	assert.deepEqual(afterCollapseFirst, [22]);
	assert.equal(isHubLocationExpanded(afterCollapseFirst, 11), false);
	assert.equal(isHubLocationExpanded(afterCollapseFirst, 22), true);
});

test('HAS-47: ids inválidos no mutan el set', () => {
	assert.deepEqual(toggleHubLocationExpansion([7], 0), [7]);
	assert.deepEqual(toggleHubLocationExpansion([7], Number.NaN), [7]);
	assert.equal(isHubLocationExpanded([7], 0), false);
});

test('HAS-47: clic en otra card no colapsa esta', () => {
	const thisCard = { contains: (node: Node) => node === thisCard } as unknown as Element;
	const otherCard = {
		closest: (selector: string) =>
			selector.includes('data-hub-location-card') || selector.includes('hub-location-map')
				? otherCard
				: null,
	} as unknown as Element;
	assert.equal(shouldCollapseHubLocationOnPointerDown(thisCard, otherCard), false);
	assert.equal(shouldCollapseHubLocationOnPointerDown(thisCard, thisCard), false);
});

test('HAS-47: clic fuera de las cards sí colapsa', () => {
	const thisCard = { contains: () => false } as unknown as Element;
	const page = { closest: () => null } as unknown as Element;
	assert.equal(shouldCollapseHubLocationOnPointerDown(thisCard, page), true);
	assert.equal(shouldCollapseHubLocationOnPointerDown(null, page), false);
});

test('HAS-47: el hub pasa locationId por sucursal y LocationMap lo usa', () => {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	const astro = readFileSync(join(root, 'src/pages/[orgSlug]/index.astro'), 'utf8');
	const map = readFileSync(join(root, 'src/components/ui/location-map.tsx'), 'utf8');
	assert.match(astro, /locationId=\{loc\.id_location\}/);
	assert.match(astro, /data-location-id=\{String\(loc\.id_location\)\}/);
	assert.match(map, /locationId\?: number/);
	assert.match(map, /toggleHubLocationExpansion/);
	assert.match(map, /data-location-id=/);
	assert.doesNotMatch(map, /useState<boolean>\(false\).*grid/);
});
