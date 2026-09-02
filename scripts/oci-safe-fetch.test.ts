import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSafeOciHttpsUrl, OciSafeFetchError } from '../src/lib/oci-safe-fetch.ts';

test('assertSafeOciHttpsUrl acepta objectstorage OCI', () => {
	const url = assertSafeOciHttpsUrl(
		'https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/gr7djv0kcgrr/b/bucket-hasel-aoxdev/o/x.jpg'
	);
	assert.equal(url.hostname, 'objectstorage.sa-saopaulo-1.oraclecloud.com');
});

test('assertSafeOciHttpsUrl rechaza http, redirects host y credenciales', () => {
	assert.throws(
		() => assertSafeOciHttpsUrl('http://objectstorage.sa-saopaulo-1.oraclecloud.com/o/x'),
		(error: unknown) => error instanceof OciSafeFetchError && error.code === 'INSECURE_URL'
	);
	assert.throws(
		() => assertSafeOciHttpsUrl('https://evil.example/x'),
		(error: unknown) => error instanceof OciSafeFetchError && error.code === 'HOST_DENIED'
	);
	assert.throws(
		() =>
			assertSafeOciHttpsUrl(
				'https://user:pass@objectstorage.sa-saopaulo-1.oraclecloud.com/n/x/b/y/o/z'
			),
		(error: unknown) => error instanceof OciSafeFetchError && error.code === 'INVALID_URL'
	);
});
