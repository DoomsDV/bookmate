#!/usr/bin/env node
/**
 * Lighthouse local runner (Windows-friendly alternative to lhci autorun).
 * Usage: node scripts/run-lighthouse-local.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'perf', 'reports', 'lighthouse');
fs.mkdirSync(reportsDir, { recursive: true });

const baseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:4321';
const userSlug = process.env.USER_SLUG || 'dann-villasanti';
const orgSlug = process.env.ORG_SLUG || 'consultorio-dann';
const proSlug = process.env.PRO_SLUG || 'dann-villasanti';

const urls = [
	{ path: '/', label: 'landing' },
	{ path: '/auth/login', label: 'auth_login' },
	{ path: `/u/${userSlug}`, label: 'public_user' },
	{ path: `/${orgSlug}/p/${proSlug}`, label: 'public_booking' },
];

const extractMetrics = (lhr) => {
	const audit = (id) => lhr.audits[id];
	return {
		performanceScore: Math.round((lhr.categories.performance?.score ?? 0) * 100),
		lcpMs: audit('largest-contentful-paint')?.numericValue ?? null,
		cls: audit('cumulative-layout-shift')?.numericValue ?? null,
		tbtMs: audit('total-blocking-time')?.numericValue ?? null,
		fcpMs: audit('first-contentful-paint')?.numericValue ?? null,
		inpMs: audit('interaction-to-next-paint')?.numericValue ?? null,
		ttiMs: audit('interactive')?.numericValue ?? null,
	};
};

const run = async () => {
	const { default: lighthouse } = await import('lighthouse');
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-dev-shm-usage'],
	});
	const results = [];

	for (const route of urls) {
		const url = `${baseUrl}${route.path}`;
		console.log(`Lighthouse → ${url}`);
		try {
			const { lhr } = await lighthouse(url, {
				port: Number(new URL(browser.wsEndpoint()).port),
				output: 'json',
				logLevel: 'error',
				onlyCategories: ['performance'],
			});
			const metrics = extractMetrics(lhr);
			const outFile = path.join(reportsDir, `${route.label}.json`);
			fs.writeFileSync(outFile, JSON.stringify({ url, metrics, generatedAt: new Date().toISOString() }, null, 2));
			results.push({ ...route, url, metrics, status: 'ok' });
			console.log(
				`  perf=${metrics.performanceScore} LCP=${Math.round(metrics.lcpMs ?? 0)}ms TBT=${Math.round(metrics.tbtMs ?? 0)}ms CLS=${(metrics.cls ?? 0).toFixed(3)}`
			);
		} catch (error) {
			results.push({
				...route,
				url,
				status: 'error',
				error: error instanceof Error ? error.message : String(error),
			});
			console.error(`  ✗ ${error instanceof Error ? error.message : error}`);
		}
	}

	await browser.close();

	const summaryPath = path.join(reportsDir, 'summary.json');
	fs.writeFileSync(summaryPath, JSON.stringify({ baseUrl, results, generatedAt: new Date().toISOString() }, null, 2));
	console.log(`\nResumen: ${summaryPath}`);
};

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
