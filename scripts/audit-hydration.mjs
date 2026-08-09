#!/usr/bin/env node
/**
 * Auditoría local de hidratación / JS por ruta (Astro Islands).
 * Uso: node scripts/audit-hydration.mjs [--base=http://localhost:4321]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
const baseUrl = (baseArg?.split('=')[1] || process.env.PERF_BASE_URL || 'http://127.0.0.1:4321').replace(
	/\/+$/,
	''
);

const routes = [
	{ path: '/', label: 'landing', expectReact: false },
	{ path: '/auth/login', label: 'auth_login', expectReact: false },
	{ path: '/u/dann-villasanti', label: 'public_user_booking', expectReact: false },
	{
		path: '/consultorio-dann/p/dann-villasanti',
		label: 'public_org_pro_booking',
		expectReact: false,
	},
];

const reportsDir = path.join(projectRoot, 'perf', 'reports');
fs.mkdirSync(reportsDir, { recursive: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isReactChunk = (name) => /react|jsx-runtime|PublicProfilePreview/i.test(name);

const run = async () => {
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();
	const rows = [];

	for (const route of routes) {
		const url = `${baseUrl}${route.path}`;
		try {
			await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
			await delay(1500);

			const metrics = await page.evaluate(() => {
				const reactRoots =
					document.querySelectorAll('[data-reactroot], [data-react-root]').length +
					[...document.querySelectorAll('*')].filter((el) =>
						Object.keys(el).some((k) => k.startsWith('__reactFiber'))
					).length;
				const astroIslands = document.querySelectorAll('astro-island, [data-astro-cid]').length;
				const scripts = performance
					.getEntriesByType('resource')
					.filter(
						(entry) =>
							entry.initiatorType === 'script' || /\.m?js(\?|$)/i.test(String(entry.name))
					)
					.map((entry) => ({
						name: String(entry.name),
						transferSize: entry.transferSize || 0,
						duration: Math.round(entry.duration),
					}));
				return { reactRoots, astroIslands, scripts };
			});

			const reactScripts = metrics.scripts.filter((s) => isReactChunk(s.name));
			const jsTransferKb = Math.round(
				metrics.scripts.reduce((sum, s) => sum + (s.transferSize || 0), 0) / 1024
			);
			const reactOk = route.expectReact ? metrics.reactRoots > 0 : metrics.reactRoots === 0;

			rows.push({
				route: route.path,
				label: route.label,
				status: reactOk ? 'pass' : 'fail',
				reactRoots: metrics.reactRoots,
				astroIslands: metrics.astroIslands,
				jsScripts: metrics.scripts.length,
				jsTransferKb,
				reactScripts: reactScripts.length,
				expectReact: route.expectReact,
			});

			console.log(
				`${reactOk ? '✓' : '✗'} ${route.path} — react:${metrics.reactRoots} js:${jsTransferKb}KB scripts:${metrics.scripts.length}`
			);
		} catch (error) {
			rows.push({
				route: route.path,
				label: route.label,
				status: 'error',
				error: error instanceof Error ? error.message : String(error),
			});
			console.error(`✗ ${route.path} — ${error instanceof Error ? error.message : error}`);
		}
	}

	await browser.close();

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const csvPath = path.join(reportsDir, `hydration-${stamp}.csv`);
	const jsonPath = path.join(reportsDir, `hydration-${stamp}.json`);

	const header = [
		'route',
		'label',
		'status',
		'reactRoots',
		'astroIslands',
		'jsScripts',
		'jsTransferKb',
		'reactScripts',
		'expectReact',
	];
	const csvLines = [
		header.join(','),
		...rows.map((row) =>
			header
				.map((key) => {
					const value = row[key];
					if (value === undefined || value === null) return '';
					return String(value).includes(',') ? `"${value}"` : String(value);
				})
				.join(',')
		),
	];
	fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
	fs.writeFileSync(jsonPath, JSON.stringify({ baseUrl, rows, generatedAt: new Date().toISOString() }, null, 2));

	console.log(`\nReportes: ${csvPath}`);
	console.log(`          ${jsonPath}`);

	const failed = rows.filter((row) => row.status !== 'pass');
	process.exitCode = failed.length ? 1 : 0;
};

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
