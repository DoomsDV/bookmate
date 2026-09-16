import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { APP_VERSION } from '../src/config/app-version.ts';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
	version?: string;
};

test('APP_VERSION coincide con package.json y es 0.4.0', () => {
	assert.equal(packageJson.version, '0.4.0');
	assert.equal(APP_VERSION, packageJson.version);
});

test('Ayuda y legal usa APP_VERSION y no hardcodea 0.0.1', () => {
	const settings = readFileSync(new URL('../src/components/SettingsModal.astro', import.meta.url), 'utf8');
	assert.match(settings, /import \{ APP_VERSION \} from '\.\.\/config\/app-version'/);
	assert.match(settings, /Hasel versión \{appVersion\}/);
	assert.doesNotMatch(settings, /0\.0\.1/);
});
