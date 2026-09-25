#!/usr/bin/env node
/**
 * Genera los frames de Numa de frente para el modal del asistente.
 * Lee design/numa/front-src/*.png (originales, fuera de public/ y fuera de git por su peso) y, por grupo:
 *  1. normaliza cada frame contra el primero (referencia): escala y posición según el
 *     contorno del torso, y color con matching de histograma sobre esa misma zona;
 *     además, los grupos siguientes igualan el tono del pelaje al primero con una ganancia suave por canal;
 *  2. recorta todo el grupo con una caja común (para que los frames no salten);
 *  3. arma un sprite sheet horizontal por grupo (public/assistant/numa/numa-front-<grupo>-sheet.webp).
 *     Una sola imagen siempre visible queda decodificada, así cambiar de frame nunca deja un hueco.
 * El orden de los frames en GROUPS es el índice que usa src/components/NumaFront.astro.
 * Uso: node scripts/build-numa-front.mjs
 */
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = new URL('../design/numa/front-src/', import.meta.url).pathname;
const OUT = new URL('../public/assistant/numa/', import.meta.url).pathname;
const WIDTH = 320;
const PADDING = 12;
const ALPHA_THRESHOLD = 24;
/** Zona estable (torso y patas) usada como ancla, en fracción del alto de la silueta de referencia. */
const ANCHOR_FROM = 0.58;
const ANCHOR_TO = 0.92;
/** Zona de la cabeza, común a todos los grupos, donde se mide el tono del pelaje entre grupos. */
const HEAD_FROM = 0.05;
const HEAD_TO = 0.4;
const MAX_GROUP_GAIN = 0.1;

const GROUPS = {
	hero: [
		'numa-front-idle-center',
		'numa-front-idle-left',
		'numa-front-idle-up',
		'numa-front-idle-right',
		'numa-front-idle-blink',
		'numa-front-typing-down-left',
		'numa-front-typing-down-right',
	],
	work: [
		'numa-front-work-lens-center',
		'numa-front-work-lens-left',
		'numa-front-work-lens-right',
		'numa-front-work-aha',
	],
};

async function load(name) {
	const { data, info } = await sharp(join(SRC, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}

function bounds({ data, width, height }) {
	let left = width;
	let top = height;
	let right = -1;
	let bottom = -1;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if (data[(y * width + x) * 4 + 3] < ALPHA_THRESHOLD) continue;
			if (x < left) left = x;
			if (x > right) right = x;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
		}
	}
	return { left, top, right, bottom };
}

function rowSpan(img, y) {
	let min = -1;
	let max = -1;
	for (let x = 0; x < img.width; x += 1) {
		if (img.data[(y * img.width + x) * 4 + 3] < 128) continue;
		if (min < 0) min = x;
		max = x;
	}
	return min < 0 ? null : { width: max - min, center: (max + min) / 2 };
}

const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

/** Escala y desplazamiento que llevan el torso del frame sobre el de la referencia (ancla: base del cuerpo). */
function fitTransform(ref, refBox, img, imgBox) {
	const span = refBox.bottom - refBox.top;
	const ratios = [];
	const refCenters = [];
	const imgCenters = [];
	for (let t = ANCHOR_FROM; t <= ANCHOR_TO; t += 0.01) {
		const refY = Math.round(refBox.top + span * t);
		const imgY = Math.round(imgBox.bottom - (refBox.bottom - refY));
		const a = rowSpan(ref, refY);
		const b = rowSpan(img, imgY);
		if (!a || !b) continue;
		ratios.push(a.width / b.width);
		refCenters.push(a.center);
		imgCenters.push(b.center);
	}
	const scale = median(ratios);
	return {
		scale,
		dx: median(refCenters) - median(imgCenters) * scale,
		dy: refBox.bottom - imgBox.bottom * scale,
	};
}

/** Remuestrea con interpolación bilineal (alpha premultiplicado): out(x, y) = img((x - dx) / s, (y - dy) / s). */
function transform(img, { scale, dx, dy }) {
	const { data, width, height } = img;
	const out = Buffer.alloc(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const sy = (y - dy) / scale;
		const y0 = Math.floor(sy);
		const fy = sy - y0;
		for (let x = 0; x < width; x += 1) {
			const sx = (x - dx) / scale;
			const x0 = Math.floor(sx);
			const fx = sx - x0;
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (const [px, py, w] of [
				[x0, y0, (1 - fx) * (1 - fy)],
				[x0 + 1, y0, fx * (1 - fy)],
				[x0, y0 + 1, (1 - fx) * fy],
				[x0 + 1, y0 + 1, fx * fy],
			]) {
				if (w === 0 || px < 0 || py < 0 || px >= width || py >= height) continue;
				const i = (py * width + px) * 4;
				const alpha = data[i + 3] * w;
				r += data[i] * alpha;
				g += data[i + 1] * alpha;
				b += data[i + 2] * alpha;
				a += alpha;
			}
			const o = (y * width + x) * 4;
			if (a > 0) {
				out[o] = Math.round(r / a);
				out[o + 1] = Math.round(g / a);
				out[o + 2] = Math.round(b / a);
				out[o + 3] = Math.round(a);
			}
		}
	}
	return { data: out, width, height };
}

function histograms(img, fromY, toY) {
	const hist = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
	for (let y = fromY; y <= toY; y += 1) {
		for (let x = 0; x < img.width; x += 1) {
			const i = (y * img.width + x) * 4;
			if (img.data[i + 3] < 250) continue;
			for (let c = 0; c < 3; c += 1) hist[c][img.data[i + c]] += 1;
		}
	}
	return hist.map((h) => {
		const total = h.reduce((sum, v) => sum + v, 0) || 1;
		let acc = 0;
		return Array.from(h, (v) => (acc += v) / total);
	});
}

