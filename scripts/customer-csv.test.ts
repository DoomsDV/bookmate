import assert from 'node:assert/strict';
import test from 'node:test';

import {
	CUSTOMER_CSV_TEMPLATE,
	parseCsvRecords,
	previewCustomerCsv,
	prepareCustomerCsv,
} from '../src/lib/customer-csv.ts';

test('parseCsvRecords respeta comillas, BOM y punto y coma', () => {
	const records = parseCsvRecords(
		'\uFEFFnombre;telefono;ci\n"Fernández, María";0981123456;4567890\n'
	);
	assert.deepEqual(records[0], ['nombre', 'telefono', 'ci']);
	assert.deepEqual(records[1], ['Fernández, María', '0981123456', '4567890']);
});

test('previewCustomerCsv acepta el template y el formato del export', () => {
	const template = previewCustomerCsv(CUSTOMER_CSV_TEMPLATE);
	assert.equal(template.total_rows, 1);
	assert.equal(template.valid_rows, 1);
	assert.equal(template.rows[0]?.first_name, 'María');
	assert.equal(template.rows[0]?.last_name, 'Fernández');
	assert.equal(template.rows[0]?.phone_number, '+595981123456');
	assert.equal(template.rows[0]?.document_number, '4567890');

	const exported = previewCustomerCsv(
		[
			'id_customer,full_name,first_name,last_name,document_number,email,phone_number,created_at',
			'12,Ana Pérez,Ana,Pérez,1234567,ana@correo.com,+595981111111,2026-01-01',
		].join('\n')
	);
	assert.equal(exported.valid_rows, 1);
	assert.equal(exported.rows[0]?.first_name, 'Ana');
	assert.equal(exported.rows[0]?.email, 'ana@correo.com');
});

test('prepareCustomerCsv marca errores por fila y duplicados internos', () => {
	const rows = prepareCustomerCsv(
		[
			'nombre,telefono,ci,email',
			'Juan,0981111111,,juan@correo.com',
			'Sin Telefono,,4567890,',
			'Maria Lopez,0981222222,4567890,maria@correo.com',
			'Pedro Gomez,0981222222,7654321,pedro@correo.com',
			'Lucia Diaz,no-es-telefono,,lucia@correo.com',
		].join('\n')
	);

	assert.equal(rows.length, 5);
	assert.equal(rows[0]?.status, 'error');
	assert.match(rows[0]?.errors[0]?.message || '', /apellido/i);
	assert.equal(rows[1]?.status, 'error');
	assert.equal(rows[1]?.errors[0]?.field, 'phone_number');
	assert.equal(rows[2]?.status, 'ok');
	assert.equal(rows[3]?.status, 'error');
	assert.match(rows[3]?.errors[0]?.message || '', /duplicado/i);
	assert.equal(rows[4]?.status, 'error');
	assert.equal(rows[4]?.errors[0]?.field, 'phone_number');
});
