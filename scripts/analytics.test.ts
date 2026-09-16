import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CAPABILITIES, defaultCapabilitiesForRole } from '../src/config/capabilities.ts';
import {
	fillAppointmentsByDay,
	normalizeChartWindow,
} from '../src/lib/dashboard-chart.ts';

const ROLES = { ADMIN: 1, PROFESIONAL: 2, RECEPCIONISTA: 3 } as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ANALYTICS_MAX_CUSTOM_DAYS = 90;

const toOptionalId = (value: unknown): number | null => {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return null;
	return parsed;
};

const parseAnalyticsIsoDate = (value: unknown): string | null => {
	const text = String(value ?? '').trim();
	if (!ISO_DATE_RE.test(text)) return null;
	const [year, month, day] = text.split('-').map(Number);
	const utc = new Date(Date.UTC(year, month - 1, day));
	if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
		return null;
	}
	return text;
};

const analyticsInclusiveDays = (from: string, to: string) => {
	const start = Date.parse(`${from}T00:00:00Z`);
	const end = Date.parse(`${to}T00:00:00Z`);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
	return Math.floor((end - start) / 86_400_000) + 1;
};

const normalizeAnalyticsQuery = (query: {
	days?: unknown;
	from?: unknown;
	to?: unknown;
	location_id?: unknown;
	professional_id?: unknown;
}) => {
	const locationId = toOptionalId(query.location_id);
	const professionalId = toOptionalId(query.professional_id);
	const rawFrom = parseAnalyticsIsoDate(query.from);
	const rawTo = parseAnalyticsIsoDate(query.to);
	if (rawFrom && rawTo) {
		const from = rawFrom <= rawTo ? rawFrom : rawTo;
		const to = rawFrom <= rawTo ? rawTo : rawFrom;
		const days = analyticsInclusiveDays(from, to);
		if (days >= 1 && days <= ANALYTICS_MAX_CUSTOM_DAYS) {
			return {
				kind: 'custom' as const,
				days,
				from,
				to,
				location_id: locationId,
				professional_id: professionalId,
			};
		}
	}

	return {
		kind: 'preset' as const,
		days: normalizeChartWindow(query.days),
		from: null,
		to: null,
		location_id: locationId,
		professional_id: professionalId,
	};
};

test('normalizeAnalyticsQuery acepta 7 / 15 / 30 y rango custom', () => {
	assert.deepEqual(normalizeAnalyticsQuery({ days: '15', location_id: '4' }), {
		kind: 'preset',
		days: 15,
		from: null,
		to: null,
		location_id: 4,
		professional_id: null,
	});
	assert.equal(normalizeAnalyticsQuery({ days: '9' }).days, 7);
	assert.equal(normalizeAnalyticsQuery({ days: '30' }).days, 30);
	assert.equal(normalizeAnalyticsQuery({ location_id: '0' }).location_id, null);

	assert.deepEqual(normalizeAnalyticsQuery({ from: '2026-09-01', to: '2026-09-10' }), {
		kind: 'custom',
		days: 10,
		from: '2026-09-01',
		to: '2026-09-10',
		location_id: null,
		professional_id: null,
	});
	assert.equal(normalizeAnalyticsQuery({ from: '2026-09-10', to: '2026-09-01' }).from, '2026-09-01');
	assert.equal(normalizeAnalyticsQuery({ from: 'nope', to: '2026-09-01' }).kind, 'preset');
	assert.equal(normalizeAnalyticsQuery({ from: '2026-01-01', to: '2026-06-01' }).kind, 'preset');
	assert.equal(parseAnalyticsIsoDate('2026-02-30'), null);
	assert.equal(analyticsInclusiveDays('2026-09-01', '2026-09-01'), 1);
	assert.equal(ANALYTICS_MAX_CUSTOM_DAYS, 90);
});

test('fillAppointmentsByDay cubre un rango custom inclusive', () => {
	const series = fillAppointmentsByDay([{ date: '2026-09-02', count: 3 }], {
		startDate: '2026-09-01',
		endDate: '2026-09-03',
	});
	assert.deepEqual(series, [
		{ date: '2026-09-01', count: 0 },
		{ date: '2026-09-02', count: 3 },
		{ date: '2026-09-03', count: 0 },
	]);
});

