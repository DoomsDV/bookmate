import type { OdontogramFaces } from './odontogram';

export type OdontogramClinicalPhase = 'FINDING' | 'PREEXISTING' | 'PLAN';

export type OdontogramVisualKind = 'TINT' | 'FACES' | 'GHOST' | 'HIDE' | 'CROWN';

export type OdontogramFaceKey = keyof OdontogramFaces;

export type OdontogramCatalogEntry = {
	code: string;
	label: string;
	clinical_phase: OdontogramClinicalPhase;
	needs_faces: boolean;
	color: string;
	visual_kind: OdontogramVisualKind;
	priority_rank: number;
};

export type OdontogramCatalogCategory = {
	id: OdontogramClinicalPhase;
	label: string;
	description: string;
	entries: OdontogramCatalogEntry[];
};

export const ODONTOGRAM_CATALOG_ENTRIES: OdontogramCatalogEntry[] = [
	{
		code: 'ABSENT',
		label: 'Diente ausente',
		clinical_phase: 'FINDING',
		needs_faces: false,
		color: '#bdbdbd',
		visual_kind: 'HIDE',
		priority_rank: -10,
	},
	{
		code: 'FRACTURE',
		label: 'Fractura / traumatismo',
		clinical_phase: 'FINDING',
		needs_faces: true,
		color: '#ff7043',
		visual_kind: 'FACES',
		priority_rank: 35,
	},
	{
		code: 'CARIES',
		label: 'Caries',
		clinical_phase: 'FINDING',
		needs_faces: true,
		color: '#e040fb',
		visual_kind: 'FACES',
		priority_rank: 40,
	},
	{
		code: 'DEFECTIVE_RESTORATION',
		label: 'Restauración defectuosa',
		clinical_phase: 'FINDING',
		needs_faces: true,
		color: '#e53935',
		visual_kind: 'FACES',
		priority_rank: 30,
	},
	{
		code: 'PERIODONTAL',
		label: 'Enfermedad periodontal',
		clinical_phase: 'FINDING',
		needs_faces: false,
		color: '#8d6e63',
		visual_kind: 'TINT',
		priority_rank: 70,
	},
	{
		code: 'ENDODONTIC',
		label: 'Endodoncia existente',
		clinical_phase: 'PREEXISTING',
		needs_faces: false,
		color: '#78909c',
		visual_kind: 'TINT',
		priority_rank: 55,
	},
	{
		code: 'IMPLANT',
		label: 'Implante existente',
		clinical_phase: 'PREEXISTING',
		needs_faces: false,
		color: '#607d8b',
		visual_kind: 'TINT',
		priority_rank: 15,
	},
	{
		code: 'CROWN_EXISTING',
		label: 'Corona existente',
		clinical_phase: 'PREEXISTING',
		needs_faces: false,
		color: '#ffb300',
		visual_kind: 'CROWN',
		priority_rank: 20,
	},
	{
		code: 'RESTORATION',
		label: 'Restauración',
		clinical_phase: 'PREEXISTING',
		needs_faces: true,
		color: '#00bcd4',
		visual_kind: 'FACES',
		priority_rank: 50,
	},
	{
		code: 'SEALANT',
		label: 'Sellador',
		clinical_phase: 'PREEXISTING',
		needs_faces: true,
		color: '#4fc3f7',
		visual_kind: 'FACES',
		priority_rank: 60,
	},
	{
		code: 'EXTRACTION',
		label: 'Extracción',
		clinical_phase: 'PLAN',
		needs_faces: false,
		color: '#9e9e9e',
		visual_kind: 'GHOST',
		priority_rank: 0,
	},
	{
		code: 'IMPLANT_PLAN',
		label: 'Implante dental',
		clinical_phase: 'PLAN',
		needs_faces: false,
		color: '#90a4ae',
		visual_kind: 'GHOST',
		priority_rank: 5,
	},
	{
		code: 'CROWN',
		label: 'Corona',
		clinical_phase: 'PLAN',
		needs_faces: false,
		color: '#ffca28',
		visual_kind: 'CROWN',
		priority_rank: 10,
	},
	{
		code: 'RESTORATION_PLAN',
		label: 'Restauración nueva',
		clinical_phase: 'PLAN',
		needs_faces: true,
		color: '#26c6da',
		visual_kind: 'FACES',
		priority_rank: 45,
	},
	{
		code: 'ENDODONTIC_PLAN',
		label: 'Endodoncia nueva',
		clinical_phase: 'PLAN',
		needs_faces: false,
		color: '#90a4ae',
		visual_kind: 'TINT',
		priority_rank: 48,
	},
];

