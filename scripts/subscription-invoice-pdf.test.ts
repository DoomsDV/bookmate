import assert from 'node:assert/strict';
import test from 'node:test';

import {
	assertPdfBytes,
	buildInvoicePdfFilename,
	buildInvoicePdfHeaders,
	fetchKudePdfBytes,
	InvoicePdfError,
	parseEsignKudeLink,
	parseInvoiceIdParam,
} from '../src/lib/subscription-invoice-pdf.ts';

test('parseInvoiceIdParam acepta enteros positivos', () => {
	assert.equal(parseInvoiceIdParam('42'), 42);
});

test('parseInvoiceIdParam rechaza valores inválidos', () => {
	for (const raw of [undefined, '', '0', '-1', '1.5', 'abc']) {
		assert.throws(() => parseInvoiceIdParam(raw as string | undefined), InvoicePdfError);
	}
});

test('buildInvoicePdfFilename prioriza el CDC limpio', () => {
	assert.equal(buildInvoicePdfFilename('01800ABC-123', 9), 'factura-01800ABC-123.pdf');
	assert.equal(buildInvoicePdfFilename(null, 9), 'factura-9.pdf');
});

test('buildInvoicePdfHeaders fuerza attachment y no-store', () => {
	const headers = buildInvoicePdfHeaders('factura-1.pdf', 128) as Record<string, string>;
	assert.equal(headers['Content-Type'], 'application/pdf');
	assert.equal(headers['Content-Length'], '128');
	assert.equal(headers['Content-Disposition'], 'attachment; filename="factura-1.pdf"');
	assert.equal(headers['Cache-Control'], 'no-store');
});

test('assertPdfBytes valida firma PDF y tamaño', () => {
	const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
	assert.doesNotThrow(() => assertPdfBytes(pdf));
	assert.throws(() => assertPdfBytes(new Uint8Array([0x00, 0x01, 0x02, 0x03])), InvoicePdfError);
	assert.throws(() => assertPdfBytes(new Uint8Array(0)), InvoicePdfError);
});

test('fetchKudePdfBytes descarga bytes PDF válidos', async () => {
	const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
	const bytes = await fetchKudePdfBytes(
		'https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/x/b/y/o/kude.pdf',
		{
			fetchImpl: async () =>
				new Response(pdf, {
					status: 200,
					headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.byteLength) },
				}),
		}
	);
	assert.equal(bytes.byteLength, pdf.byteLength);
});

test('fetchKudePdfBytes rechaza HTTP no-OK, redirects y hosts no OCI', async () => {
	await assert.rejects(
		() => fetchKudePdfBytes('not-a-url'),
		(error: unknown) => error instanceof InvoicePdfError && error.code === 'INVALID_KUDE_URL'
	);
	await assert.rejects(
		() => fetchKudePdfBytes('https://example.test/kude.pdf'),
		(error: unknown) => error instanceof InvoicePdfError && error.code === 'INVALID_KUDE_URL'
	);
	await assert.rejects(
		() =>
			fetchKudePdfBytes('https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/x/b/y/o/kude.pdf', {
				fetchImpl: async () => new Response('missing', { status: 404 }),
			}),
		(error: unknown) => error instanceof InvoicePdfError && error.code === 'PDF_HTTP'
	);
	await assert.rejects(
		() =>
			fetchKudePdfBytes('https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/x/b/y/o/kude.pdf', {
				fetchImpl: async () =>
					new Response(null, { status: 302, headers: { Location: 'https://evil.test/x' } }),
			}),
		(error: unknown) => error instanceof InvoicePdfError && error.code === 'PDF_HTTP'
	);
});

test('parseEsignKudeLink reconoce el link estable del firmador', () => {
	const cdc = '0'.repeat(43) + '1';
	assert.equal(parseEsignKudeLink(`https://api.etick.uno/v1/documents/${cdc}/kude/pdf`), cdc);
	assert.equal(parseEsignKudeLink(`https://api-staging.etick.uno/v1/documents/${cdc}/kude/pdf`), cdc);
});

test('parseEsignKudeLink deja pasar objetos OCI y rechaza hosts o rutas ajenas', () => {
	const cdc = '0'.repeat(43) + '1';
	for (const raw of [
		'https://objectstorage.sa-saopaulo-1.oraclecloud.com/p/abc/n/ns/b/bucket/o/kude.pdf',
		`http://api.etick.uno/v1/documents/${cdc}/kude/pdf`,
		`https://evil.example/v1/documents/${cdc}/kude/pdf`,
		`https://api.etick.uno.evil.example/v1/documents/${cdc}/kude/pdf`,
		`https://api.etick.uno/v1/documents/${cdc}/xml`,
		'https://api.etick.uno/v1/documents/123/kude/pdf',
		'',
		null,
	]) {
		assert.equal(parseEsignKudeLink(raw), null, String(raw));
	}
});
