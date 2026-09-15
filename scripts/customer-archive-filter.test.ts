import assert from 'node:assert/strict';
import test from 'node:test';

import {
	applyArchiveFilterToListResult,
	applyCustomerArchiveFilter,
	customerMatchesArchiveFilter,
	type CustomersArchiveListResult,
} from '../src/lib/customer-archive-filter.ts';

const customer = (id: number, is_active: 0 | 1) => ({
	id_customer: id,
	is_active,
});

test('customerMatchesArchiveFilter: activos vs archivados', () => {
	assert.equal(customerMatchesArchiveFilter({ is_active: 1 }, false), true);
	assert.equal(customerMatchesArchiveFilter({ is_active: 0 }, false), false);
	assert.equal(customerMatchesArchiveFilter({ is_active: 0 }, true), true);
	assert.equal(customerMatchesArchiveFilter({ is_active: 1 }, true), false);
});

test('applyCustomerArchiveFilter deja solo el lado pedido', () => {
	const rows = [customer(1, 1), customer(2, 0), customer(3, 1)];
	assert.deepEqual(
		applyCustomerArchiveFilter(rows, false).map((row) => row.id_customer),
		[1, 3]
	);
	assert.deepEqual(
		applyCustomerArchiveFilter(rows, true).map((row) => row.id_customer),
		[2]
	);
	assert.deepEqual(applyCustomerArchiveFilter(rows, true), [rows[1]]);
	assert.deepEqual(applyCustomerArchiveFilter([], true), []);
});

test('applyArchiveFilterToListResult corrige el padron completo sin filtrar', () => {
	const mixed: CustomersArchiveListResult<ReturnType<typeof customer>> = {
		data: [customer(1, 1), customer(2, 0), customer(3, 1)],
		meta: { current_page: 1, per_page: 9, total_records: 3, total_pages: 1 },
	};

	const archived = applyArchiveFilterToListResult(mixed, true);
	assert.deepEqual(
		archived.data.map((row) => row.id_customer),
		[2]
	);
	assert.equal(archived.meta.total_records, 1);
	assert.equal(archived.meta.total_pages, 1);

	const active = applyArchiveFilterToListResult(mixed, false);
	assert.deepEqual(
		active.data.map((row) => row.id_customer),
		[1, 3]
	);
	assert.equal(active.meta.total_records, 2);

	const emptyArchived = applyArchiveFilterToListResult(
		{
			data: [customer(1, 1), customer(3, 1)],
			meta: { current_page: 1, per_page: 9, total_records: 2, total_pages: 1 },
		},
		true
	);
	assert.deepEqual(emptyArchived.data, []);
	assert.equal(emptyArchived.meta.total_records, 0);
	assert.equal(emptyArchived.meta.total_pages, 0);
});

test('applyArchiveFilterToListResult no toca meta si ORDS ya filtró', () => {
	const alreadyFiltered: CustomersArchiveListResult<ReturnType<typeof customer>> = {
		data: [customer(2, 0)],
		meta: { current_page: 1, per_page: 9, total_records: 1, total_pages: 1 },
	};
	const result = applyArchiveFilterToListResult(alreadyFiltered, true);
	assert.equal(result, alreadyFiltered);
	assert.equal(result.meta.total_records, 1);
});
