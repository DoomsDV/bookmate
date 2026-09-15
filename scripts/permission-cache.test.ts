import assert from 'node:assert/strict';
import test from 'node:test';

import {
	readCachedPermissions,
	signPermissionsCookie,
	verifyPermissionsCookie,
} from '../src/lib/permission-cache.ts';

const secret = 'test-hasel-caps-secret';
const claims = { user_id: 9, organization_id: 1, role_id: 1 };
const payload = {
	userId: 9,
	orgId: 1,
	roleId: 1,
	capabilities: ['dashboard.view', 'customers.create'],
	ts: Date.now(),
};

test('cookie firmada válida se lee', () => {
	const raw = signPermissionsCookie(payload, secret);
	const verified = verifyPermissionsCookie(raw, secret);
	assert.deepEqual(verified?.capabilities, payload.capabilities);
	const cookies = { get: () => ({ value: raw }) };
	assert.deepEqual(readCachedPermissions(cookies, claims, secret), payload.capabilities);
});

test('cookie sin firma se rechaza', () => {
	const unsigned = `9.1.1.${Date.now()}.dashboard.view,permissions.manage`;
	assert.equal(verifyPermissionsCookie(unsigned, secret), null);
	const cookies = { get: () => ({ value: unsigned }) };
	assert.equal(readCachedPermissions(cookies, claims, secret), null);
});

test('cookie adulterada se rechaza', () => {
	const raw = signPermissionsCookie(payload, secret);
	const [version, encoded, signature] = raw.split('.');
	const forged = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
	forged.capabilities = ['permissions.manage', 'locations.manage'];
	const tampered = `${version}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`;
	assert.equal(verifyPermissionsCookie(tampered, secret), null);
	const cookies = { get: () => ({ value: tampered }) };
	assert.equal(readCachedPermissions(cookies, claims, secret), null);
});

test('sin secreto no se acepta cache', () => {
	const raw = signPermissionsCookie(payload, secret);
	assert.equal(verifyPermissionsCookie(raw, ''), null);
	const cookies = { get: () => ({ value: raw }) };
	assert.equal(readCachedPermissions(cookies, claims, ''), null);
});
