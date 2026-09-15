import assert from 'node:assert/strict';
import test from 'node:test';

import {
	addWeeks,
	buildWeeklyOccurrences,
	formatSeriesPreview,
	parseSeriesUntilDate,
} from '../src/lib/appointment-series.ts';

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