const CATEGORY_META: Record<
	OdontogramClinicalPhase,
	{ label: string; description: string }
> = {
	FINDING: {
		label: 'Diagnósticos / Hallazgos',
		description: 'Lo que el paciente presenta ahora.',
	},
	PREEXISTING: {
		label: 'Preexistencias',
		description: 'Trabajos o condiciones previas en buen estado o ya tratadas.',
	},
	PLAN: {
		label: 'Plan de tratamiento',
		description: 'Procedimientos indicados o previstos.',
	},
};

export const ODONTOGRAM_CATALOG_CATEGORIES: OdontogramCatalogCategory[] = (
	['FINDING', 'PREEXISTING', 'PLAN'] as const
).map((id) => ({
	id,
	...CATEGORY_META[id],
	entries: ODONTOGRAM_CATALOG_ENTRIES.filter((entry) => entry.clinical_phase === id),
}));

const STATIC_CATALOG_BY_CODE = new Map(
	ODONTOGRAM_CATALOG_ENTRIES.map((entry) => [entry.code, entry])
);

export const normalizeVisualKind = (value: unknown): OdontogramVisualKind => {
	const normalized = String(value || '').trim().toUpperCase();
	if (
		normalized === 'FACES' ||
		normalized === 'GHOST' ||
		normalized === 'HIDE' ||
		normalized === 'CROWN'
	) {
		return normalized;
	}
	return 'TINT';
};

export const normalizeFindingCode = (value: unknown): string | null => {
	const code = String(value || '').trim().toUpperCase();
	if (!code || code.length > 40) return null;
	return /^[A-Z][A-Z0-9_]*$/.test(code) ? code : null;
};

export const getCatalogEntry = (
	code: string | null | undefined,
	catalog: readonly OdontogramCatalogEntry[] = ODONTOGRAM_CATALOG_ENTRIES
) => {
	const normalized = normalizeFindingCode(code);
	if (!normalized) return null;
	return catalog.find((entry) => entry.code === normalized) ?? STATIC_CATALOG_BY_CODE.get(normalized) ?? null;
};

export type CatalogEntrySource = {
	code: string;
	label?: string;
	clinical_phase?: string;
	needs_faces?: boolean | number;
	color?: string | null;
	visual_kind?: string | null;
	priority_rank?: number;
};

export const mergeCatalogEntry = (item: CatalogEntrySource): OdontogramCatalogEntry => {
	const code = normalizeFindingCode(item.code) ?? String(item.code || '').trim().toUpperCase();
	const staticEntry = STATIC_CATALOG_BY_CODE.get(code);
	const needsFaces = item.needs_faces === 1 || item.needs_faces === true;
	const rawVisualKind = String(item.visual_kind || '').trim().toUpperCase();
	const hasExplicitVisualKind =
		rawVisualKind === 'FACES' ||
		rawVisualKind === 'GHOST' ||
		rawVisualKind === 'HIDE' ||
		rawVisualKind === 'CROWN' ||
		rawVisualKind === 'TINT';

	return {
		code,
		label: String(item.label || staticEntry?.label || code).trim() || code,
		clinical_phase:
			item.clinical_phase === 'PREEXISTING' || item.clinical_phase === 'PLAN'
				? item.clinical_phase
				: staticEntry?.clinical_phase ?? 'FINDING',
		needs_faces: needsFaces || staticEntry?.needs_faces === true,
		color: item.color ?? staticEntry?.color ?? '#9e9e9e',
		visual_kind: hasExplicitVisualKind
			? normalizeVisualKind(rawVisualKind)
			: staticEntry?.visual_kind ?? (needsFaces ? 'FACES' : 'TINT'),
		priority_rank: Number.isFinite(Number(item.priority_rank))
			? Number(item.priority_rank)
			: staticEntry?.priority_rank ?? 50,
	};
};

