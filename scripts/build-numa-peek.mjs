#!/usr/bin/env node
/**
 * Normaliza el color de los 30 frames del "asomo" de Numa en mobile.
 * Los frames vienen con iluminación distinta (unos más claros y anaranjados, otros más oscuros), y al
 * alternarse con el scroll la nutria parpadea de color. Se lleva el pelaje y la crema de cada frame al
 * color típico de todos (percentiles 10/50/90 por canal), con una curva que deja fijos el negro y el blanco.
 *
 * Lee design/numa/peek-src/ (originales, fuera de public/ y de git) y escribe en public/assistant/
 * con los mismos nombres que usa AssistantMascot.astro. Además genera src/lib/numa-peek-timeline.ts:
 * la posición de cada frame en el recorrido, proporcional a cuánto cambia la pose (los repetidos
 * comparten posición), para que el asomo avance parejo con el scroll.
 * Uso: node scripts/build-numa-peek.mjs
 */
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = new URL('../design/numa/peek-src/', import.meta.url).pathname;
const OUT = new URL('../public/assistant/', import.meta.url).pathname;
const TIMELINE = new URL('../src/lib/numa-peek-timeline.ts', import.meta.url).pathname;
const FRAME_COUNT = 30;
const frameName = (index) => `numa-peek-mobile-vertical-right-look-${String(index).padStart(2, '0')}.png`;

const isFur = (r, g, b) => r >= 90 && r <= 235 && r - b >= 55 && g < r;
const isCream = (r, g, b) => r >= 205 && g >= 185 && b >= 160 && r - b < 70;

async function load(name) {
	const { data, info } = await sharp(join(SRC, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}

const QUANTILES = [0.1, 0.5, 0.9];

const quantiles = (values) => {
	const sorted = Float64Array.from(values).sort();
	return QUANTILES.map((q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);
};

/** Percentiles 10/50/90 por canal del pelaje y de la crema (solo píxeles opacos). */
function classQuantiles({ data }) {
	const fur = [[], [], []];
	const cream = [[], [], []];
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] < 250) continue;
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const target = isFur(r, g, b) ? fur : isCream(r, g, b) ? cream : null;
		if (!target) continue;
		target[0].push(r);
		target[1].push(g);
		target[2].push(b);
	}
	return { fur: fur.map(quantiles), cream: cream.map(quantiles) };
}

const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Curva por tramos que lleva los percentiles del frame a los del objetivo (pelaje y crema), con 0 y 255
 * fijos: iguala brillos, medios y sombras sin tocar ojos, nariz ni blancos. Se descartan los puntos
 * que romperían la monotonía.
 */
function channelLut(from, to) {
	const points = [[0, 0], ...from.map((x, k) => [x, to[k]]), [255, 255]].sort((a, b) => a[0] - b[0]);
	const monotone = [points[0]];
	for (const point of points.slice(1)) {
		const last = monotone[monotone.length - 1];
		if (point[0] > last[0] && point[1] >= last[1]) monotone.push(point);
	}
	const lut = new Uint8Array(256);
	for (let v = 0; v < 256; v += 1) {
		let k = 0;
		while (k < monotone.length - 2 && v > monotone[k + 1][0]) k += 1;
		const [x0, y0] = monotone[k];
		const [x1, y1] = monotone[k + 1];
		const t = x1 === x0 ? 0 : (v - x0) / (x1 - x0);
		lut[v] = Math.max(0, Math.min(255, Math.round(y0 + (y1 - y0) * t)));
	}
	return lut;
}

await mkdir(SRC, { recursive: true });
const existing = new Set(await readdir(SRC));
// La primera vez se guardan los originales antes de sobrescribir los de public/.
for (let index = 0; index < FRAME_COUNT; index += 1) {
	const name = frameName(index);
	if (!existing.has(name)) await copyFile(join(OUT, name), join(SRC, name));
}

const frames = [];
for (let index = 0; index < FRAME_COUNT; index += 1) {
	const img = await load(frameName(index));
	frames.push({ index, img, stats: classQuantiles(img) });
}

const targetOf = (kind) => [0, 1, 2].map((c) => QUANTILES.map((_, q) => median(frames.map((frame) => frame.stats[kind][c][q]))));
const target = { fur: targetOf('fur'), cream: targetOf('cream') };
console.log(`objetivo pelaje R ${target.fur[0].join('/')}  crema R ${target.cream[0].join('/')}`);

for (const { index, img, stats } of frames) {
	const luts = [0, 1, 2].map((c) => channelLut([...stats.fur[c], ...stats.cream[c]], [...target.fur[c], ...target.cream[c]]));
	const { data } = img;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] === 0) continue;
		data[i] = luts[0][data[i]];
		data[i + 1] = luts[1][data[i + 1]];
		data[i + 2] = luts[2][data[i + 2]];
	}
	await sharp(data, { raw: { width: img.width, height: img.height, channels: 4 } })
		.png({ compressionLevel: 9, effort: 10 })
		.toFile(join(OUT, frameName(index)));
	console.log(`  ${frameName(index)}: pelaje R ${stats.fur[0].join('/')} → ${target.fur[0].join('/')}`);
}

/** Cuánto cambia la pose entre dos frames: diferencia de color donde ambos son opacos + silueta distinta. */
function poseDistance(a, b) {
	let colorSum = 0;
	let both = 0;
	let union = 0;
	let xor = 0;
	for (let i = 0; i < a.length; i += 4) {
		const inA = a[i + 3] >= 128;
		const inB = b[i + 3] >= 128;
		if (!inA && !inB) continue;
		union += 1;
		if (inA !== inB) {
			xor += 1;
			continue;
		}
		both += 1;
		colorSum += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
	}
	return colorSum / Math.max(both, 1) + (100 * xor) / Math.max(union, 1);
}

const distances = frames.slice(1).map((frame, k) => poseDistance(frames[k].img.data, frame.img.data));
const total = distances.reduce((sum, value) => sum + value, 0) || 1;
const stops = [0];
for (const distance of distances) stops.push(stops[stops.length - 1] + distance / total);
stops[stops.length - 1] = 1;
await writeFile(TIMELINE, `// Generado por scripts/build-numa-peek.mjs (pnpm assets:numa-peek): no editar a mano.
/**
 * Posición (0 a 1) de cada frame del asomo de Numa en el recorrido del scroll, proporcional a cuánto
 * cambia la pose respecto del anterior. Los frames repetidos comparten posición y no ocupan scroll.
 */
export const NUMA_PEEK_STOPS: readonly number[] = [
${stops.map((stop) => `\t${stop.toFixed(4)},`).join('\n')}
];
`);
console.log(`timeline: ${distances.filter((d) => d < 1).length} frames repetidos, paso máx ${(Math.max(...distances) / total * 100).toFixed(1)}% del recorrido`);
