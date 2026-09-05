import type { ClinicalWorkspaceCode } from './types';

export type OpenClinicalWorkspaceDetail = {
	customerId: number;
	appointmentId?: number;
	workspace: ClinicalWorkspaceCode;
	customerName?: string;
	sessionLabel?: string;
	readOnly?: boolean;
};

export const OPEN_CLINICAL_WORKSPACE_EVENT = 'hasel:open-clinical-workspace';

export const dispatchOpenClinicalWorkspace = (detail: OpenClinicalWorkspaceDetail): void => {
	document.dispatchEvent(new CustomEvent(OPEN_CLINICAL_WORKSPACE_EVENT, { detail }));
};

export const parseClinicalDeepLink = (): Partial<OpenClinicalWorkspaceDetail> | null => {
	if (typeof window === 'undefined') return null;
	const params = new URLSearchParams(window.location.search);
	const customerId = Number(params.get('customer') || params.get('customerId') || 0);
	const appointmentId = Number(params.get('appointment') || params.get('appointmentId') || 0);
	const workspace = String(params.get('workspace') || '').trim().toLowerCase();
	if (customerId <= 0) return null;
	const mapped =
		workspace === 'cuerpo' || workspace === 'body_map'
			? 'cuerpo'
			: workspace === 'odontogram' || workspace === 'odontograma'
				? 'odontogram'
				: null;
	if (!mapped) return null;
	return {
		customerId,
		appointmentId: appointmentId > 0 ? appointmentId : undefined,
		workspace: mapped,
	};
};
