import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CAPABILITIES, defaultCapabilitiesForRole } from '../src/config/capabilities.ts';
import { normalizeChartWindow } from '../src/lib/dashboard-chart.ts';

const ROLES = { ADMIN: 1, PROFESIONAL: 2, RECEPCIONISTA: 3 } as const;

const toOptionalId = (value: unknown): number | null => {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return null;
	return parsed;
};

const normalizeAnalyticsQuery = (query: { days?: unknown; location_id?: unknown; professional_id?: unknown }) => ({
	days: normalizeChartWindow(query.days),
	location_id: toOptionalId(query.location_id),
	professional_id: toOptionalId(query.professional_id),
});

test('normalizeAnalyticsQuery acepta solo 7 / 15 / 30', () => {
	assert.deepEqual(normalizeAnalyticsQuery({ days: '15', location_id: '4' }), {
		days: 15,
		location_id: 4,
		professional_id: null,
	});
	assert.equal(normalizeAnalyticsQuery({ days: '9' }).days, 7);
	assert.equal(normalizeAnalyticsQuery({ days: '30' }).days, 30);
	assert.equal(normalizeAnalyticsQuery({ location_id: '0' }).location_id, null);
});

test('HAS-50: Dashboard ya no monta el gráfico 7/15/30', () => {
	const dashboard = readFileSync(new URL('../src/pages/panel/dashboard.astro', import.meta.url), 'utf8');
	assert.doesNotMatch(dashboard, /data-day-chart/);
	assert.doesNotMatch(dashboard, /DASHBOARD_CHART_WINDOWS/);
	assert.match(dashboard, /Próximas citas/);
	assert.match(dashboard, /Por confirmar/);

	const analiticas = readFileSync(new URL('../src/pages/panel/analiticas.astro', import.meta.url), 'utf8');
	assert.match(analiticas, /data-day-chart/);
	assert.match(analiticas, /Citas por estado/);
	assert.match(analiticas, /Inasistencias/);
	assert.match(analiticas, /Por sucursal/);
	assert.match(analiticas, /Señas del período/);
	assert.doesNotMatch(analiticas, /Próximas citas/);
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
});
