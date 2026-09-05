export type BodyMarkKind = 'PAIN' | 'TENSION' | 'WORK' | 'SCAR' | 'EDEMA';
export type BodyView = 'FRONT' | 'BACK' | 'SIDE';
export type JointCode = 'SHOULDER' | 'HIP' | 'KNEE' | 'ANKLE';
export type TestResult = 'POS' | 'NEG' | 'NT';
export type BodySilhouette = 'NEUTRAL' | 'FEMALE' | 'MALE' | 'CHILD';
export type ClinicalWorkspaceCode = 'odontogram' | 'cuerpo';

export type BodyMark = {
	id: string;
	kind: BodyMarkKind;
	intensity: number;
	view: BodyView;
	regionCode: string;
	nx: number;
	ny: number;
	side: 'L' | 'R' | null;
	note: string;
	createdAt: string;
};

export type JointAssessment = {
	joint: JointCode;
	side: 'L' | 'R';
	rom: Record<string, number | undefined>;
	tests: { code: string; result: TestResult }[];
	eva: number;
};

export type BodySessionSnapshot = {
	customerId: number;
	appointmentId: number;
	capturedAt: string;
	silhouette: BodySilhouette;
	marks: BodyMark[];
	joints: JointAssessment[];
	sessionLabel?: string;
};

export type FichaAddonCard = {
	code: ClinicalWorkspaceCode;
	featureCode: string;
	title: string;
	description: string;
	icon: string;
	eligible: boolean;
	active: boolean;
	locked: boolean;
};