export const inferVisualKindFor3d = (
	entry: OdontogramCatalogEntry | null | undefined,
	findingCode: string | null | undefined
): OdontogramVisualKind => {
	let kind: OdontogramVisualKind;
	if (entry?.visual_kind) {
		kind = entry.visual_kind;
	} else {
		const staticEntry = getCatalogEntry(findingCode, ODONTOGRAM_CATALOG_ENTRIES);
		if (staticEntry?.visual_kind) kind = staticEntry.visual_kind;
		else if (entry?.needs_faces) kind = 'FACES';
		else kind = 'TINT';
	}
	// GLB monolítico: hallazgos por cara se pintan como tint de pieza completa.
	return kind === 'FACES' ? 'TINT' : kind;
};

export const findingNeedsFaces = (
	code: string | null | undefined,
	catalog: readonly OdontogramCatalogEntry[] = ODONTOGRAM_CATALOG_ENTRIES
) => getCatalogEntry(code, catalog)?.needs_faces === true;

export const defaultClinicalPhaseForFinding = (
	code: string | null | undefined,
	catalog: readonly OdontogramCatalogEntry[] = ODONTOGRAM_CATALOG_ENTRIES
): OdontogramClinicalPhase => getCatalogEntry(code, catalog)?.clinical_phase ?? 'FINDING';

export const isUpperToothFdi = (toothFdi: number) => toothFdi >= 11 && toothFdi <= 28;

export const isAnteriorToothFdi = (toothFdi: number) => {
	const position = toothFdi % 10;
	return position >= 1 && position <= 3;
};

export const faceLabel = (toothFdi: number, face: OdontogramFaceKey): string => {
	switch (face) {
		case 'occlusal':
			return isAnteriorToothFdi(toothFdi) ? 'Incisal' : 'Oclusal';
		case 'vestibular':
			return isAnteriorToothFdi(toothFdi) ? 'Labial' : 'Vestibular';
		case 'palatal':
			return isUpperToothFdi(toothFdi) ? 'Palatina' : 'Lingual';
		case 'mesial':
			return 'Mesial';
		case 'distal':
			return 'Distal';
		default:
			return face;
	}
};

const isFaceMarked = (value: unknown) => value === 1 || value === true || value === '1';

export const formatOdontogramFacesLabels = (
	toothFdi: number,
	faces: Partial<OdontogramFaces> | null | undefined
) => {
	if (!faces) return '';
	const labels: string[] = [];
	if (isFaceMarked(faces.occlusal)) labels.push(faceLabel(toothFdi, 'occlusal'));
	if (isFaceMarked(faces.vestibular)) labels.push(faceLabel(toothFdi, 'vestibular'));
	if (isFaceMarked(faces.palatal)) labels.push(faceLabel(toothFdi, 'palatal'));
	if (isFaceMarked(faces.mesial)) labels.push(faceLabel(toothFdi, 'mesial'));
	if (isFaceMarked(faces.distal)) labels.push(faceLabel(toothFdi, 'distal'));
	return labels.join(', ');
};

export const formatFindingLabel = (
	code: string | null | undefined,
	catalog: readonly OdontogramCatalogEntry[] = ODONTOGRAM_CATALOG_ENTRIES
) => getCatalogEntry(code, catalog)?.label ?? normalizeFindingCode(code) ?? 'Hallazgo';

export const formatClinicalPhaseLabel = (phase: string | null | undefined) => {
	const normalized = String(phase || '').trim().toUpperCase();
	if (normalized === 'PREEXISTING') return 'Preexistencia';
	if (normalized === 'PLAN') return 'Plan';
	return 'Hallazgo';
};

export const clinicalPhaseSwatchClass = (phase: string | null | undefined) => {
	const normalized = String(phase || '').trim().toUpperCase();
	if (normalized === 'PREEXISTING') return 'customer-odontogram-tool__swatch--preexisting';
	if (normalized === 'PLAN') return 'customer-odontogram-tool__swatch--plan';
	return 'customer-odontogram-tool__swatch--finding';
};

export const findingSwatchStyle = (
	code: string | null | undefined,
	catalog: readonly OdontogramCatalogEntry[] = ODONTOGRAM_CATALOG_ENTRIES
) => {
	const color = getCatalogEntry(code, catalog)?.color;
	return color ? { backgroundColor: color } : null;
};

