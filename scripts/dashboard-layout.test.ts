import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync(new URL('../src/pages/panel/dashboard.astro', import.meta.url), 'utf8');
const quickActions = readFileSync(
	new URL('../src/components/DashboardQuickActions.astro', import.meta.url),
	'utf8'
);

const markupStart = dashboard.indexOf('data-dashboard-main');
const markup = dashboard.slice(markupStart, dashboard.indexOf('id="dashboard-upcoming-appointments"') + 80);

const indexOf = (source: string, pattern: string | RegExp) => {
	if (typeof pattern === 'string') return source.indexOf(pattern);
	const match = source.match(pattern);
	return match?.index ?? -1;
};

test('HAS-103: orden KPI → Resumen → Accesos → Alertas → Próximas', () => {
	const hoyIdx = indexOf(markup, '>Hoy<');
	const resumenIdx = indexOf(markup, 'data-ai-summary-card');
	const accesosIdx = indexOf(markup, 'DashboardQuickActions');
	const alertasIdx = indexOf(markup, 'DashboardAlerts');
	const proximasIdx = indexOf(markup, 'id="dashboard-upcoming-appointments"');

	assert.ok(hoyIdx > 0, 'KPI Hoy presente');
	assert.ok(resumenIdx > hoyIdx, 'Resumen va después de las 4 cards');
	assert.ok(accesosIdx > resumenIdx, 'Accesos va después de Resumen');
	assert.ok(alertasIdx > accesosIdx, 'Alertas va después de Accesos');
	assert.ok(proximasIdx > alertasIdx, 'Próximas va después de Alertas');
});

test('HAS-103: chips Esta semana / Señas quedan en código pero ocultos', () => {
	assert.match(dashboard, /SHOW_TODAY_METRIC_CHIPS = false/);
	assert.match(dashboard, /hidden=\{!SHOW_TODAY_METRIC_CHIPS\}/);
	assert.match(dashboard, />Esta semana</);
	assert.match(dashboard, />Señas por cobrar</);
	assert.match(dashboard, /data-dashboard-today-metrics/);
	assert.match(dashboard, /\.dashboard-today-metrics\[hidden\] \{\s*display: none !important;/);
});

test('HAS-104: Nueva cita y Nuevo cliente tienen flecha de esquina; Ver hub no cambia', () => {
	const appointment = quickActions.slice(
		quickActions.indexOf('data-quick-action="appointment"'),
		quickActions.indexOf('data-quick-action="customer"')
	);
	const customer = quickActions.slice(
		quickActions.indexOf('data-quick-action="customer"'),
		quickActions.indexOf('data-quick-action="hub"')
	);
	const hub = quickActions.slice(quickActions.indexOf('data-quick-action="hub"'));

	assert.match(appointment, /arrow_outward/);
	assert.match(appointment, /dashboard-quick-actions__external/);
	assert.match(customer, /arrow_outward/);
	assert.match(customer, /dashboard-quick-actions__external/);
	assert.match(hub, /hubExternal/);
	assert.match(hub, /open_in_new/);
	assert.doesNotMatch(hub, /arrow_outward/);
	assert.match(quickActions, /href=\{newAppointmentHref\}/);
	assert.match(quickActions, /href=\{newCustomerHref\}/);
	assert.match(quickActions, /href=\{hubHref\}/);
});

test('HAS-105: título Próximas citas afuera, Siguientes 7 días adentro', () => {
	assert.match(dashboard, /<section class="dashboard-upcoming" aria-label="Próximas citas">/);
	assert.match(dashboard, /<h2 class="dashboard-upcoming-title">Próximas citas<\/h2>/);
	assert.match(dashboard, /id="dashboard-upcoming-appointments"/);
	assert.match(dashboard, /data-week-subtitle>Siguientes 7 días/);
	assert.match(dashboard, /dashboard-upcoming-create-cta/);
	assert.match(dashboard, /data-week-glance/);

	const titleIdx = dashboard.indexOf('<h2 class="dashboard-upcoming-title">Próximas citas</h2>');
	const shellIdx = dashboard.indexOf('id="dashboard-upcoming-appointments"');
	const subtitleIdx = dashboard.indexOf('data-week-subtitle>Siguientes 7 días');
	assert.ok(titleIdx > 0 && titleIdx < shellIdx, 'título queda fuera del card');
	assert.ok(subtitleIdx > shellIdx, 'Siguientes 7 días queda dentro del card');

	assert.match(dashboard, /\.dashboard-upcoming-title \{/);
	assert.match(dashboard, /font-size: 1\.05rem;/);
});
