import assert from 'node:assert/strict';
import test from 'node:test';

import {
	COBROS_TOUR_STORAGE_KEY,
	PAYMENTS_SENAS_TOUR_STEPS,
	PAYMENTS_SENAS_TOUR_STORAGE_KEY,
} from '../src/lib/settings-payments-tour-steps.ts';

test('HAS-20: el tour de señas tiene 3 pasos en orden SIPAP → política → cobro', () => {
	assert.equal(PAYMENTS_SENAS_TOUR_STEPS.length, 3);
	assert.deepEqual(
		PAYMENTS_SENAS_TOUR_STEPS.map((step) => step.id),
		['sipap', 'policy', 'receipt']
	);
	assert.equal(PAYMENTS_SENAS_TOUR_STEPS[0].selector, '[data-payments-tour-sipap]');
	assert.equal(PAYMENTS_SENAS_TOUR_STEPS[1].selector, '[data-payments-tour-policy]');
	assert.equal(PAYMENTS_SENAS_TOUR_STEPS[2].selector, '[data-payments-tour-receipt]');
});

test('HAS-20: los títulos educan alias, política y comprobante', () => {
	assert.match(PAYMENTS_SENAS_TOUR_STEPS[0].title, /alias sipap/i);
	assert.match(PAYMENTS_SENAS_TOUR_STEPS[0].description, /HASEL/i);
	assert.match(PAYMENTS_SENAS_TOUR_STEPS[1].title, /pol[ií]tica/i);
	assert.match(PAYMENTS_SENAS_TOUR_STEPS[2].title, /c[oó]mo se ve un cobro/i);
	assert.match(PAYMENTS_SENAS_TOUR_STEPS[2].description, /comprobante/i);
	assert.match(PAYMENTS_SENAS_TOUR_STEPS[2].description, /Cobros/);
});

test('HAS-20: las claves de tour de señas y cobros son distintas', () => {
	assert.equal(PAYMENTS_SENAS_TOUR_STORAGE_KEY, 'bookmate_payments_senas_tour_v1');
	assert.equal(COBROS_TOUR_STORAGE_KEY, 'bookmate_cobros_tour_v1');
	assert.notEqual(PAYMENTS_SENAS_TOUR_STORAGE_KEY, COBROS_TOUR_STORAGE_KEY);
});
