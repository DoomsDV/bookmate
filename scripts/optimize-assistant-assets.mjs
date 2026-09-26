#!/usr/bin/env node
/**
 * Comprime assets de Numa y genera un avatar liviano para el panel.
 * Uso: node scripts/optimize-assistant-assets.mjs
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../public/assistant/', import.meta.url).pathname;
const PNG_OPTS = { compressionLevel: 9, effort: 10, palette: false };

const TARGETS = [
	{ name: 'numa-hammock-desktop.png', maxWidth: 1024 },
	{ name: 'numa-analytics-desktop.png', maxWidth: 1024 },
	{ name: 'numa-reading-mobile-body.png', maxWidth: 1200 },
	{ name: 'numa-tail-layer.png', maxWidth: 1200 },
];

async function fileSize(path) {
	const { size } = await stat(path);
	return size;
}

async function optimizePng(path, maxWidth = null) {
	const before = await fileSize(path);
	const meta = await sharp(path).metadata();
	let pipeline = sharp(path);
	if (maxWidth && meta.width && meta.width > maxWidth) {
		pipeline = pipeline.resize(maxWidth, null, { fit: 'inside', withoutEnlargement: true });
	}
	const buf = await pipeline.png(PNG_OPTS).toBuffer();
	if (buf.length < before) {
		await sharp(buf).toFile(path);
	}
	return { before, after: Math.min(buf.length, before) };
}

async function buildAvatar() {
	const body = await sharp(join(ROOT, 'numa-reading-mobile-body.png')).toBuffer();
	const tail = await sharp(join(ROOT, 'numa-tail-layer.png')).toBuffer();
	const composed = await sharp({
		create: { width: 1774, height: 887, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
	})
		.composite([
			{ input: tail, top: 0, left: 0 },
			{ input: body, top: 0, left: 0 },
		])
		.png()
		.toBuffer();

	const avatarPath = join(ROOT, 'numa-reading-mobile.png');
	const before = await fileSize(avatarPath);
	const buf = await sharp(composed)
		.trim({ threshold: 12 })
		.resize(160, null, { fit: 'inside', withoutEnlargement: true })
		.png(PNG_OPTS)
		.toBuffer();
	await sharp(buf).toFile(avatarPath);
	return { before, after: buf.length };
}

// Numa acostada del topbar móvil: mismo recorte en cuerpo y cola para que las capas sigan alineadas.
const TOPBAR_CROP = { left: 0, top: 70, width: 1200, height: 515 };
const TOPBAR_WIDTH = 420;

async function buildTopbarLayers() {
	const layers = [
		['numa-reading-mobile-body.png', 'numa-topbar-body.webp'],
		['numa-tail-layer.png', 'numa-topbar-tail.webp'],
	];
	for (const [source, output] of layers) {
		const buf = await sharp(join(ROOT, source))
			.extract(TOPBAR_CROP)
			.resize(TOPBAR_WIDTH, null)
			.webp({ quality: 88, alphaQuality: 100, effort: 6 })
			.toBuffer();
		await sharp(buf).toFile(join(ROOT, output));
		console.log(`${output}: ${(buf.length / 1024).toFixed(0)}K`);
	}
}

async function main() {
	let saved = 0;
	await buildTopbarLayers();
	for (const { name, maxWidth } of TARGETS) {
		const { before, after } = await optimizePng(join(ROOT, name), maxWidth);
		saved += before - after;
		console.log(`${name}: ${(before / 1024).toFixed(0)}K → ${(after / 1024).toFixed(0)}K`);
	}

	const peekFiles = (await readdir(ROOT))
		.filter((name) => name.startsWith('numa-peek-mobile-vertical-right-look-') && name.endsWith('.png'))
		.sort();
	for (const name of peekFiles) {
		const { before, after } = await optimizePng(join(ROOT, name), 512);
		saved += before - after;
	}
	console.log(`peek frames (${peekFiles.length}): optimizados`);

	const avatar = await buildAvatar();
	saved += avatar.before - avatar.after;
	console.log(
		`numa-reading-mobile.png (avatar): ${(avatar.before / 1024).toFixed(0)}K → ${(avatar.after / 1024).toFixed(0)}K`,
	);
	console.log(`total ahorrado: ${(saved / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
