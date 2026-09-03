import assert from 'node:assert/strict';
import test from 'node:test';

import { isReceiptRejected } from '../src/lib/public-receipt-reconcile.ts';

test('isReceiptRejected acepta boolean, 1 y string true', () => {
	assert.equal(isReceiptRejected(true), true);
	assert.equal(isReceiptRejected(1), true);
	assert.equal(isReceiptRejected('1'), true);
	assert.equal(isReceiptRejected('true'), true);
	assert.equal(isReceiptRejected('TRUE'), true);
});

test('isReceiptRejected rechaza valores vacíos o no-rechazo', () => {
	assert.equal(isReceiptRejected(false), false);
	assert.equal(isReceiptRejected(0), false);
	assert.equal(isReceiptRejected('false'), false);
	assert.equal(isReceiptRejected(null), false);
	assert.equal(isReceiptRejected(undefined), false);
	assert.equal(isReceiptRejected(''), false);
});
