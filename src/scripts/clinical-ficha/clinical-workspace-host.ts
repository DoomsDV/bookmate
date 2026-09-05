import type { ClinicalWorkspaceCode } from '../../lib/clinical-ficha/types';

export type ClinicalWorkspaceHostOptions = {
	modal: HTMLElement | null;
	panel: HTMLElement | null;
	hub: HTMLElement | null;
	workspaceRoot: HTMLElement | null;
	workspaceTitle: HTMLElement | null;
	onWorkspaceOpen?: (code: ClinicalWorkspaceCode) => void;
	onWorkspaceClose?: () => void;
};

const WORKSPACE_LABELS: Record<ClinicalWorkspaceCode, string> = {
	odontogram: 'Odontograma 3D',
	cuerpo: 'Mapa corporal',
};

export class ClinicalWorkspaceHost {
	private active: ClinicalWorkspaceCode | null = null;

	constructor(private readonly options: ClinicalWorkspaceHostOptions) {}

	getActive(): ClinicalWorkspaceCode | null {
		return this.active;
	}

	isOpen(): boolean {
		return this.active !== null;
	}

	open(code: ClinicalWorkspaceCode): void {
		this.active = code;
		this.options.hub?.classList.add('hidden');
		this.options.hub?.setAttribute('hidden', '');
		this.options.workspaceRoot?.classList.remove('hidden');
		this.options.workspaceRoot?.removeAttribute('hidden');
		if (this.options.workspaceTitle) {
			this.options.workspaceTitle.textContent = WORKSPACE_LABELS[code] ?? 'Clínica';
		}
		for (const panel of this.options.workspaceRoot?.querySelectorAll<HTMLElement>(
			'[data-clinical-workspace-panel]'
		) ?? []) {
			const isActive = panel.dataset.clinicalWorkspacePanel === code;
			panel.classList.toggle('hidden', !isActive);
			if (isActive) panel.removeAttribute('hidden');
			else panel.setAttribute('hidden', '');
		}
		this.setClinicalWorkspaceMode(true);
		this.options.onWorkspaceOpen?.(code);
	}

	close(): void {
		if (!this.active) return;
		this.active = null;
		this.options.hub?.classList.remove('hidden');
		this.options.hub?.removeAttribute('hidden');
		this.options.workspaceRoot?.classList.add('hidden');
		this.options.workspaceRoot?.setAttribute('hidden', '');
		this.setClinicalWorkspaceMode(false);
		this.options.onWorkspaceClose?.();
	}

	handleEscape(): boolean {
		if (!this.active) return false;
		this.close();
		return true;
	}

	private setClinicalWorkspaceMode(active: boolean): void {
		this.options.modal?.classList.toggle('is-clinical-workspace', active);
		this.options.modal?.classList.toggle('is-odontogram-workspace', active);
		this.options.panel?.classList.toggle('is-clinical-workspace', active);
		this.options.panel?.classList.toggle('is-odontogram-workspace', active);
	}
}
