#!/usr/bin/env node
/**
 * Lista los chunks JS/CSS del build por tamaño (post astro build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const clientDir = path.join(projectRoot, 'dist', 'client');
const reportsDir = path.join(projectRoot, 'perf', 'reports');
fs.mkdirSync(reportsDir, { recursive: true });

const walk = (dir, acc = []) => {
	if (!fs.existsSync(dir)) return acc;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, acc);
		else if (/\.(js|css|mjs)$/i.test(entry.name)) acc.push(full);
	}
	return acc;
};

const files = walk(clientDir)
	.map((file) => {
		const stat = fs.statSync(file);
		return {
			file: path.relative(projectRoot, file).replace(/\\/g, '/'),
			bytes: stat.size,
			kb: Math.round(stat.size / 1024),
		};
	})
	.sort((a, b) => b.bytes - a.bytes);

const summary = {
	generatedAt: new Date().toISOString(),
	totalJsCssKb: Math.round(files.reduce((s, f) => s + f.bytes, 0) / 1024),
	topChunks: files.slice(0, 40),
};

const outJson = path.join(reportsDir, 'bundle-chunks.json');
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));

console.log(`Total JS/CSS: ${summary.totalJsCssKb} KB (${files.length} archivos)`);
console.log('Top 10 chunks:');
for (const chunk of summary.topChunks.slice(0, 10)) {
	console.log(`  ${chunk.kb} KB  ${chunk.file}`);
}
console.log(`\nReporte: ${outJson}`);
