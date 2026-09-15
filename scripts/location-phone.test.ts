import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLocationTelHref } from '../src/lib/public-booking-locations.ts';

test('buildLocationTelHref acepta móvil paraguayo y emite E.164', () => {
	assert.equal(buildLocationTelHref('0981 123 456'), 'tel:+595981123456');
	assert.equal(buildLocationTelHref('+595 981 123 456'), 'tel:+595981123456');
});

test('buildLocationTelHref acepta fijos y números con formato libre', () => {
	assert.equal(buildLocationTelHref('021 123 456'), 'tel:021123456');
	assert.equal(buildLocationTelHref('+54 11 4444 5555'), 'tel:+541144445555');
});

test('buildLocationTelHref ignora vacío o demasiado corto', () => {
	assert.equal(buildLocationTelHref(''), null);
	assert.equal(buildLocationTelHref('   '), null);
	assert.equal(buildLocationTelHref('123'), null);
	assert.equal(buildLocationTelHref(null), null);
});
