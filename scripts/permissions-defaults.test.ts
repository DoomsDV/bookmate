import assert from 'node:assert/strict';
import test from 'node:test';

import {
	CAPABILITIES,
	SAFE_FALLBACK_CAPABILITIES,
	canAccessPathWithCapabilities,
	defaultCapabilitiesForRole,
	isCapabilityGranted,
} from '../src/config/capabilities.ts';

const ROLES = { ADMIN: 1, PROFESIONAL: 2, RECEPCIONISTA: 3 } as const;

const admin = defaultCapabilitiesForRole(ROLES.ADMIN);
const reception = defaultCapabilitiesForRole(ROLES.RECEPCIONISTA);
const pro = defaultCapabilitiesForRole(ROLES.PROFESIONAL);

test('Admin tiene el catálogo completo incluido permissions.manage', () => {
	assert.ok(admin.includes(CAPABILITIES.PERMISSIONS_MANAGE));
	assert.ok(admin.includes(CAPABILITIES.LOCATIONS_MANAGE));
	assert.ok(admin.includes(CAPABILITIES.CUSTOMERS_CREATE));
	assert.ok(admin.includes(CAPABILITIES.PLAN_MANAGE));
});

test('Recepcionista ve sucursales pero no las edita', () => {
	assert.ok(reception.includes(CAPABILITIES.LOCATIONS_VIEW));
	assert.equal(reception.includes(CAPABILITIES.LOCATIONS_MANAGE), false);
	assert.ok(canAccessPathWithCapabilities('/panel/locations', reception, ROLES.RECEPCIONISTA));
});

test('Recepcionista crea clientes; profesional no', () => {
	assert.ok(reception.includes(CAPABILITIES.CUSTOMERS_CREATE));
	assert.ok(reception.includes(CAPABILITIES.CUSTOMERS_EDIT));
	assert.equal(pro.includes(CAPABILITIES.CUSTOMERS_CREATE), false);
	assert.equal(pro.includes(CAPABILITIES.CUSTOMERS_EDIT), false);
	assert.ok(pro.includes(CAPABILITIES.CUSTOMERS_VIEW));
});

test('Profesional no entra a cobros, sucursales ni plan', () => {
	assert.equal(canAccessPathWithCapabilities('/panel/cobros', pro, ROLES.PROFESIONAL), false);
	assert.equal(canAccessPathWithCapabilities('/panel/locations', pro, ROLES.PROFESIONAL), false);
	assert.equal(canAccessPathWithCapabilities('/panel/plan', pro, ROLES.PROFESIONAL), false);
	assert.ok(canAccessPathWithCapabilities('/panel/customers', pro, ROLES.PROFESIONAL));
});

test('Apagar customers.create en recepción bloquea la capability', () => {
	const tightened = reception.filter((code) => code !== CAPABILITIES.CUSTOMERS_CREATE);
	assert.equal(isCapabilityGranted(tightened, CAPABILITIES.CUSTOMERS_CREATE), false);
	assert.ok(isCapabilityGranted(tightened, CAPABILITIES.CUSTOMERS_VIEW));
});

test('Rutas sin mapping quedan abiertas (inbox, profile, subscription read)', () => {
	assert.equal(canAccessPathWithCapabilities('/api/inbox', pro, ROLES.PROFESIONAL), true);
	assert.equal(canAccessPathWithCapabilities('/api/subscription', reception, ROLES.RECEPCIONISTA), true);
	assert.equal(canAccessPathWithCapabilities('/api/profile/sessions', pro, ROLES.PROFESIONAL), true);
});

test('Apagar locations.view oculta Sucursales para recepción', () => {
	const tightened = reception.filter((code) => code !== CAPABILITIES.LOCATIONS_VIEW);
	assert.equal(canAccessPathWithCapabilities('/panel/locations', tightened, ROLES.RECEPCIONISTA), false);
	assert.equal(canAccessPathWithCapabilities('/api/locations', tightened, ROLES.RECEPCIONISTA), false);
});

test('Fail-closed: sin lista de capabilities no se otorgan defaults de rol', () => {
	assert.equal(isCapabilityGranted(undefined, CAPABILITIES.CUSTOMERS_CREATE, ROLES.ADMIN), false);
	assert.equal(isCapabilityGranted(undefined, CAPABILITIES.LOCATIONS_MANAGE, ROLES.ADMIN), false);
	assert.equal(isCapabilityGranted(undefined, CAPABILITIES.CALENDAR_MANAGE, ROLES.RECEPCIONISTA), false);
	assert.equal(canAccessPathWithCapabilities('/panel/locations', undefined, ROLES.ADMIN), false);
});

test('Fail-closed: fallback seguro no incluye manage/create', () => {
	assert.ok(SAFE_FALLBACK_CAPABILITIES.includes(CAPABILITIES.DASHBOARD_VIEW));
	assert.equal(SAFE_FALLBACK_CAPABILITIES.includes(CAPABILITIES.CALENDAR_MANAGE), false);
	assert.equal(SAFE_FALLBACK_CAPABILITIES.includes(CAPABILITIES.CUSTOMERS_CREATE), false);
	assert.equal(SAFE_FALLBACK_CAPABILITIES.includes(CAPABILITIES.PERMISSIONS_MANAGE), false);
	assert.equal(
		canAccessPathWithCapabilities('/api/appointments', SAFE_FALLBACK_CAPABILITIES, ROLES.ADMIN),
		false
	);
});

test('calendar.view no alcanza para mutar citas (403)', () => {
	assert.equal(isCapabilityGranted([CAPABILITIES.CALENDAR_VIEW], CAPABILITIES.CALENDAR_MANAGE), false);
	assert.ok(canAccessPathWithCapabilities('/api/appointments', [CAPABILITIES.CALENDAR_VIEW], ROLES.PROFESIONAL));
	const locals = { capabilities: [CAPABILITIES.CALENDAR_VIEW] };
	const denied = !isCapabilityGranted(locals.capabilities, CAPABILITIES.CALENDAR_MANAGE);
	assert.equal(denied, true);
});