test('HAS-50: Dashboard ya no monta el gráfico 7/15/30', () => {
	const dashboard = readFileSync(new URL('../src/pages/panel/dashboard.astro', import.meta.url), 'utf8');
	assert.doesNotMatch(dashboard, /data-day-chart/);
	assert.doesNotMatch(dashboard, /DASHBOARD_CHART_WINDOWS/);
	assert.match(dashboard, /Próximas citas/);
	assert.match(dashboard, /Por confirmar/);
	assert.match(dashboard, /data-dashboard-today-metrics/);

	const analiticas = readFileSync(new URL('../src/pages/panel/analiticas.astro', import.meta.url), 'utf8');
	assert.match(analiticas, /data-day-chart/);
	assert.match(analiticas, /Citas por estado/);
	assert.match(analiticas, /Inasistencias/);
	assert.match(analiticas, /Por sucursal/);
	assert.match(analiticas, /Señas del período/);
	assert.match(analiticas, /Personalizado/);
	assert.match(analiticas, /name="from"/);
	assert.doesNotMatch(analiticas, /Próximas citas/);
});

test('HAS-65/67: barras de estado, layout paint y filtros móvil', () => {
	const analiticas = readFileSync(new URL('../src/pages/panel/analiticas.astro', import.meta.url), 'utf8');
	const styles = readFileSync(new URL('../src/styles/analiticas.css', import.meta.url), 'utf8');
	const script = readFileSync(new URL('../src/scripts/analiticas-page.ts', import.meta.url), 'utf8');

	assert.match(analiticas, /data-status-bars/);
	assert.match(analiticas, /analiticas-bar--\$\{item\.key\}/);
	assert.match(analiticas, /analiticas-grid--paint/);
	assert.match(analiticas, /analiticas-stack/);
	assert.match(analiticas, /data-analytics-filters-open/);
	assert.match(analiticas, /data-analytics-filters-sheet/);
	assert.match(analiticas, /analiticas-payments__stat/);
	assert.doesNotMatch(analiticas, /analiticas-status__item/);
	assert.doesNotMatch(analiticas, /analiticas-payments__item/);

	assert.match(styles, /analiticas-grid--paint/);
	assert.match(styles, /analiticas-filters__toggle/);
	assert.match(styles, /analiticas-filters-sheet\.is-open/);
	assert.doesNotMatch(styles, /analiticas-status__item/);
	assert.doesNotMatch(styles, /analiticas-payments__item/);

	assert.match(script, /data-analytics-filters-open/);
	assert.match(script, /bindAnalyticsFilterSheet/);
});

test('HAS-102: desktop paint grid 50/50 alineado con split', () => {
	const styles = readFileSync(new URL('../src/styles/analiticas.css', import.meta.url), 'utf8');
	assert.match(styles, /@media \(min-width: 720px\)/);
	assert.match(styles, /analiticas-grid--paint \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
	assert.match(styles, /analiticas-grid--split \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
	assert.doesNotMatch(styles, /1\.15fr|0\.95fr/);
});

test('HAS-50: capability analytics.view está cableada al menú y BFF', () => {
	assert.equal(CAPABILITIES.ANALYTICS_VIEW, 'analytics.view');
	assert.ok(defaultCapabilitiesForRole(ROLES.ADMIN).includes(CAPABILITIES.ANALYTICS_VIEW));
	assert.equal(defaultCapabilitiesForRole(ROLES.RECEPCIONISTA).includes(CAPABILITIES.ANALYTICS_VIEW), false);
	assert.equal(defaultCapabilitiesForRole(ROLES.PROFESIONAL).includes(CAPABILITIES.ANALYTICS_VIEW), false);

	const nav = readFileSync(new URL('../src/components/SideNav.astro', import.meta.url), 'utf8');
	assert.match(nav, /\/panel\/analiticas/);
	assert.match(nav, /Analíticas/);
	const api = readFileSync(new URL('../src/pages/api/analytics.ts', import.meta.url), 'utf8');
	assert.match(api, /CAPABILITIES\.ANALYTICS_VIEW/);
	assert.match(api, /getAnalyticsWithOrds/);
	const lib = readFileSync(new URL('../src/lib/analytics.ts', import.meta.url), 'utf8');
	assert.match(lib, /\/dashboard\/analytics/);
	assert.match(lib, /from_date/);
});
