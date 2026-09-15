import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CAPABILITIES, CAPABILITY_CATALOG } from '../src/config/capabilities.ts';
import {
	filterPermissionsMatrix,
	matchingRoleIds,
	normalizeSearchText,
	overlayCatalogItemCopy,
	overlayPermissionMatrix,
	permissionRowMatches,
	permissionVisibleCopy,
} from '../src/lib/permissions-matrix-ui.ts';

const catalog = [
	{
		code: 'dashboard.view',
		label: 'Ver dashboard',
		description: 'Acceso al inicio del panel.',
		group_code: 'dashboard',
		group_label: 'Dashboard',
	},
	{
		code: 'calendar.manage',
		label: 'Gestionar calendario',
		description: 'Crear y editar citas.',
		group_code: 'calendar',
		group_label: 'Calendario',
	},
	{
		code: 'customers.view',
		label: 'Ver clientes',
		description: 'Listado y ficha de clientes.',
		group_code: 'customers',
		group_label: 'Clientes',
	},
	{
		code: 'customers.create',
		label: 'Crear clientes',
		description: 'Alta de clientes desde el panel.',
		group_code: 'customers',
		group_label: 'Clientes',
	},
];

const roles = [
	{ role_id: 1, name: 'Admin' },
	{ role_id: 2, name: 'Profesional' },
	{ role_id: 3, name: 'Recepcionista' },
];

test('normalizeSearchText ignora acentos y mayúsculas', () => {
	assert.equal(normalizeSearchText('  Calendario  '), 'calendario');
	assert.equal(normalizeSearchText('RECEPCIÓN'), 'recepcion');
});

test('permissionVisibleCopy solo expone label y descripción', () => {
	const copy = permissionVisibleCopy({
		label: 'Gestionar calendario',
		description: 'Crear y editar citas.',
	});
	assert.deepEqual(copy, {
		label: 'Gestionar calendario',
		description: 'Crear y editar citas.',
	});
	assert.equal(JSON.stringify(copy).includes('calendar.manage'), false);
	assert.equal(JSON.stringify(copy).includes('Acción'), false);
});

test('filtra filas por nombre, descripción o sección', () => {
	assert.equal(permissionRowMatches(catalog[1], 'gestionar'), true);
	assert.equal(permissionRowMatches(catalog[1], 'citas'), true);
	assert.equal(permissionRowMatches(catalog[1], 'calendario'), true);
	assert.equal(permissionRowMatches(catalog[1], 'dashboard'), false);

	const bySection = filterPermissionsMatrix(catalog, roles, 'clientes');
	assert.equal(bySection.empty, false);
	assert.equal(bySection.visibleCount, 2);
	assert.ok(bySection.visibleCodes?.has('customers.view'));
	assert.ok(bySection.visibleCodes?.has('customers.create'));
	assert.equal(bySection.visibleCodes?.has('calendar.manage'), false);
});

test('no usa keys técnicas para filtrar filas', () => {
	const byKey = filterPermissionsMatrix(catalog, roles, 'calendar.manage');
	assert.equal(byKey.empty, true);
	assert.equal(byKey.visibleCount, 0);
});

test('buscar un rol resalta su columna y no oculta filas', () => {
	assert.deepEqual(matchingRoleIds(roles, 'recep'), [3]);
	const byRole = filterPermissionsMatrix(catalog, roles, 'recepcionista');
	assert.equal(byRole.empty, false);
	assert.equal(byRole.visibleCodes, null);
	assert.equal(byRole.visibleCount, catalog.length);
	assert.deepEqual(byRole.highlightRoleIds, [3]);
});

test('query vacío muestra todo y no resalta roles', () => {
	const all = filterPermissionsMatrix(catalog, roles, '   ');
	assert.equal(all.visibleCodes, null);
	assert.deepEqual(all.highlightRoleIds, []);
	assert.equal(all.visibleCount, 4);
	assert.equal(all.empty, false);
});

test('PermissionsPanel no interpola keys ni kind en el copy visible', () => {
	const src = readFileSync(new URL('../src/components/PermissionsPanel.astro', import.meta.url), 'utf8');
	assert.equal(src.includes('${item.code} ·'), false);
	assert.equal(src.includes('${item.code} · ${kind}'), false);
	assert.equal(src.includes('· Acción'), false);
	assert.equal(src.includes('· Menú'), false);
	assert.ok(src.includes('data-code="${item.code}"'), 'las keys siguen en el DOM para guardar');
	assert.ok(src.includes('data-permissions-search'), 'tiene barra de búsqueda');
	assert.ok(src.includes('permissions-section'), 'tiene títulos de sección diferenciados');
});

