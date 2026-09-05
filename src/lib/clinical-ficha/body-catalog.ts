import type { BodyMarkKind, BodyView, JointCode, TestResult } from './types';

export const BODY_MARK_KINDS: { code: BodyMarkKind; label: string; color: string }[] = [
	{ code: 'PAIN', label: 'Dolor', color: '#C23B3B' },
	{ code: 'TENSION', label: 'Tensión', color: '#E07A2F' },
	{ code: 'WORK', label: 'Trabajo', color: '#1F7A6B' },
	{ code: 'SCAR', label: 'Cicatriz', color: '#6B4C9A' },
	{ code: 'EDEMA', label: 'Edema', color: '#4A6FA5' },
];

export const BODY_VIEWS: { code: BodyView; label: string }[] = [
	{ code: 'FRONT', label: 'Frente' },
	{ code: 'BACK', label: 'Espalda' },
	{ code: 'SIDE', label: 'Lado' },
];

export const JOINT_LENSES: { code: JointCode; label: string }[] = [
	{ code: 'SHOULDER', label: 'Hombro' },
	{ code: 'HIP', label: 'Cadera' },
	{ code: 'KNEE', label: 'Rodilla' },
	{ code: 'ANKLE', label: 'Tobillo' },
];

const FORBIDDEN_REGION_PREFIXES = ['SPINE_', 'FACE_', 'NAIL_'];

export const isAllowedBodyRegion = (code: string): boolean => {
	const normalized = String(code || '').trim().toUpperCase();
	if (!normalized) return false;
	return !FORBIDDEN_REGION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

export type JointTestDef = { code: string; label: string };
export type JointRomDef = { code: string; label: string; unit: string };

export const JOINT_TESTS: Record<JointCode, JointTestDef[]> = {
	SHOULDER: [
		{ code: 'NEER', label: 'Neer' },
		{ code: 'HAWKINS', label: 'Hawkins' },
		{ code: 'JOBES', label: 'Jobe' },
	],
	HIP: [
		{ code: 'FABER', label: 'FABER' },
		{ code: 'FADIR', label: 'FADIR' },
		{ code: 'THOMAS', label: 'Thomas' },
	],
	KNEE: [
		{ code: 'LACHMAN', label: 'Lachman' },
		{ code: 'DRAWER_ANT', label: 'Cajón ant.' },
		{ code: 'MCMURRAY', label: 'McMurray' },
	],
	ANKLE: [
		{ code: 'ANTERIOR_DRAWER', label: 'Cajón ant.' },
		{ code: 'TALAR_TILT', label: 'Inclinación talar' },
		{ code: 'THOMPSON', label: 'Thompson' },
	],
};

export const JOINT_ROM: Record<JointCode, JointRomDef[]> = {
	SHOULDER: [
		{ code: 'flexion', label: 'Flexión', unit: '°' },
		{ code: 'abduction', label: 'Abducción', unit: '°' },
		{ code: 'rotation_ext', label: 'Rot. ext.', unit: '°' },
	],
	HIP: [
		{ code: 'flexion', label: 'Flexión', unit: '°' },
		{ code: 'extension', label: 'Extensión', unit: '°' },
		{ code: 'abduction', label: 'Abducción', unit: '°' },
	],
	KNEE: [
		{ code: 'flexion', label: 'Flexión', unit: '°' },
		{ code: 'extension', label: 'Extensión', unit: '°' },
		{ code: 'rotation_int', label: 'Rot. interna', unit: '°' },
	],
	ANKLE: [
		{ code: 'dorsiflexion', label: 'Dorsiflexión', unit: '°' },
		{ code: 'plantarflexion', label: 'Plantarflexión', unit: '°' },
		{ code: 'inversion', label: 'Inversión', unit: '°' },
	],
};

export const markKindMeta = (kind: BodyMarkKind) =>
	BODY_MARK_KINDS.find((item) => item.code === kind) ?? BODY_MARK_KINDS[0];

export const formatTestResult = (result: TestResult): { label: string; tone: 'ok' | 'bad' | 'muted' } => {
	if (result === 'POS') return { label: 'pos', tone: 'bad' };
	if (result === 'NEG') return { label: 'neg', tone: 'ok' };
	return { label: 'nt', tone: 'muted' };
};
