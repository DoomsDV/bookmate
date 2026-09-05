import type { BodySilhouette, BodyView } from './types';

/** Coordenadas normalizadas del mapa (vista del paciente: izquierda en pantalla = lado izquierdo del paciente). */
export const BODY_VIEWBOX = { width: 100, height: 130 } as const;

export type BodyRegionHit = {
	code: string;
	view: BodyView;
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	side: 'L' | 'R' | null;
};

/**
 * Figuras a escala adulta, con hombros, cintura, manos y pies definidos.
 * Son contornos cerrados de una sola pieza para conservar el hit-test SVG del mapa.
 */
const frontNeutral =
	'M50 5 C42 5 37 11 37 19 C37 26 41 30 45 31 L45 35 L32 37 C26 38 22 43 21 50 L17 69 C16 76 18 82 22 84 L25 83 L28 64 L29 84 C29 92 31 100 35 106 L38 125 L45 125 L47 106 L50 97 L53 106 L55 125 L62 125 L65 106 C69 100 71 92 71 84 L72 64 L75 83 L78 84 C82 82 84 76 83 69 L79 50 C78 43 74 38 68 37 L55 35 L55 31 C59 30 63 26 63 19 C63 11 58 5 50 5 Z';

const frontFemale =
	'M50 5 C42 5 37 11 37 19 C37 26 41 30 45 31 L45 35 L33 37 C27 38 23 43 22 50 L18 69 C17 76 19 82 23 84 L26 83 L29 64 L30 84 C30 92 28 98 26 103 C30 106 35 108 39 109 L42 125 L48 125 L50 106 L52 125 L58 125 L61 109 C65 108 70 106 74 103 C72 98 70 92 70 84 L71 64 L74 83 L77 84 C81 82 83 76 82 69 L78 50 C77 43 73 38 67 37 L55 35 L55 31 C59 30 63 26 63 19 C63 11 58 5 50 5 Z';

const frontMale =
	'M50 5 C42 5 37 11 37 19 C37 26 41 30 45 31 L45 35 L29 37 C22 38 18 43 17 51 L13 70 C12 77 14 83 19 85 L23 84 L27 64 L29 84 C30 92 32 100 36 106 L39 125 L46 125 L48 106 L50 98 L52 106 L54 125 L61 125 L64 106 C68 100 70 92 71 84 L73 64 L77 84 L81 85 C86 83 88 77 87 70 L83 51 C82 43 78 38 71 37 L55 35 L55 31 C59 30 63 26 63 19 C63 11 58 5 50 5 Z';

const frontChild =
	'M50 8 C43 8 39 13 39 20 C39 26 42 29 46 30 L46 33 L36 35 C31 36 28 40 27 47 L24 62 C23 68 25 72 29 73 L32 72 L35 58 L36 73 C36 79 38 85 41 90 L43 108 L48 108 L50 92 L52 108 L57 108 L59 90 C62 85 64 79 64 73 L65 58 L68 72 L71 73 C75 72 77 68 76 62 L73 47 C72 40 69 36 64 35 L54 33 L54 30 C58 29 61 26 61 20 C61 13 57 8 50 8 Z';

const backNeutral =
	'M50 5 C42 5 37 11 37 19 C37 26 41 30 45 31 L45 35 L32 37 C26 38 22 43 21 50 L17 69 C16 76 18 82 22 84 L25 83 L28 64 L29 84 C29 92 31 99 35 105 L38 125 L45 125 L47 108 L50 99 L53 108 L55 125 L62 125 L65 105 C69 99 71 92 71 84 L72 64 L75 83 L78 84 C82 82 84 76 83 69 L79 50 C78 43 74 38 68 37 L55 35 L55 31 C59 30 63 26 63 19 C63 11 58 5 50 5 Z';

const backFemale =
	'M50 5 C42 5 37 11 37 19 C37 26 41 30 45 31 L45 35 L33 37 C27 38 23 43 22 50 L18 69 C17 76 19 82 23 84 L26 83 L29 64 L30 84 C30 92 28 98 26 104 C30 107 35 109 39 110 L42 125 L48 125 L50 107 L52 125 L58 125 L61 110 C65 109 70 107 74 104 C72 98 70 92 70 84 L71 64 L74 83 L77 84 C81 82 83 76 82 69 L78 50 C77 43 73 38 67 37 L55 35 L55 31 C59 30 63 26 63 19 C63 11 58 5 50 5 Z';

const backMale =
	'M50 5 C42 5 37 11 37 19 C37 26 41 30 45 31 L45 35 L29 37 C22 38 18 43 17 51 L13 70 C12 77 14 83 19 85 L23 84 L27 64 L29 84 C30 92 32 99 36 105 L39 125 L46 125 L48 108 L50 99 L52 108 L54 125 L61 125 L64 105 C68 99 70 92 71 84 L73 64 L77 84 L81 85 C86 83 88 77 87 70 L83 51 C82 43 78 38 71 37 L55 35 L55 31 C59 30 63 26 63 19 C63 11 58 5 50 5 Z';

const backChild =
	'M50 8 C43 8 39 13 39 20 C39 26 42 29 46 30 L46 33 L36 35 C31 36 28 40 27 47 L24 62 C23 68 25 72 29 73 L32 72 L35 58 L36 73 C36 79 38 85 41 90 L43 108 L48 108 L50 93 L52 108 L57 108 L59 90 C62 85 64 79 64 73 L65 58 L68 72 L71 73 C75 72 77 68 76 62 L73 47 C72 40 69 36 64 35 L54 33 L54 30 C58 29 61 26 61 20 C61 13 57 8 50 8 Z';

