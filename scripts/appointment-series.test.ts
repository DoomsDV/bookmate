import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	addWeeks,
	buildWeeklyOccurrences,
	formatSeriesPreview,
	parseSeriesUntilDate,
	seriesCreateSubmitLabel,
} from '../src/lib/appointment-series.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('buildWeeklyOccurrences genera N citas cada 7 días', () => {
	const start = new Date(2026, 8, 21, 10, 0, 0);
	const dates = buildWeeklyOccurrences(start, { count: 4 });
	assert.equal(dates.length, 4);
	assert.equal(dates[0]?.getTime(), start.getTime());
	assert.equal(dates[1]?.getTime(), addWeeks(start, 1).getTime());
	assert.equal(dates[3]?.getDate(), 12);
	assert.equal(dates[3]?.getMonth(), 9);
});

test('buildWeeklyOccurrences respeta until inclusivo', () => {
	const start = new Date(2026, 8, 21, 10, 0, 0);
	const dates = buildWeeklyOccurrences(start, { until: '2026-10-05' });
	assert.equal(dates.length, 3);
	assert.equal(dates.at(-1)?.getDate(), 5);
	assert.equal(dates.at(-1)?.getMonth(), 9);
});

test('buildWeeklyOccurrences corta por until aunque count sea mayor', () => {
	const start = new Date(2026, 8, 21, 10, 0, 0);
	const dates = buildWeeklyOccurrences(start, { count: 10, until: '2026-10-05' });
	assert.equal(dates.length, 3);
});

test('parseSeriesUntilDate rechaza fechas inválidas', () => {
	assert.equal(parseSeriesUntilDate('2026-13-01'), null);
	assert.equal(parseSeriesUntilDate('21-09-2026'), null);
	assert.ok(parseSeriesUntilDate('2026-09-21'));
});

test('formatSeriesPreview describe la serie semanal', () => {
	const start = new Date(2026, 8, 21, 10, 0, 0);
	const preview = formatSeriesPreview(start, buildWeeklyOccurrences(start, { count: 4 }));
	assert.match(preview, /4 citas/);
	assert.match(preview, /lunes/);
	assert.match(preview, /10:00/);
});

test('seriesCreateSubmitLabel no cambia el copy de crear N citas', () => {
	assert.equal(seriesCreateSubmitLabel(false, 4), 'Crear reserva');
	assert.equal(seriesCreateSubmitLabel(true, 1), 'Crear reserva');
	assert.equal(seriesCreateSubmitLabel(true, 4), 'Crear 4 citas');
	assert.equal(seriesCreateSubmitLabel(true, 12), 'Crear 12 citas');
});

test('el check de serie pinta el bloque por CSS y difiere el preview', () => {
	const astro = readFileSync(join(repoRoot, 'src/components/AppointmentModalPanel.astro'), 'utf8');
	const css = readFileSync(join(repoRoot, 'src/styles/appointment-modal.css'), 'utf8');
	const modal = readFileSync(join(repoRoot, 'src/scripts/calendar/appointment-modal.ts'), 'utf8');

	assert.match(astro, /data-recurrence-fields inert/);
	assert.doesNotMatch(astro, /data-recurrence-fields hidden/);
	assert.match(css, /:has\(\[data-recurrence-enabled\]:checked\)/);
	assert.match(modal, /handleRecurrenceToggle/);
	assert.match(modal, /scheduleRecurrenceDetailsSync/);
	assert.doesNotMatch(modal, /recurrenceFields\?\.classList\.toggle\('hidden'/);
});
