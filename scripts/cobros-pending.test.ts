import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CobroItem } from '../src/lib/cobros.ts';
import { COBROS_HREF } from '../src/lib/dashboard-alerts.ts';
import {
	EMPTY_PENDING_COPY,
	EMPTY_PENDING_TITLE,
	isCobrosBadgePending,
	mergeBadgePendingCobros,
	paginateCobroItems,
	resolveCobrosEntryStatus,
	sortCobroItems,
} from '../src/lib/cobros-pending.ts';

const cobrosPage = readFileSync(new URL('../src/pages/panel/cobros.astro', import.meta.url), 'utf8');
const cobrosScript = readFileSync(new URL('../src/scripts/cobros-page.ts', import.meta.url), 'utf8');
const cobrosLib = readFileSync(new URL('../src/lib/cobros-pending.ts', import.meta.url), 'utf8');
const cobrosOrds = readFileSync(new URL('../src/lib/cobros.ts', import.meta.url), 'utf8');

const item = (overrides: Partial<CobroItem> = {}): CobroItem => ({
	id_transaction: 1,
	id_appointment: 10,
	amount: 50000,
	currency: 'PYG',
	ui_status: 'approved',
	...overrides,
});

test('HAS-111: el badge cuenta revisión + reembolso PENDING + disputa activa', () => {
	assert.match(cobrosLib, /pr_pending_count/);
	assert.match(cobrosLib, /citas distintas/);
	assert.match(cobrosLib, /refund_status = PENDING/);
	assert.match(cobrosLib, /OPENED o PROOF_RECEIVED/);
	assert.match(cobrosOrds, /listBadgePendingCobrosWithOrds/);

	assert.equal(isCobrosBadgePending(item({ ui_status: 'pending' })), true);
	assert.equal(isCobrosBadgePending(item({ ui_status: 'refund_pending' })), true);
	assert.equal(isCobrosBadgePending(item({ ui_status: 'refund_dispute' })), true);
	assert.equal(
		isCobrosBadgePending(item({ ui_status: 'approved', refund_dispute_status: 'OPENED' })),
		true
	);
	assert.equal(
		isCobrosBadgePending(item({ ui_status: 'approved', refund_dispute_status: 'PROOF_RECEIVED' })),
		true
	);

	assert.equal(isCobrosBadgePending(item({ ui_status: 'approved' })), false);
	assert.equal(isCobrosBadgePending(item({ ui_status: 'other' })), false);
	assert.equal(isCobrosBadgePending(item({ ui_status: 'refund_sent' })), false);
	assert.equal(isCobrosBadgePending(item({ ui_status: 'refund_awaiting_alias' })), false);
	assert.equal(isCobrosBadgePending(item({ ui_status: 'refund_waived' })), false);
	assert.equal(
		isCobrosBadgePending(item({ ui_status: 'approved', refund_dispute_status: 'UNDER_REVIEW' })),
		false
	);
});

test('HAS-111: al entrar sin status, default a Pendientes si hay badge', () => {
	assert.equal(resolveCobrosEntryStatus({ statusFromUrl: '', pendingCount: 1 }), 'pending');
	assert.equal(resolveCobrosEntryStatus({ statusFromUrl: null, pendingCount: 3 }), 'pending');
	assert.equal(resolveCobrosEntryStatus({ statusFromUrl: '', pendingCount: 0 }), 'all');
	assert.equal(resolveCobrosEntryStatus({ statusFromUrl: '', pendingCount: null }), 'all');
	assert.equal(
		resolveCobrosEntryStatus({ statusFromUrl: 'approved', pendingCount: 2 }),
		'approved'
	);
	assert.equal(resolveCobrosEntryStatus({ statusFromUrl: 'all', pendingCount: 2 }), 'all');
	assert.equal(resolveCobrosEntryStatus({ statusFromUrl: 'pending', pendingCount: 0 }), 'pending');
});

test('HAS-111: merge de Pendientes incluye reembolso/disputa del badge', () => {
	const reviews = [item({ id_transaction: 1, ui_status: 'pending', amount: 100 })];
	const extras = [
		item({ id_transaction: 1, ui_status: 'pending', amount: 100 }),
		item({ id_transaction: 2, ui_status: 'refund_pending', amount: 200 }),
		item({ id_transaction: 3, ui_status: 'refund_sent', amount: 300 }),
		item({
			id_transaction: 4,
			ui_status: 'approved',
			refund_dispute_status: 'OPENED',
			amount: 400,
		}),
	];

	const merged = mergeBadgePendingCobros(reviews, extras);
	assert.deepEqual(
		merged.map((row) => row.id_transaction).sort((a, b) => a - b),
		[1, 2, 4]
	);
});

test('HAS-111: sort y página no cambian el criterio del badge', () => {
	const rows = [
		item({ id_transaction: 2, start_time: '2026-09-10T10:00:00', amount: 20 }),
		item({ id_transaction: 1, start_time: '2026-09-12T10:00:00', amount: 10 }),
	];
	const byDate = sortCobroItems(rows, 'date', 'desc');
	assert.equal(byDate[0]?.id_transaction, 1);
	const byPrice = sortCobroItems(rows, 'price', 'asc');
	assert.equal(byPrice[0]?.id_transaction, 1);

	const page = paginateCobroItems(rows, 2, 1);
	assert.equal(page.total, 2);
	assert.equal(page.items.length, 1);
	assert.equal(page.page, 2);
});

test('HAS-111: la UI marca la fila y el tab Pendientes', () => {
	assert.match(cobrosPage, /data-cobros-tab="pending"/);
	assert.match(cobrosPage, /data-cobros-pending-tab-count/);
	assert.match(cobrosPage, /data-cobros-empty-title/);
	assert.match(cobrosPage, /cobros-row--badge-pending/);
	assert.match(cobrosPage, /cobros-pending-dot/);
	assert.match(cobrosScript, /isCobrosBadgePending/);
	assert.match(cobrosScript, /resolveCobrosEntryStatus/);
	assert.match(cobrosScript, /fetchCobrosPendingCount/);
	assert.match(cobrosScript, /cobrosBadgePending/);
	assert.match(cobrosScript, /EMPTY_PENDING_TITLE/);
	assert.equal(EMPTY_PENDING_TITLE, 'No hay cobros pendientes');
	assert.match(EMPTY_PENDING_COPY, /número del menú/);
	assert.equal(COBROS_HREF, '/panel/cobros?status=pending');
});
