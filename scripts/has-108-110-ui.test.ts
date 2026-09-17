import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const locations = readFileSync(join(root, 'src/pages/panel/locations.astro'), 'utf8');
const schedules = readFileSync(join(root, 'src/pages/panel/schedules.astro'), 'utf8');
const manager = readFileSync(join(root, 'src/scripts/schedule-manager.ts'), 'utf8');

const closureCssStart = locations.indexOf('dialog.closure-form-dialog {');
const closureCssEnd = locations.indexOf('/* --- Org closures side drawer');
assert.ok(closureCssStart > 0, 'missing closure form CSS');
assert.ok(closureCssEnd > closureCssStart, 'missing org closures CSS boundary');
const closureCss = locations.slice(closureCssStart, closureCssEnd);

assert.match(closureCss, /inset:\s*0;/);
assert.match(closureCss, /margin:\s*auto;/);
assert.match(closureCss, /border-radius:\s*1\.6rem;/);
assert.match(closureCss, /overflow-y:\s*auto;/);
assert.doesNotMatch(closureCss, /closure-form-drawer-in/);
assert.doesNotMatch(closureCss, /inset:\s*0 0 0 auto/);
assert.doesNotMatch(closureCss, /height:\s*100dvh/);

assert.match(schedules, /schedule-day-detail__status/);
assert.match(schedules, /schedule-day-detail__locations/);
assert.match(manager, /Horarios por sucursal/);
assert.match(manager, /renderExceptionDayDetail/);
assert.match(manager, /data-exc-action="edit"/);
assert.match(manager, /data-exc-action="block"/);
assert.match(manager, /DAY_EXCEPTION_STATE_COPY/);
assert.match(manager, /exceptionModalView === 'detail'/);
assert.match(manager, /Bloquear día/);
assert.match(
	schedules,
	/@media\s*\(\s*max-width:\s*767px\s*\)[\s\S]*\.schedule-day-detail__actions\s+\.modal-action-secondary[\s\S]*display:\s*inline-flex/
);

console.log('has-108-110-ui.test.ts ok');
