import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const globalCss = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
const schedules = readFileSync(join(root, 'src/pages/panel/schedules.astro'), 'utf8');
const manager = readFileSync(join(root, 'src/scripts/schedule-manager.ts'), 'utf8');

const schedulesCss = schedules.match(/<style is:global>([\s\S]*?)<\/style>/)?.[1] ?? '';
const combinedCss = `${globalCss}\n${schedulesCss}`;

const DAY_DETAIL_MARKUP = `
<section class="schedule-day-detail">
	<div class="schedule-day-detail__actions">
		<button type="button" data-exc-action="edit" class="modal-action-primary">
			<span>Editar excepción</span>
		</button>
		<button type="button" data-exc-action="block" class="modal-action-secondary">
			<span class="material-symbols-rounded" aria-hidden="true">block</span>
			<span>Bloquear día</span>
		</button>
		<button type="button" data-exc-action="delete" data-exc-use-template="true" class="modal-action-danger">
			Usar plantilla
		</button>
	</div>
</section>
<footer class="modal-footer">
	<div class="modal-footer-actions">
		<button type="button" class="modal-action-secondary" data-exc-action="close">Cerrar</button>
	</div>
</footer>
`;

type MediaQuery = { minWidth?: number; maxWidth?: number };

type DisplayRule = {
	selector: string;
	display: string;
	specificity: number;
	order: number;
	media: MediaQuery;
};

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const parseMediaQuery = (query: string): MediaQuery => {
	const media: MediaQuery = {};
	const max = query.match(/max-width:\s*(\d+(?:\.\d+)?)px/i);
	const min = query.match(/min-width:\s*(\d+(?:\.\d+)?)px/i);
	if (max) media.maxWidth = Number(max[1]);
	if (min) media.minWidth = Number(min[1]);
	return media;
};

const mediaApplies = (media: MediaQuery, width: number) => {
	if (media.maxWidth != null && width > media.maxWidth) return false;
	if (media.minWidth != null && width < media.minWidth) return false;
	return true;
};

const specificityScore = (selector: string) => {
	const ids = selector.match(/#/g)?.length ?? 0;
	const classes = selector.match(/[.:[]/g)?.length ?? 0;
	const elements = selector.match(/(?:^|[ >+~])[a-zA-Z][\w-]*/g)?.length ?? 0;
	return ids * 10000 + classes * 100 + elements;
};

const extractBlock = (css: string, openIndex: number) => {
	let depth = 0;
	for (let i = openIndex; i < css.length; i += 1) {
		if (css[i] === '{') depth += 1;
		else if (css[i] === '}') {
			depth -= 1;
			if (depth === 0) return { body: css.slice(openIndex + 1, i), end: i + 1 };
		}
	}
	return { body: '', end: css.length };
};

const collectDisplayRules = (css: string, inheritedMedia: MediaQuery = {}, startOrder = 0) => {
	const rules: DisplayRule[] = [];
	let i = 0;
	let order = startOrder;
	while (i < css.length) {
		const nextAt = css.indexOf('@', i);
		const nextBrace = css.indexOf('{', i);
		if (nextBrace < 0) break;

		if (nextAt >= 0 && nextAt < nextBrace) {
			const prelude = css.slice(nextAt, nextBrace).trim();
			const block = extractBlock(css, nextBrace);
			if (prelude.startsWith('@media')) {
				const query = parseMediaQuery(prelude.slice('@media'.length));
				const nested = collectDisplayRules(
					block.body,
					{
						minWidth: query.minWidth ?? inheritedMedia.minWidth,
						maxWidth: query.maxWidth ?? inheritedMedia.maxWidth,
					},
					order
				);
				rules.push(...nested);
				order += nested.length + 1;
			}
			i = block.end;
			continue;
		}

		const selector = css.slice(i, nextBrace).trim();
		const block = extractBlock(css, nextBrace);
		const display = block.body.match(/(?:^|;)\s*display:\s*([^;}{]+)/i)?.[1]?.trim();
		if (display && selector && !selector.startsWith('@')) {
			for (const part of selector.split(',').map((item) => item.trim()).filter(Boolean)) {
				rules.push({
					selector: part,
					display: display.replace(/!important/i, '').trim(),
					specificity: specificityScore(part),
					order,
					media: inheritedMedia,
				});
				order += 1;
			}
		} else {
			order += 1;
		}
		i = block.end;
	}
	return rules;
};

const selectorMatches = (selector: string, classNames: string[], ancestors: string[][]) => {
	const parts = selector
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length === 0) return false;

	const matchesNode = (part: string, nodeClasses: string[]) => {
		if (part === '*') return true;
		const wanted = [...part.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)].map((match) => match[1]);
		if (wanted.length === 0) return false;
		return wanted.every((cls) => nodeClasses.includes(cls));
	};

	const target = parts.at(-1);
	if (!target || !matchesNode(target, classNames)) return false;

	let ancestorIndex = ancestors.length - 1;
	for (let i = parts.length - 2; i >= 0; i -= 1) {
		const part = parts[i];
		let found = false;
		while (ancestorIndex >= 0) {
			if (matchesNode(part, ancestors[ancestorIndex])) {
				found = true;
				ancestorIndex -= 1;
				break;
			}
			ancestorIndex -= 1;
		}
		if (!found) return false;
	}
	return true;
};

