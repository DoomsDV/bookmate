import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../src/styles/public-org-hub.css');
const css = readFileSync(cssPath, 'utf8');

const locationGridBlocks = [...css.matchAll(/\.hub-locations-grid \{[\s\S]*?\n\t*\}/g)].map(
	(match) => match[0]
);
const locationsGridBlock = locationGridBlocks[0] ?? '';
const desktopColumnsRule = locationGridBlocks.find((block) =>
	block.includes('minmax(min(100%, 17.5rem)')
) ?? '';
const wrapBlock = css.match(/\.hub-location-map-wrap \{[\s\S]*?\n\}/)?.[0] ?? '';
const actionsBlock = css.match(/\.hub-location-map__actions \{[\s\S]*?\n\}/)?.[0] ?? '';
const sheetBlock = css.match(/\.hub-location-map__sheet \{[\s\S]*?\n\}/)?.[0] ?? '';

test('HAS-42: sucursales usa auto-fit con tope, no 1fr que separa 1–2 cards', () => {
	assert.match(locationsGridBlock, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*16\.5rem\),\s*22rem\)\)/);
	assert.match(desktopColumnsRule, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*17\.5rem\),\s*22rem\)\)/);
	assert.equal(
		locationGridBlocks.some((block) => /auto-fit[\s\S]*,\s*1fr\)/.test(block)),
		false
	);
});

test('HAS-42: fila estira cards y no las empuja a los extremos', () => {
	assert.match(locationsGridBlock, /align-items:\s*stretch/);
	assert.doesNotMatch(locationsGridBlock, /align-items:\s*start/);
	assert.match(locationsGridBlock, /justify-content:\s*start/);
	assert.doesNotMatch(wrapBlock, /max-width:\s*28rem/);
});

test('HAS-42: footer de acciones queda al fondo; HAS-33 no recorta contenido', () => {
	assert.match(actionsBlock, /margin-top:\s*auto/);
	assert.match(sheetBlock, /min-height:\s*max\(11rem,\s*min-content\)/);
	assert.match(sheetBlock, /overflow:\s*hidden/);
});

test('HAS-47: expandir una card no estira las hermanas por la fila', () => {
	assert.match(
		css,
		/\.hub-locations-grid:has\(\.hub-location-map\.is-expanded\) \{\s*align-items:\s*start;/
	);
	assert.match(
		css,
		/\.hub-location-map-wrap:not\(:has\(\.hub-location-map\.is-expanded\)\)/
	);
	assert.match(css, /height:\s*max-content/);
});