test('PermissionsPanel usa copy de negocio y Guardar como Negocio (HAS-48, HAS-49)', () => {
	const src = readFileSync(new URL('../src/components/PermissionsPanel.astro', import.meta.url), 'utf8');
	assert.equal(src.includes('roles base'), false);
	assert.equal(src.includes('APIs'), false);
	assert.ok(
		src.includes('vienen de fábrica y no se pueden borrar'),
		'explica roles predefinidos sin jerga'
	);
	assert.ok(src.includes('vale para todo el negocio'), 'habla de negocio, no de organización/APIs');
	assert.ok(src.includes('el menú se actualiza'), 'dice cuándo se ve el cambio');

	const saveIdx = src.indexOf('data-permissions-save');
	assert.ok(saveIdx > 0, 'sigue el botón de guardar');
	const saveBlock = src.slice(saveIdx, src.indexOf('</button>', saveIdx));
	assert.ok(saveBlock.includes('modal-action-primary'), 'mismo estilo que Guardar negocio');
	assert.ok(saveBlock.includes('>save<'), 'ícono Material save');
	assert.ok(saveBlock.includes('Guardar permisos'));
	assert.ok(src.includes("fetch('/api/permissions/matrix'"), 'no cambia el endpoint de guardar');
	assert.ok(src.includes('overlayPermissionMatrix'), 'el copy visible no depende del jerga de ORDS');
	assert.ok(src.includes('class="modal-action-primary"'), 'HAS-49: Guardar sigue como Negocio');
});

const VISIBLE_JARGON = /\b(crud|addons?|checkout|apis?|jwt|ords|payload|entitlement|branding)\b/i;
const MODULE_ACTION_KEY = /\b[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\b/;

test('el catálogo visible no usa jerga interna (HAS-48)', () => {
	for (const item of CAPABILITY_CATALOG) {
		const visible = [item.label, item.description, item.groupLabel].join(' · ');
		assert.equal(VISIBLE_JARGON.test(visible), false, `${item.code}: ${visible}`);
		assert.equal(MODULE_ACTION_KEY.test(visible), false, `${item.code}: key técnica en copy`);
		assert.ok(item.label.trim(), `${item.code} tiene label humano`);
		assert.ok(item.description.trim(), `${item.code} tiene descripción de negocio`);
	}

	assert.equal(CAPABILITIES.ADDONS_VIEW, 'addons.view');
	assert.equal(CAPABILITIES.LOCATIONS_MANAGE, 'locations.manage');
	assert.equal(CAPABILITIES.PLAN_MANAGE, 'plan.manage');
	assert.ok(
		CAPABILITY_CATALOG.some((item) => item.code === 'locations.manage' && item.description.includes('sucursales'))
	);
	assert.ok(
		CAPABILITY_CATALOG.some((item) => item.code === 'addons.manage' && item.description.includes('complementos'))
	);
	assert.ok(
		CAPABILITY_CATALOG.some((item) => item.code === 'plan.manage' && item.description.includes('plan'))
	);
});

test('la UI pisa descripciones de ORDS con el catálogo de negocio', () => {
	const fromOrds = overlayCatalogItemCopy({
		code: 'locations.manage',
		label: 'locations.manage',
		description: 'CRUD de sucursales y addons. Checkout de la organización.',
		group_code: 'addons',
		group_label: 'addons',
	});
	assert.equal(fromOrds.code, 'locations.manage');
	assert.equal(fromOrds.group_code, 'addons');
	assert.equal(VISIBLE_JARGON.test(fromOrds.description), false);
	assert.equal(fromOrds.label.includes('.'), false);
	assert.equal(fromOrds.group_label, 'Sucursales');

	const matrix = overlayPermissionMatrix({
		catalog: [
			{
				code: 'plan.manage',
				label: 'plan.manage',
				description: 'Checkout y APIs de facturación.',
				group_code: 'plan',
				group_label: 'Plan',
			},
		],
	});
	assert.equal(VISIBLE_JARGON.test(matrix.catalog[0].description), false);
	assert.equal(matrix.catalog[0].code, 'plan.manage');
});
