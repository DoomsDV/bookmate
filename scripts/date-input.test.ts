import assert from 'node:assert/strict';
import test from 'node:test';

import {
	displayToIso,
	isoToDisplay,
	maskDateDisplay,
	syncDateTextFromNative,
} from '../src/lib/date-input.ts';

test('isoToDisplay formatea YYYY-MM-DD a dd/mm/aaaa', () => {
	assert.equal(isoToDisplay('2026-09-21'), '21/09/2026');
	assert.equal(isoToDisplay('invalid'), '');
});

test('displayToIso acepta dd/mm/aaaa y rechaza fechas inválidas', () => {
	assert.equal(displayToIso('21/09/2026'), '2026-09-21');
	assert.equal(displayToIso('1/9/2026'), '2026-09-01');
	assert.equal(displayToIso('31/02/2026'), '');
	assert.equal(displayToIso('2026-09-21'), '');
});

test('maskDateDisplay inserta barras al tipear', () => {
	assert.equal(maskDateDisplay('2'), '2');
	assert.equal(maskDateDisplay('2109'), '21/09');
	assert.equal(maskDateDisplay('21092026'), '21/09/2026');
	assert.equal(maskDateDisplay('21/09/2026extra'), '21/09/2026');
});

test('syncDateTextFromNative copia el ISO al campo visible', () => {
	const textEl = { value: '', classList: { remove() {} } } as unknown as HTMLInputElement;
	const nativeEl = { value: '2026-10-05' } as HTMLInputElement;
	syncDateTextFromNative(textEl, nativeEl);
	assert.equal(textEl.value, '05/10/2026');
});
