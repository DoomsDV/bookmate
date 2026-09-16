import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/pages/panel/customers.astro', import.meta.url), 'utf8');

test('HAS-66: en móvil la búsqueda va full-width y las acciones debajo', () => {
	assert.match(page, /flex flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center/);
	assert.match(page, /class="relative min-w-0 w-full sm:flex-1"\s+data-panel-search/);
	assert.match(page, /<div class="flex shrink-0 items-center gap-2">/);
	assert.match(page, /data-customers-search/);
});

test('HAS-66: el set de acciones de Clientes no cambia', () => {
	assert.match(page, /data-open-pro-filter/);
	assert.match(page, /data-open-import-customers/);
	assert.match(page, /data-toggle-archived/);
	assert.match(page, /href="\/api\/customers\/export"/);
});
