import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
	CAPABILITIES,
	CAPABILITY_ROUTES,
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
	assert.ok(admin.includes(CAPABILITIES.ANALYTICS_VIEW));
});

test('HAS-50: Analíticas es Admin por default y queda fuera de recepción/profesional', () => {
	assert.equal(reception.includes(CAPABILITIES.ANALYTICS_VIEW), false);
	assert.equal(pro.includes(CAPABILITIES.ANALYTICS_VIEW), false);
	assert.ok(canAccessPathWithCapabilities('/panel/analiticas', admin, ROLES.ADMIN));
	assert.ok(canAccessPathWithCapabilities('/api/analytics', admin, ROLES.ADMIN));
	assert.equal(canAccessPathWithCapabilities('/panel/analiticas', reception, ROLES.RECEPCIONISTA), false);
	assert.equal(canAccessPathWithCapabilities('/panel/analiticas', pro, ROLES.PROFESIONAL), false);
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

test('Import CSV comparte customers.create con el alta (no un capability nuevo)', () => {
	const importCapability = CAPABILITIES.CUSTOMERS_CREATE;
	assert.equal(importCapability, 'customers.create');
	assert.ok(isCapabilityGranted(admin, importCapability));
	assert.ok(isCapabilityGranted(reception, importCapability));
	assert.equal(isCapabilityGranted(pro, importCapability), false);

	const receptionWithoutCreate = reception.filter((code) => code !== importCapability);
	assert.equal(isCapabilityGranted(receptionWithoutCreate, importCapability), false);

	const proWithCreate = [...pro, importCapability];
	assert.ok(isCapabilityGranted(proWithCreate, importCapability));
});

test('El gate de import lanza 403 sin customers.create (mismo helper que el alta)', () => {
	class CustomersApiError extends Error {
		status: number;
		constructor(message: string, status = 400) {
			super(message);
			this.status = status;
		}
	}

	const requireCapability = (
		locals: { roleId?: number; capabilities?: readonly string[] },
		code: string,
		createError: (message: string, status: number) => Error,
		message: string
	) => {
		if (!isCapabilityGranted(locals.capabilities, code, Number(locals.roleId || 0))) {
			throw createError(message, 403);
		}
	};

	const deny = (locals: { roleId?: number; capabilities?: readonly string[] }) =>
		assert.throws(
			() =>
				requireCapability(
					locals,
					CAPABILITIES.CUSTOMERS_CREATE,
					(message, status) => new CustomersApiError(message, status),
					'No tienes permisos para importar clientes.'
				),
			(error: unknown) =>
				error instanceof CustomersApiError &&
				error.status === 403 &&
				error.message === 'No tienes permisos para importar clientes.'
		);

	const allow = (locals: { roleId?: number; capabilities?: readonly string[] }) =>
		assert.doesNotThrow(() =>
			requireCapability(
				locals,
				CAPABILITIES.CUSTOMERS_CREATE,
				(message, status) => new CustomersApiError(message, status),
				'No tienes permisos para importar clientes.'
			)
		);

	deny({ roleId: 2, capabilities: pro });
	deny({ roleId: 3, capabilities: reception.filter((code) => code !== CAPABILITIES.CUSTOMERS_CREATE) });
	deny({ roleId: 1, capabilities: [] });
	allow({ roleId: 1, capabilities: admin });
	allow({ roleId: 3, capabilities: reception });
	allow({ roleId: 2, capabilities: [...pro, CAPABILITIES.CUSTOMERS_CREATE] });
});

test('POST /api/customers/import usa requireCapability(customers.create), no roles hardcodeados', () => {
	const src = readFileSync(new URL('../src/pages/api/customers/import.ts', import.meta.url), 'utf8');
	assert.match(src, /requireCapability/);
	assert.match(src, /CAPABILITIES\.CUSTOMERS_CREATE/);
	assert.doesNotMatch(src, /ROLES\.ADMIN/);
	assert.doesNotMatch(src, /ROLES\.RECEPCIONISTA/);
});

test('UI de import CSV se oculta con la misma capability que crear', () => {
	const page = readFileSync(new URL('../src/pages/panel/customers.astro', import.meta.url), 'utf8');
	const script = readFileSync(new URL('../src/scripts/customers-page.ts', import.meta.url), 'utf8');
	assert.match(page, /canImportCustomers = canCreateCustomer/);
	assert.match(page, /canImportCustomers \? \(/);
	assert.match(page, /data-open-import-customers/);
	assert.match(script, /canImportCustomers\(\)/);
	assert.match(script, /HaselPermissions\.has\('customers\.create'\)/);
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

test('HAS-8: /panel/ops y /api/ops no existen en el producto Hasel', () => {
	assert.equal(
		CAPABILITY_ROUTES.some((rule) => rule.path === '/panel/ops' || rule.path.startsWith('/api/ops')),
		false
	);

	const rolesSrc = readFileSync(new URL('../src/config/roles.ts', import.meta.url), 'utf8');
	assert.doesNotMatch(rolesSrc, /\/panel\/ops/);
	assert.doesNotMatch(rolesSrc, /\/api\/ops/);

	assert.equal(existsSync(new URL('../src/pages/panel/ops.astro', import.meta.url)), false);
	assert.equal(existsSync(new URL('../src/scripts/ops-page.ts', import.meta.url)), false);
	assert.equal(existsSync(new URL('../src/lib/ops.ts', import.meta.url)), false);
	assert.equal(existsSync(new URL('../src/pages/api/ops', import.meta.url)), false);

	const navSrc = readFileSync(new URL('../src/components/SideNav.astro', import.meta.url), 'utf8');
	assert.doesNotMatch(navSrc, /\/panel\/ops/);
	assert.doesNotMatch(navSrc, /HASEL_OPS_USER_IDS/);
});

test('calendar.view no alcanza para mutar citas (403)', () => {
	assert.equal(isCapabilityGranted([CAPABILITIES.CALENDAR_VIEW], CAPABILITIES.CALENDAR_MANAGE), false);
	assert.ok(canAccessPathWithCapabilities('/api/appointments', [CAPABILITIES.CALENDAR_VIEW], ROLES.PROFESIONAL));
	const locals = { capabilities: [CAPABILITIES.CALENDAR_VIEW] };
	const denied = !isCapabilityGranted(locals.capabilities, CAPABILITIES.CALENDAR_MANAGE);
	assert.equal(denied, true);
});
