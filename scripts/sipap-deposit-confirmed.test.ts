import assert from 'node:assert/strict';
import test from 'node:test';

import { isDepositConfirmed } from '../src/lib/public-receipt-reconcile.ts';

test('isDepositConfirmed reconoce los payment_status de pago aprobado', () => {
	assert.equal(isDepositConfirmed({ payment_status: 'PAID_TRANSFER' }), true);
	assert.equal(isDepositConfirmed({ payment_status: 'PAID' }), true);
	assert.equal(isDepositConfirmed({ payment_status: 'PAID_CASH' }), true);
	assert.equal(isDepositConfirmed({ payment_status: 'EXEMPT' }), true);
});

// NEW-D: la aprobación en vivo puede reflejarse en appointment.status (CONFIRMADO)
// antes de que payment_status deje de ser PENDING; sin este chequeo el bloque de
// seña quedaba stale hasta que el cliente recargaba la página.
test('isDepositConfirmed reconoce status CONFIRMADO aunque payment_status siga PENDING', () => {
	assert.equal(isDepositConfirmed({ payment_status: 'PENDING', status: 'CONFIRMADO' }), true);
	assert.equal(isDepositConfirmed({ status: 'confirmado' }), true);
});

test('isDepositConfirmed no confirma seña pendiente o rechazada', () => {
	assert.equal(isDepositConfirmed({ payment_status: 'PENDING' }), false);
	assert.equal(isDepositConfirmed({ payment_status: 'PENDING', status: 'PENDIENTE' }), false);
	assert.equal(isDepositConfirmed({}), false);
});
