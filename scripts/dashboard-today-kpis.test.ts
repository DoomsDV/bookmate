import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
	extrasFromKpis,
	formatConfirmedPending,
	formatDepositCaption,
	formatTodayCaption,
	formatWeekCaption,
} from '../src/lib/dashboard-today-kpis.ts';

const dashboard = readFileSync(new URL('../src/pages/panel/dashboard.astro', import.meta.url), 'utf8');
const analiticas = readFileSync(new URL('../src/pages/panel/analiticas.astro', import.meta.url), 'utf8');
const dashboardLib = readFileSync(new URL('../src/lib/dashboard.ts', import.meta.url), 'utf8');

test('HAS-56: Dashboard suma números extra sin reemplazar las 4 cards ni próximas citas', () => {
	assert.match(dashboard, /data-dashboard-today-metrics/);
	assert.match(dashboard, /dashboard-today-metrics/);
	assert.match(dashboard, />Esta semana</);
	assert.match(dashboard, />Señas por cobrar</);
	assert.match(dashboard, /formatTodayCaption/);
	assert.match(dashboard, /Números de hoy y esta semana/);

	assert.match(dashboard, /dashboard-profit-card--simple/);
	assert.match(dashboard, />Hoy</);
	assert.match(dashboard, />Por confirmar</);
	assert.match(dashboard, />Este mes</);
	assert.match(dashboard, />Nuevos</);
	assert.match(dashboard, />Próximas citas</);
	assert.match(dashboard, /id="dashboard-upcoming-appointments"/);

	assert.doesNotMatch(dashboard, /data-day-chart/);
	assert.doesNotMatch(dashboard, /DASHBOARD_CHART_WINDOWS/);
	assert.doesNotMatch(dashboard, /KPIs extra/);
	assert.match(dashboard, /DashboardAlerts/);
	assert.match(dashboard, /DashboardQuickActions/);

	const hoyIdx = dashboard.indexOf('>Hoy<');
	const extrasIdx = dashboard.indexOf('data-dashboard-today-metrics');
	const upcomingIdx = dashboard.indexOf('id="dashboard-upcoming-appointments"');
	assert.ok(hoyIdx > 0 && extrasIdx > hoyIdx && extrasIdx < upcomingIdx);
});

test('HAS-56: nada de esto va a Analíticas', () => {
	assert.doesNotMatch(analiticas, /data-dashboard-today-metrics/);
	assert.doesNotMatch(analiticas, />Esta semana</);
	assert.doesNotMatch(analiticas, />Señas por cobrar</);
	assert.doesNotMatch(analiticas, /dashboard-today-metrics/);
	assert.match(analiticas, /data-day-chart/);
	assert.match(analiticas, /Señas del período/);
});

test('HAS-56: el BFF acepta los números extra del GET /dashboard', () => {
	assert.match(dashboardLib, /today_confirmed_appointments/);
	assert.match(dashboardLib, /today_pending_appointments/);
	assert.match(dashboardLib, /week_appointments/);
	assert.match(dashboardLib, /week_confirmed_appointments/);
	assert.match(dashboardLib, /week_pending_appointments/);
	assert.match(dashboardLib, /pending_deposits_count/);
	assert.match(dashboardLib, /pending_deposits_amount/);
	assert.doesNotMatch(dashboardLib, /\/dashboard\/analytics/);
});

test('formatea confirmadas vs pendientes y el fallback de API vieja', () => {
	assert.equal(formatConfirmedPending(2, 1), '2 confirmadas · 1 pendiente');
	assert.equal(formatConfirmedPending(1, 0), '1 confirmada · 0 pendientes');
	assert.equal(formatTodayCaption({ today_appointments: 0 }), 'Sin turnos');
	assert.equal(
		formatTodayCaption({ today_appointments: 3 }),
		'3 turnos'
	);
	assert.equal(
		formatTodayCaption({
			today_appointments: 3,
			today_confirmed_appointments: 2,
			today_pending_appointments: 1,
		}),
		'2 confirmadas · 1 pendiente'
	);
	assert.equal(
		formatWeekCaption({
			today_appointments: 1,
			week_appointments: 0,
		}),
		'Sin citas esta semana'
	);
	assert.equal(
		formatWeekCaption({
			today_appointments: 1,
			week_appointments: 4,
			week_confirmed_appointments: 3,
			week_pending_appointments: 1,
		}),
		'3 confirmadas · 1 pendiente'
	);
});

test('formatea señas por cobrar como conteo o monto simple', () => {
	assert.equal(formatDepositCaption({ today_appointments: 0 }), 'Nada por cobrar');
	assert.equal(
		formatDepositCaption({
			today_appointments: 1,
			pending_deposits_count: 2,
			pending_deposits_amount: 0,
		}),
		'2 señas pendientes'
	);
	assert.equal(
		formatDepositCaption({
			today_appointments: 1,
			pending_deposits_count: 1,
			pending_deposits_amount: 150000,
		}),
		'Gs. 150.000'
	);
	assert.deepEqual(
		extrasFromKpis({
			today_appointments: 2,
			today_confirmed_appointments: 1,
			today_pending_appointments: 1,
			week_appointments: 5,
			pending_deposits_count: 3,
			pending_deposits_amount: 90000.4,
		}),
		{
			todayAppointments: 2,
			todayConfirmed: 1,
			todayPending: 1,
			weekAppointments: 5,
			weekConfirmed: 0,
			weekPending: 0,
			pendingDepositsCount: 3,
			pendingDepositsAmount: 90000.4,
			hasTodaySplit: true,
		}
	);
});
