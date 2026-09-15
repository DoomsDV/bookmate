import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
	COBROS_HREF,
	DASHBOARD_ALERTS_MAX,
	LOCATIONS_HREF,
	PERSONAL_HREF,
	SCHEDULES_HREF,
	SERVICES_HREF,
	buildDashboardAlerts,
	type DashboardAlertsInput,
} from '../src/lib/dashboard-alerts.ts';

const dashboard = readFileSync(new URL('../src/pages/panel/dashboard.astro', import.meta.url), 'utf8');
const alertsComponent = readFileSync(
	new URL('../src/components/DashboardAlerts.astro', import.meta.url),
	'utf8'
);
const analiticas = readFileSync(new URL('../src/pages/panel/analiticas.astro', import.meta.url), 'utf8');
const sideNav = readFileSync(new URL('../src/components/SideNav.astro', import.meta.url), 'utf8');

const caps = {
	canViewProfessionals: true,
	canViewCobros: true,
	canViewServices: true,
	canViewLocations: true,
	canViewSchedules: true,
} as const;

const emptyInput = (overrides: Partial<DashboardAlertsInput> = {}): DashboardAlertsInput => ({
	...caps,
	staffTotalCount: 2,
	staffIncompleteCount: 0,
	pendingPaymentsCount: 0,
	serviceCount: 3,
	locationCount: 1,
	hasAnySchedule: true,
	...overrides,
});

test('HAS-54: Dashboard monta alertas sin tocar KPIs ni próximas citas', () => {
	assert.match(dashboard, /DashboardAlerts/);
	assert.match(dashboard, /buildDashboardAlerts/);
	assert.match(dashboard, /collectDashboardAlertSources/);
	assert.match(dashboard, /dashboard-alerts-sources/);
	assert.match(dashboard, /<SideNav currentPath=\{Astro\.url\.pathname\} \/>/);

	assert.match(dashboard, /dashboard-profit-card--simple/);
	assert.match(dashboard, />Hoy</);
	assert.match(dashboard, />Por confirmar</);
	assert.match(dashboard, />Este mes</);
	assert.match(dashboard, />Nuevos</);
	assert.match(dashboard, />Próximas citas</);
	assert.match(dashboard, /id="dashboard-upcoming-appointments"/);

	assert.doesNotMatch(dashboard, /data-day-chart/);
	assert.doesNotMatch(dashboard, /KPIs extra/);
});

test('HAS-54: el bloque usa mensaje ES-419, CTA e iconos Material', () => {
	assert.match(alertsComponent, /data-dashboard-alerts/);
	assert.match(alertsComponent, />Alertas</);
	assert.match(alertsComponent, /data-dashboard-alert-cta/);
	assert.match(alertsComponent, /material-symbols-rounded/);
	assert.doesNotMatch(alertsComponent, /→/);
	assert.doesNotMatch(alertsComponent, /&rarr;/);
	assert.match(alertsComponent, /alerts\.length > 0/);
});

test('HAS-54: no toca Analíticas ni reemplaza SideNav', () => {
	assert.doesNotMatch(analiticas, /data-dashboard-alerts/);
	assert.doesNotMatch(analiticas, />Alertas</);
	assert.match(analiticas, /data-day-chart/);
	assert.match(sideNav, /\/panel\/dashboard/);
	assert.match(sideNav, /\/panel\/cobros/);
	assert.match(sideNav, /\/panel\/professionals/);
});

test('oculta el bloque cuando no hay alertas', () => {
	assert.deepEqual(buildDashboardAlerts(emptyInput()), []);
});

test('arma foto/bio, cobros y setup incompleto con CTA al módulo', () => {
	const alerts = buildDashboardAlerts(
		emptyInput({
			staffIncompleteCount: 2,
			pendingPaymentsCount: 3,
			serviceCount: 0,
			locationCount: 0,
			hasAnySchedule: false,
		})
	);

	assert.equal(alerts.length, DASHBOARD_ALERTS_MAX);
	assert.deepEqual(
		alerts.map((alert) => alert.id),
		['pending_payments', 'staff_hub', 'setup_service', 'setup_location', 'setup_schedule']
	);

	const cobros = alerts[0];
	assert.equal(cobros.message, 'Hay 3 señas pendientes de revisar.');
	assert.equal(cobros.ctaLabel, 'Ir a Cobros');
	assert.equal(cobros.href, COBROS_HREF);

	const staff = alerts[1];
	assert.match(staff.message, /foto o bio/);
	assert.equal(staff.ctaLabel, 'Completar en Personal');
	assert.equal(staff.href, PERSONAL_HREF);

	assert.equal(alerts[2].href, SERVICES_HREF);
	assert.equal(alerts[2].ctaLabel, 'Ir a Servicios');
	assert.equal(alerts[3].href, LOCATIONS_HREF);
	assert.equal(alerts[3].ctaLabel, 'Ir a Sucursales');
	assert.equal(alerts[4].href, SCHEDULES_HREF);
	assert.equal(alerts[4].ctaLabel, 'Ir a Horarios');
});

test('respeta capabilities y no lista cobros', () => {
	const alerts = buildDashboardAlerts(
		emptyInput({
			canViewCobros: false,
			pendingPaymentsCount: 8,
			canViewProfessionals: false,
			staffIncompleteCount: 4,
			canViewServices: false,
			serviceCount: 0,
		})
	);

	assert.equal(alerts.some((alert) => alert.id === 'pending_payments'), false);
	assert.equal(alerts.some((alert) => alert.id === 'staff_hub'), false);
	assert.equal(alerts.some((alert) => alert.id === 'setup_service'), false);
	assert.equal(
		alerts.every((alert) => alert.id !== 'pending_payments' || !/cliente/i.test(alert.message)),
		true
	);
});

test('usa singular para una seña o una persona', () => {
	const onePayment = buildDashboardAlerts(emptyInput({ pendingPaymentsCount: 1 }));
	assert.equal(onePayment[0]?.message, 'Hay 1 seña pendiente de revisar.');

	const oneStaff = buildDashboardAlerts(emptyInput({ staffIncompleteCount: 1 }));
	assert.equal(
		oneStaff[0]?.message,
		'1 persona del equipo no aparece en el hub: falta foto o bio.'
	);

	const noStaff = buildDashboardAlerts(emptyInput({ staffTotalCount: 0, staffIncompleteCount: 0 }));
	assert.equal(noStaff[0]?.ctaLabel, 'Ir a Personal');
	assert.match(noStaff[0]?.message ?? '', /Todavía no hay personal/);
});