/** LUT por canal que lleva la distribución del frame a la de la referencia, suavizada para no generar bandas. */
function matchLut(refCdf, imgCdf) {
	const lut = new Float64Array(256);
	let j = 0;
	for (let v = 0; v < 256; v += 1) {
		while (j < 255 && refCdf[j] < imgCdf[v]) j += 1;
		lut[v] = j;
	}
	const smooth = new Uint8Array(256);
	for (let v = 0; v < 256; v += 1) {
		let sum = 0;
		let n = 0;
		for (let k = Math.max(0, v - 6); k <= Math.min(255, v + 6); k += 1) {
			sum += lut[k];
			n += 1;
		}
		smooth[v] = Math.round(sum / n);
	}
	for (let v = 1; v < 256; v += 1) if (smooth[v] < smooth[v - 1]) smooth[v] = smooth[v - 1];
	return smooth;
}

function applyLuts(img, luts) {
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		for (let c = 0; c < 3; c += 1) img.data[i + c] = luts[c][img.data[i + c]];
	}
	return img;
}

/** Promedio RGB de los píxeles de pelaje marrón en la banda de la cabeza. */
function furMean(img, box) {
	const span = box.bottom - box.top;
	const fromY = Math.round(box.top + span * HEAD_FROM);
	const toY = Math.round(box.top + span * HEAD_TO);
	const sum = [0, 0, 0];
	let n = 0;
	for (let y = fromY; y <= toY; y += 1) {
		for (let x = 0; x < img.width; x += 1) {
			const i = (y * img.width + x) * 4;
			const [r, g, b, a] = [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
			if (a < 250 || r < 90 || r > 235 || r - b < 60 || g > r) continue;
			sum[0] += r;
			sum[1] += g;
			sum[2] += b;
			n += 1;
		}
	}
	return sum.map((v) => v / Math.max(n, 1));
}

function applyGain(img, gain) {
	for (let i = 0; i < img.data.length; i += 4) {
		if (img.data[i + 3] === 0) continue;
		for (let c = 0; c < 3; c += 1) img.data[i + c] = Math.min(255, Math.round(img.data[i + c] * gain[c]));
	}
}

async function buildGroup(name, frames, colorRef) {
	const ref = await load(frames[0]);
	const refBox = bounds(ref);
	const anchorFrom = Math.round(refBox.top + (refBox.bottom - refBox.top) * ANCHOR_FROM);
	const anchorTo = Math.round(refBox.top + (refBox.bottom - refBox.top) * ANCHOR_TO);
	const refCdf = histograms(ref, anchorFrom, anchorTo);

	const normalized = [ref];
	for (const frame of frames.slice(1)) {
		const img = await load(frame);
		const fit = fitTransform(ref, refBox, img, bounds(img));
		const aligned = transform(img, fit);
		const imgCdf = histograms(aligned, anchorFrom, anchorTo);
		normalized.push(applyLuts(aligned, refCdf.map((cdf, c) => matchLut(cdf, imgCdf[c]))));
		console.log(`  ${frame}: escala ${fit.scale.toFixed(4)}, dx ${fit.dx.toFixed(1)}, dy ${fit.dy.toFixed(1)}`);
	}

	if (colorRef) {
		const groupFur = furMean(ref, refBox);
		const gain = colorRef.map((v, c) => Math.min(1 + MAX_GROUP_GAIN, Math.max(1 - MAX_GROUP_GAIN, v / groupFur[c])));
		for (const img of normalized) applyGain(img, gain);
		console.log(`  ganancia de color del grupo: ${gain.map((g) => g.toFixed(3)).join(' / ')}`);
	}

	const boxes = normalized.map(bounds);
	const left = Math.max(0, Math.min(...boxes.map((b) => b.left)) - PADDING);
	const top = Math.max(0, Math.min(...boxes.map((b) => b.top)) - PADDING);
	const right = Math.min(ref.width - 1, Math.max(...boxes.map((b) => b.right)) + PADDING);
	const bottom = Math.min(ref.height - 1, Math.max(...boxes.map((b) => b.bottom)) + PADDING);
	const box = { left, top, width: right - left + 1, height: bottom - top + 1 };
	console.log(`${name}: caja ${box.width}x${box.height}+${box.left}+${box.top}`);

	const cells = await Promise.all(normalized.map((img) =>
		sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
			.extract(box)
			.resize(WIDTH, Math.round((box.height * WIDTH) / box.width), { fit: 'fill' })
			.png()
			.toBuffer(),
	));
	const cellHeight = Math.round((box.height * WIDTH) / box.width);
	const out = join(OUT, `numa-front-${name}-sheet.webp`);
	await sharp({ create: { width: WIDTH * cells.length, height: cellHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
		.composite(cells.map((input, index) => ({ input, left: index * WIDTH, top: 0 })))
		.webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true })
		.toFile(out);
	const { size } = await stat(out);
	console.log(`  numa-front-${name}-sheet.webp ${cells.length} frames de ${WIDTH}x${cellHeight}, ${(size / 1024).toFixed(1)} KB`);
	return furMean(ref, refBox);
}

// No se borra la carpeta entera: el dev server de Vite deja de reconocer los archivos de public/
// si su carpeta se recrea, y las peticiones caen en el middleware (redirect al login).
await mkdir(OUT, { recursive: true });
const sheets = new Set(Object.keys(GROUPS).map((name) => `numa-front-${name}-sheet.webp`));
for (const file of await readdir(OUT)) {
	if (!sheets.has(file)) await rm(join(OUT, file));
}
let colorRef = null;
for (const [name, frames] of Object.entries(GROUPS)) {
	const headCdf = await buildGroup(name, frames, colorRef);
	colorRef ??= headCdf;
}
