import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
	filterPermissionsMatrix,
	matchingRoleIds,
	normalizeSearchText,
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
