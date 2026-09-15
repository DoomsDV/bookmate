import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
	CALENDAR_NEW_APPOINTMENT_HREF,
	CUSTOMERS_LIST_HREF,
	CUSTOMERS_NEW_HREF,
	PUBLIC_PROFILE_EDITOR_HREF,
	consumePanelNewQuery,
	resolveDashboardHubHref,
	resolveNewCustomerHref,
	withCurrentLocation,
} from '../src/lib/dashboard-quick-actions.ts';

const dashboard = readFileSync(new URL('../src/pages/panel/dashboard.astro', import.meta.url), 'utf8');
const quickActions = readFileSync(
	new URL('../src/components/DashboardQuickActions.astro', import.meta.url),
	'utf8'
);
const analiticas = readFileSync(new URL('../src/pages/panel/analiticas.astro', import.meta.url), 'utf8');
const sideNav = readFileSync(new URL('../src/components/SideNav.astro', import.meta.url), 'utf8');
const calendarManager = readFileSync(
	new URL('../src/scripts/calendar/calendar-manager.ts', import.meta.url),
	'utf8'
);
const customersPage = readFileSync(new URL('../src/scripts/customers-page.ts', import.meta.url), 'utf8');

test('HAS-55: Dashboard monta accesos rápidos sin tocar KPIs ni próximas citas', () => {
	assert.match(dashboard, /DashboardQuickActions/);
	assert.match(dashboard, /CALENDAR_NEW_APPOINTMENT_HREF/);
	assert.match(dashboard, /resolveDashboardHubHref/);
	assert.match(dashboard, /<SideNav currentPath=\{Astro\.url\.pathname\} \/>/);

	assert.match(dashboard, /dashboard-profit-card--simple/);
	assert.match(dashboard, />Hoy</);
	assert.match(dashboard, />Por confirmar</);
	assert.match(dashboard, />Este mes</);
	assert.match(dashboard, />Nuevos</);
	assert.match(dashboard, />Próximas citas</);
	assert.match(dashboard, /id="dashboard-upcoming-appointments"/);

	assert.doesNotMatch(dashboard, /data-day-chart/);
	assert.doesNotMatch(dashboard, /alertas del día/);
	assert.doesNotMatch(dashboard, /KPIs extra/);
});

test('HAS-55: el bloque usa estilo Hasel e iconos Material', () => {
	assert.match(quickActions, /data-dashboard-quick-actions/);
	assert.match(quickActions, /Accesos rápidos/);
	assert.match(quickActions, /Nueva cita/);
	assert.match(quickActions, /Nuevo cliente/);
	assert.match(quickActions, /Ver hub/);
	assert.match(quickActions, /Página pública/);
	assert.match(quickActions, /calendar_add_on/);
	assert.match(quickActions, /person_add/);
	assert.match(quickActions, /public/);
	assert.match(quickActions, /material-symbols-rounded/);
	assert.match(quickActions, /open_in_new/);
	assert.doesNotMatch(quickActions, /→/);
	assert.doesNotMatch(quickActions, /&rarr;/);
});

test('HAS-55: calendar y clientes abren el flujo new=1', () => {
	assert.match(calendarManager, /applyNewAppointmentFromUrl/);
	assert.match(calendarManager, /consumePanelNewQuery/);
	assert.match(calendarManager, /handleOpenCreateModal/);
	assert.match(customersPage, /applyNewCustomerFromUrl/);
	assert.match(customersPage, /consumePanelNewQuery/);
	assert.match(customersPage, /openCreateCustomerModal/);
});

test('HAS-55: no toca Analíticas ni reemplaza SideNav', () => {
	assert.doesNotMatch(analiticas, /data-dashboard-quick-actions/);
	assert.doesNotMatch(analiticas, /Accesos rápidos/);
	assert.match(analiticas, /data-day-chart/);
	assert.match(sideNav, /\/panel\/dashboard/);
	assert.match(sideNav, /\/panel\/calendar/);
	assert.match(sideNav, /\/panel\/customers/);
});

test('consumePanelNewQuery abre el flujo new=1 y limpia la query', () => {
	assert.deepEqual(consumePanelNewQuery('?new=1'), { shouldOpen: true, nextSearch: '' });
	assert.deepEqual(consumePanelNewQuery('new=1&page=2'), {
		shouldOpen: true,
		nextSearch: 'page=2',
	});
	assert.deepEqual(consumePanelNewQuery('?page=2'), { shouldOpen: false, nextSearch: 'page=2' });
	assert.deepEqual(consumePanelNewQuery(''), { shouldOpen: false, nextSearch: '' });
});

test('resuelve hrefs de cita, cliente y hub público', () => {
	assert.equal(CALENDAR_NEW_APPOINTMENT_HREF, '/panel/calendar?new=1');
	assert.equal(resolveNewCustomerHref(true), CUSTOMERS_NEW_HREF);
	assert.equal(resolveNewCustomerHref(false), CUSTOMERS_LIST_HREF);
	assert.deepEqual(resolveDashboardHubHref('', 'https://hasel.app'), {
		href: PUBLIC_PROFILE_EDITOR_HREF,
		external: false,
	});
	assert.deepEqual(resolveDashboardHubHref('consultorio-demo', 'https://hasel.app'), {
		href: 'https://hasel.app/consultorio-demo',
		external: true,
	});
	assert.equal(withCurrentLocation('/panel/calendar', '', ''), '/panel/calendar');
	assert.equal(withCurrentLocation('/panel/customers', 'new=1', '#top'), '/panel/customers?new=1#top');
});