const sideNeutral =
	'M47 5 C42 8 40 13 40 19 C40 25 43 29 47 31 L47 35 C42 37 39 42 39 49 L40 67 L36 81 L39 83 L43 67 L44 86 C44 93 42 100 40 106 L42 125 L49 125 L51 107 L54 125 L61 125 L62 106 C65 99 67 92 66 85 L65 67 L68 81 L71 80 L68 61 C70 54 68 45 64 40 L57 36 L57 32 L61 30 L58 28 L58 22 L63 21 L59 19 C59 11 54 6 47 5 Z';

const sideFemale =
	'M47 5 C42 8 40 13 40 19 C40 25 43 29 47 31 L47 35 C42 37 39 42 39 49 L40 65 L36 81 L39 83 L43 67 L44 84 C44 91 41 97 38 102 C42 106 47 108 52 108 L54 125 L61 125 L62 106 C66 100 68 92 66 84 L65 67 L68 81 L71 80 L68 61 C70 54 68 45 64 40 L57 36 L57 32 L61 30 L58 28 L58 22 L63 21 L59 19 C59 11 54 6 47 5 Z';

const sideMale =
	'M47 5 C42 8 40 13 40 19 C40 25 43 29 47 31 L47 35 C41 37 37 42 37 50 L38 68 L34 82 L38 84 L42 67 L44 86 C44 93 42 100 40 106 L42 125 L49 125 L51 107 L54 125 L61 125 L63 106 C66 100 68 93 67 85 L66 67 L70 82 L74 81 L70 61 C72 53 69 44 64 40 L57 36 L57 32 L61 30 L58 28 L58 22 L63 21 L59 19 C59 11 54 6 47 5 Z';

const sideChild =
	'M48 8 C44 10 42 14 42 20 C42 25 44 28 48 30 L48 33 C44 35 42 39 42 45 L43 58 L40 70 L43 72 L46 59 L47 74 C47 80 45 85 43 90 L45 108 L50 108 L51 92 L53 108 L58 108 L59 90 C62 85 63 80 62 74 L61 59 L64 70 L67 69 L64 55 C65 49 63 41 60 37 L55 33 L55 30 L58 28 L56 26 L56 21 L60 20 L57 18 C57 12 53 9 48 8 Z';

export const BODY_OUTLINES: Record<BodySilhouette, Record<BodyView, string>> = {
	NEUTRAL: { FRONT: frontNeutral, BACK: backNeutral, SIDE: sideNeutral },
	FEMALE: { FRONT: frontFemale, BACK: backFemale, SIDE: sideFemale },
	MALE: { FRONT: frontMale, BACK: backMale, SIDE: sideMale },
	CHILD: { FRONT: frontChild, BACK: backChild, SIDE: sideChild },
};

export const SILHOUETTE_LABELS: Record<BodySilhouette, string> = {
	NEUTRAL: 'Silueta neutra',
	FEMALE: 'Silueta femenina',
	MALE: 'Silueta masculina',
	CHILD: 'Silueta infantil',
};

/** Zonas de detección alineadas a ref_body_region (coordenadas en viewBox). */
export const BODY_REGION_HITS: BodyRegionHit[] = [
	{ code: 'FRONT_SHOULDER_L', view: 'FRONT', cx: 26, cy: 40, rx: 11, ry: 9, side: 'L' },
	{ code: 'FRONT_SHOULDER_R', view: 'FRONT', cx: 74, cy: 40, rx: 11, ry: 9, side: 'R' },
	{ code: 'FRONT_KNEE_L', view: 'FRONT', cx: 42, cy: 108, rx: 9, ry: 10, side: 'L' },
	{ code: 'FRONT_KNEE_R', view: 'FRONT', cx: 58, cy: 108, rx: 9, ry: 10, side: 'R' },
	{ code: 'BACK_HIP_L', view: 'BACK', cx: 38, cy: 92, rx: 10, ry: 9, side: 'L' },
	{ code: 'BACK_HIP_R', view: 'BACK', cx: 62, cy: 92, rx: 10, ry: 9, side: 'R' },
	{ code: 'SIDE_ANKLE_L', view: 'SIDE', cx: 52, cy: 118, rx: 8, ry: 7, side: 'L' },
	{ code: 'SIDE_ANKLE_R', view: 'SIDE', cx: 52, cy: 118, rx: 8, ry: 7, side: 'R' },
];

export const getBodyOutline = (silhouette: BodySilhouette, view: BodyView): string =>
	BODY_OUTLINES[silhouette]?.[view] ?? BODY_OUTLINES.NEUTRAL[view];

const pointInEllipse = (x: number, y: number, hit: BodyRegionHit): boolean => {
	const dx = (x - hit.cx) / hit.rx;
	const dy = (y - hit.cy) / hit.ry;
	return dx * dx + dy * dy <= 1;
};

export const resolveBodyRegion = (
	view: BodyView,
	nx: number,
	ny: number
): { regionCode: string; side: 'L' | 'R' | null } => {
	const x = nx * BODY_VIEWBOX.width;
	const y = ny * BODY_VIEWBOX.height;
	const match = BODY_REGION_HITS.filter((hit) => hit.view === view).find((hit) =>
		pointInEllipse(x, y, hit)
	);
	if (match) return { regionCode: match.code, side: match.side };
	return { regionCode: `${view}_GENERIC`, side: null };
};

export const markToViewCoords = (nx: number, ny: number): { x: number; y: number } => ({
	x: nx * BODY_VIEWBOX.width,
	y: ny * BODY_VIEWBOX.height,
});
