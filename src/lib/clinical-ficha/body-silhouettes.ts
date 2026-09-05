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

const frontNeutral =
	'M50 5 C60 5 66 11 66 20 C66 26 62 30 56 31 L56 34 L70 37 C79 39 82 47 81 58 C80 69 77 77 72 81 L71 92 C69 100 67 108 65 116 L63 125 L57 125 L55 116 C53 108 51 100 50 98 C49 100 47 108 45 116 L43 125 L37 125 L35 116 C33 108 31 100 29 92 L28 81 C23 77 20 69 19 58 C18 47 21 39 30 37 L44 34 L44 31 C38 30 34 26 34 20 C34 11 40 5 50 5 Z';

const frontFemale =
	'M50 5 C59 5 65 11 65 20 C65 26 61 30 55 31 L55 34 L68 37 C76 39 79 46 78 56 C77 66 74 74 70 78 L72 88 C74 96 72 104 68 110 L66 125 L58 125 L56 112 C54 106 52 100 50 98 C48 100 46 106 44 112 L42 125 L34 125 L32 110 C28 104 26 96 28 88 L30 78 C26 74 23 66 22 56 C21 46 24 39 32 37 L45 34 L45 31 C39 30 35 26 35 20 C35 11 41 5 50 5 Z';

const frontMale =
	'M50 5 C61 5 67 11 67 20 C67 26 63 30 57 31 L57 34 L74 36 C83 38 86 46 85 58 C84 70 81 78 76 82 L75 92 C73 100 71 108 69 116 L67 125 L61 125 L59 116 C57 108 55 100 54 98 C53 100 51 108 49 116 L47 125 L41 125 L39 116 C37 108 35 100 33 92 L32 82 C27 78 24 70 23 58 C22 46 25 39 34 37 L48 34 L48 31 C42 30 38 26 38 20 C38 11 44 5 50 5 Z';

const frontChild =
	'M50 8 C57 8 62 13 62 20 C62 25 58 28 54 29 L54 31 L64 33 C71 35 73 41 72 50 C71 59 68 65 64 68 L63 76 C62 82 60 88 58 94 L57 108 L53 108 L52 94 C51 88 50 84 50 83 C50 84 49 88 48 94 L47 108 L43 108 L42 94 C40 88 38 82 37 76 L36 68 C32 65 29 59 28 50 C27 41 29 35 36 33 L46 31 L46 29 C42 28 38 25 38 20 C38 13 43 8 50 8 Z';

const backNeutral =
	'M50 5 C60 5 66 11 66 20 C66 26 62 30 56 31 L56 34 L70 37 C79 39 82 47 81 58 C80 69 77 77 72 81 L74 90 C76 98 74 106 70 112 L68 125 L62 125 L60 114 C58 108 56 102 54 100 L50 96 L46 100 C44 102 42 108 40 114 L38 125 L32 125 L30 112 C26 106 24 98 26 90 L28 81 C23 77 20 69 19 58 C18 47 21 39 30 37 L44 34 L44 31 C38 30 34 26 34 20 C34 11 40 5 50 5 Z';

const backFemale =
	'M50 5 C59 5 65 11 65 20 C65 26 61 30 55 31 L55 34 L68 37 C76 39 79 46 78 56 C77 66 74 74 70 78 L72 88 C74 96 76 104 72 112 L70 125 L62 125 L60 114 C58 108 56 102 54 100 L50 96 L46 100 C44 102 42 108 40 114 L38 125 L30 125 L28 112 C24 106 22 98 24 90 L26 81 C21 77 18 69 17 58 C16 47 19 39 28 37 L42 34 L42 31 C36 30 32 26 32 20 C32 11 38 5 50 5 Z';

const backMale =
	'M50 5 C61 5 67 11 67 20 C67 26 63 30 57 31 L57 34 L74 36 C83 38 86 46 85 58 C84 70 81 78 76 82 L78 90 C80 98 78 106 74 112 L72 125 L66 125 L64 114 C62 108 60 102 58 100 L50 94 L42 100 C40 102 38 108 36 114 L34 125 L28 125 L26 112 C22 106 20 98 22 90 L24 81 C19 77 16 69 15 58 C14 46 17 39 26 37 L40 34 L40 31 C34 30 30 26 30 20 C30 11 36 5 50 5 Z';

const backChild =
	'M50 8 C57 8 62 13 62 20 C62 25 58 28 54 29 L54 31 L64 33 C71 35 73 41 72 50 C71 59 68 65 64 68 L66 76 C68 82 66 88 62 92 L60 108 L56 108 L54 96 L50 92 L46 96 L44 108 L40 108 L38 92 C34 88 32 82 34 76 L36 68 C32 65 29 59 28 50 C27 41 29 35 36 33 L46 31 L46 29 C42 28 38 25 38 20 C38 13 43 8 50 8 Z';

const sideNeutral =
	'M46 5 C54 5 58 11 58 19 C58 24 55 28 51 29 L51 32 L58 34 C64 36 67 42 67 52 C67 62 65 70 62 76 L63 88 C64 96 63 104 61 112 L60 125 L52 125 L51 112 C50 104 49 96 48 88 L47 76 C44 70 42 62 42 52 C42 42 45 36 51 34 L51 32 C47 31 44 27 44 22 C44 14 48 8 46 5 Z';

const sideFemale =
	'M46 5 C54 5 58 11 58 19 C58 24 55 28 51 29 L51 32 L57 34 C63 36 66 42 66 52 C66 62 64 70 61 76 L63 88 C65 96 66 104 64 112 L63 125 L55 125 L54 112 C53 104 52 96 51 88 L49 76 C46 70 44 62 44 52 C44 42 47 36 53 34 L53 32 C49 31 46 27 46 22 C46 14 50 8 46 5 Z';

const sideMale =
	'M46 5 C55 5 59 11 59 19 C59 24 56 28 52 29 L52 32 L60 34 C66 36 69 42 69 52 C69 62 67 70 64 76 L65 88 C66 96 65 104 63 112 L62 125 L54 125 L53 112 C52 104 51 96 50 88 L49 76 C46 70 44 62 44 52 C44 42 47 36 53 34 L53 32 C49 31 46 27 46 22 C46 14 50 8 46 5 Z';

const sideChild =
	'M48 8 C54 8 57 13 57 19 C57 23 55 26 52 27 L52 29 L57 31 C61 33 63 38 63 46 C63 54 61 60 58 64 L59 72 C60 78 59 84 57 90 L56 108 L52 108 L51 90 C50 84 49 78 48 72 L47 64 C44 60 42 54 42 46 C42 38 44 33 48 31 L48 29 C45 28 43 25 43 20 C43 14 46 9 48 8 Z';

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