const resolveDisplay = (
	css: string,
	width: number,
	classNames: string[],
	ancestors: string[][]
) => {
	const matches = collectDisplayRules(stripComments(css))
		.filter((rule) => mediaApplies(rule.media, width))
		.filter((rule) => selectorMatches(rule.selector, classNames, ancestors));
	matches.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
	return matches.at(-1)?.display ?? null;
};

test('HAS-110: Bloquear día sigue en el markup del Detalle del día', () => {
	assert.match(manager, /dataset\.excAction = 'block'/);
	assert.match(manager, /blockButton\.className = 'modal-action-secondary'/);
	assert.match(manager, /Bloquear día/);
	assert.match(manager, /schedule-day-detail__actions/);
	assert.match(schedulesCss, /schedule-day-detail__actions/);
});

test('HAS-110: el hide global de .modal-action-secondary sigue en ≤767px', () => {
	assert.match(
		globalCss,
		/@media\s*\(\s*max-width:\s*767px\s*\)[\s\S]*?\.modal-action-secondary\s*\{[\s\S]*?display:\s*none/
	);
});

test('HAS-110: Bloquear día no queda display:none a 390px si está en el markup', () => {
	const display = resolveDisplay(
		combinedCss,
		390,
		['modal-action-secondary'],
		[['schedule-day-detail'], ['schedule-day-detail__actions']]
	);
	assert.ok(display, 'no hay regla de display para Bloquear día');
	assert.notEqual(
		display,
		'none',
		`Bloquear día queda display:${display} a 390px; el CTA de HAS-110 tiene que verse`
	);
});

test('HAS-110: Cerrar del footer modal sigue oculto en móvil (no rompe el patrón global)', () => {
	const display = resolveDisplay(combinedCss, 390, ['modal-action-secondary'], [
		['modal-footer'],
		['modal-footer-actions'],
	]);
	assert.equal(display, 'none');
});

test('HAS-110: Usar plantilla no se colapsa a display:none ni a chip de 3.1rem', () => {
	const display = resolveDisplay(
		combinedCss,
		390,
		['modal-action-danger'],
		[['schedule-day-detail'], ['schedule-day-detail__actions']]
	);
	assert.notEqual(display, 'none');
});

const startFixtureServer = (html: string) =>
	new Promise<{ server: ReturnType<typeof createServer>; url: string }>((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			res.end(html);
		});
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			resolve({ server, url: `http://127.0.0.1:${port}/` });
		});
	});

test('HAS-110: computed style a 390px — Bloquear día visible y tocable', async (t) => {
	const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${combinedCss}</style>
</head>
<body>${DAY_DETAIL_MARKUP}</body>
</html>`;

	const { server, url } = await startFixtureServer(html);
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
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
	await page.goto(url, { waitUntil: 'domcontentloaded' });

	const computed = await page.evaluate(() => {
		const block = document.querySelector<HTMLButtonElement>('[data-exc-action="block"]');
		const template = document.querySelector<HTMLButtonElement>('[data-exc-action="delete"]');
		const close = document.querySelector<HTMLButtonElement>('[data-exc-action="close"]');
		if (!block || !template || !close) {
			return { missing: true };
		}
		const blockStyle = getComputedStyle(block);
		const templateStyle = getComputedStyle(template);
		const closeStyle = getComputedStyle(close);
		const blockBox = block.getBoundingClientRect();
		const templateBox = template.getBoundingClientRect();
		return {
			missing: false,
			blockDisplay: blockStyle.display,
			blockVisibility: blockStyle.visibility,
			blockPointer: blockStyle.pointerEvents,
			blockWidth: blockBox.width,
			blockHeight: blockBox.height,
			blockText: block.textContent?.replace(/\s+/g, ' ').trim(),
			templateDisplay: templateStyle.display,
			templateWidth: templateBox.width,
			templateHeight: templateBox.height,
			closeDisplay: closeStyle.display,
		};
	});

	assert.equal(computed.missing, false, 'faltan botones del fixture');
	assert.notEqual(computed.blockDisplay, 'none');
	assert.notEqual(computed.blockDisplay, 'contents');
	assert.equal(computed.blockVisibility, 'visible');
	assert.notEqual(computed.blockPointer, 'none');
	assert.ok((computed.blockWidth ?? 0) >= 44, `ancho tocable ${computed.blockWidth}`);
	assert.ok((computed.blockHeight ?? 0) >= 40, `alto tocable ${computed.blockHeight}`);
	assert.match(String(computed.blockText), /Bloquear día/);
	assert.notEqual(computed.templateDisplay, 'none');
	assert.ok((computed.templateWidth ?? 0) >= 44, `Usar plantilla ancho ${computed.templateWidth}`);
	assert.equal(computed.closeDisplay, 'none');
});
