import assert from 'node:assert/strict';
import test from 'node:test';

import {
	CUSTOMER_PRELOAD_LIMIT,
	CUSTOMER_RESULTS_LIMIT,
	customerSearchKey,
	filterCustomersLocally,
	isCustomerPreloadComplete,
	normalizeCustomerQuery,
	shouldSearchCustomersOnServer,
} from '../src/lib/customer-search.ts';

const customer = (id: number, full_name: string, phone_number = '') => ({ id_customer: id, full_name, phone_number });

test('normalizeCustomerQuery ignora mayúsculas, acentos y espacios de borde', () => {
	assert.equal(normalizeCustomerQuery('  Nancy DOLDÁN '), 'nancy doldan');
	assert.equal(normalizeCustomerQuery(''), '');
});

test('filterCustomersLocally busca por nombre sin acentos y por teléfono', () => {
	const list = [customer(1, 'Nancy Doldán', '+595981917705'), customer(2, 'Alex Deleón', '+595971000000')];
	assert.deepEqual(filterCustomersLocally(list, 'doldan').map((c) => c.id_customer), [1]);
	assert.deepEqual(filterCustomersLocally(list, 'DELEÓN').map((c) => c.id_customer), [2]);
	assert.deepEqual(filterCustomersLocally(list, '98191').map((c) => c.id_customer), [1]);
	assert.deepEqual(filterCustomersLocally(list, 'zzz'), []);
});

test('filterCustomersLocally sin texto devuelve los primeros hasta el límite', () => {
	const list = Array.from({ length: 20 }, (_, i) => customer(i + 1, `Cliente ${i + 1}`));
	assert.equal(filterCustomersLocally(list, '').length, CUSTOMER_RESULTS_LIMIT);
	assert.equal(filterCustomersLocally(list, '', 3).length, 3);
});

test('la precarga está completa solo si trajo menos que el límite', () => {
	assert.equal(isCustomerPreloadComplete(12), true);
	assert.equal(isCustomerPreloadComplete(CUSTOMER_PRELOAD_LIMIT), false);
});

test('se consulta al servidor solo si faltan clientes y hay al menos 2 caracteres', () => {
	assert.equal(shouldSearchCustomersOnServer('na', false), true);
	assert.equal(shouldSearchCustomersOnServer('n', false), false);
	assert.equal(shouldSearchCustomersOnServer('  ', false), false);
	assert.equal(shouldSearchCustomersOnServer('nancy', true), false);
});

test('customerSearchKey distingue profesional y normaliza el texto', () => {
	assert.equal(customerSearchKey(0, 'Doldán'), customerSearchKey(0, ' doldan '));
	assert.notEqual(customerSearchKey(0, 'nancy'), customerSearchKey(7, 'nancy'));
});
