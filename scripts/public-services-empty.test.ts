import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/public-booking.css'), 'utf8');
const page = readFileSync(join(root, 'src/scripts/public-booking-page.ts'), 'utf8');

const emptyRule =
	css.match(/\.public-services-grid\s*>\s*\.public-services-empty\s*\{[\s\S]*?\n\}/)?.[0] ?? '';

test('HAS-63: empty state de servicios usa clase de centrado y no cambia el copy', () => {
	assert.match(page, /className =\s*'public-services-empty /);
	assert.match(page, /Este profesional no tiene servicios disponibles actualmente\./);
	assert.doesNotMatch(page, /Asignalos desde Personal/);
});

test('HAS-63: empty state ocupa todo el grid y se centra en el eje del wizard', () => {
	assert.match(emptyRule, /grid-column:\s*1\s*\/\s*-1/);
	assert.match(emptyRule, /justify-self:\s*center/);
	assert.match(emptyRule, /margin-inline:\s*auto/);
	assert.match(emptyRule, /text-align:\s*center/);
	assert.match(emptyRule, /width:\s*max-content/);
	assert.match(emptyRule, /max-width:\s*100%/);
});

test('HAS-63: el listado con servicios sigue siendo 2 columnas en desktop', () => {
	assert.match(css, /\.public-services-grid\.is-service-grid \{[\s\S]*grid-template-columns:\s*repeat\(2,/);
});
