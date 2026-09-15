import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(repoRoot, 'src/styles/appointment-modal.css'), 'utf8');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
</head>
<body>
	<div class="appointment-recurrence" data-appointment-recurrence>
		<label class="appointment-recurrence__toggle">
			<input type="checkbox" class="appointment-recurrence__checkbox" data-recurrence-enabled />
			<span class="appointment-recurrence__copy">
				<span class="appointment-recurrence__title">Repetir cada semana</span>
			</span>
		</label>
		<div class="appointment-recurrence__fields" data-recurrence-fields inert>
			<div class="appointment-recurrence__modes">
				<label class="appointment-recurrence__mode">
					<input type="radio" name="recurrence_mode" value="count" checked />
					<span>Número de citas</span>
				</label>
				<input type="number" class="appointment-recurrence__count" value="4" />
				<label class="appointment-recurrence__mode">
					<input type="radio" name="recurrence_mode" value="until" />
					<span>Hasta el</span>
				</label>
				<input type="date" class="appointment-recurrence__until" />
			</div>
			<p class="appointment-recurrence__preview" data-recurrence-preview></p>
		</div>
	</div>
	<script>
		const checkbox = document.querySelector('[data-recurrence-enabled]');
		const wrap = document.querySelector('[data-appointment-recurrence]');
		const fields = document.querySelector('[data-recurrence-fields]');
		const preview = document.querySelector('[data-recurrence-preview]');
		let raf = 0;
		checkbox.addEventListener('input', () => {
			wrap.classList.toggle('is-enabled', checkbox.checked);
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				const start = performance.now();
				while (performance.now() - start < 80) {}
				fields.toggleAttribute('inert', !checkbox.checked);
				preview.textContent = checkbox.checked ? 'Se crearán 4 citas' : '';
			});
		});
	</script>
</body>
</html>`;

const startFixtureServer = () =>
	new Promise((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			res.end(html);
		});
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			resolve({ server, url: `http://127.0.0.1:${port}/` });
		});
	});

test('activar el check pinta Número de citas / Hasta el en el mismo frame percibido', async (t) => {
	const { server, url } = await startFixtureServer();
	t.after(() => server.close());

	const executablePath =
		process.env.PUPPETEER_EXECUTABLE_PATH ||
		['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((bin) =>
			existsSync(bin)
		);
	const browser = await puppeteer.launch({
		headless: true,
		...(executablePath ? { executablePath } : {}),
		args: ['--no-sandbox', '--disable-dev-shm-usage'],
	});
	t.after(() => browser.close());

	const page = await browser.newPage();
	await page.goto(url, { waitUntil: 'domcontentloaded' });

	const paintMs = await page.evaluate(() => {
		const checkbox = document.querySelector('[data-recurrence-enabled]');
		const fields = document.querySelector('[data-recurrence-fields]');
		const started = performance.now();
		checkbox.click();
		const style = getComputedStyle(fields);
		const painted =
			checkbox.checked &&
			style.visibility === 'visible' &&
			fields.getBoundingClientRect().height > 8 &&
			fields.textContent.includes('Número de citas') &&
			fields.textContent.includes('Hasta el');
		return { painted, elapsed: performance.now() - started };
	});

	assert.equal(paintMs.painted, true);
	assert.ok(paintMs.elapsed <= 200, `paint tardó ${paintMs.elapsed.toFixed(1)}ms`);

	const afterHeavySync = await page.waitForFunction(
		() => document.querySelector('[data-recurrence-preview]')?.textContent.includes('4 citas'),
		{ timeout: 1000 }
	);
	assert.ok(afterHeavySync);

	await page.evaluate(() => document.querySelector('[data-recurrence-enabled]').click());
	const offState = await page.evaluate(() => {
		const checkbox = document.querySelector('[data-recurrence-enabled]');
		const fields = document.querySelector('[data-recurrence-fields]');
		return {
			checked: checkbox.checked,
			visible: getComputedStyle(fields).visibility === 'visible',
		};
	});
	assert.equal(offState.checked, false);
	assert.equal(offState.visible, false);

	await page.evaluate(() => {
		const checkbox = document.querySelector('[data-recurrence-enabled]');
		checkbox.click();
		checkbox.click();
	});
	const desync = await page.evaluate(() => {
		const checkbox = document.querySelector('[data-recurrence-enabled]');
		const fields = document.querySelector('[data-recurrence-fields]');
		return {
			checked: checkbox.checked,
			visible: getComputedStyle(fields).visibility === 'visible',
		};
	});
	assert.equal(desync.checked, desync.visible);
});
