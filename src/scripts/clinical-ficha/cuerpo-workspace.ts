import {
	BODY_MARK_KINDS,
	BODY_VIEWS,
	JOINT_LENSES,
	JOINT_ROM,
	JOINT_TESTS,
	markKindMeta,
	formatTestResult,
} from '../../lib/clinical-ficha/body-catalog';
import { downloadBodyMapPdf } from '../../lib/clinical-ficha/body-pdf';
import {
	getBodySnapshot,
	getPreviousBodySnapshot,
	saveBodySnapshot,
} from '../../lib/clinical-ficha/body-store';
import type {
	BodyMark,
	BodyMarkKind,
	BodySessionSnapshot,
	BodySilhouette,
	BodyView,
	JointAssessment,
	JointCode,
	TestResult,
} from '../../lib/clinical-ficha/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

const BODY_OUTLINE: Record<BodyView, string> = {
	FRONT:
		'M50 8 C58 8 64 14 64 24 L64 38 C70 40 74 48 74 58 L74 92 C74 98 70 102 64 102 L58 102 L58 118 L42 118 L42 102 L36 102 C30 102 26 98 26 92 L26 58 C26 48 30 40 36 38 L36 24 C36 14 42 8 50 8 Z',
	BACK:
		'M50 8 C58 8 64 14 64 24 L64 38 C70 40 74 48 74 58 L74 92 C74 98 70 102 64 102 L58 102 L58 118 L42 118 L42 102 L36 102 C30 102 26 98 26 92 L26 58 C26 48 30 40 36 38 L36 24 C36 14 42 8 50 8 Z',
	SIDE:
		'M44 8 C52 8 58 16 58 26 L58 40 C64 44 68 52 68 62 L68 96 C68 102 64 106 58 106 L54 106 L54 118 L46 118 L46 106 L42 106 C36 106 32 102 32 96 L32 62 C32 52 36 44 42 40 L42 26 C42 16 36 8 44 8 Z',
};

export type CuerpoWorkspaceContext = {
	customerId: number;
	appointmentId: number;
	customerName: string;
	readOnly?: boolean;
	sessionLabel?: string;
};

export class CuerpoWorkspace {
	private root: HTMLElement;
	private context: CuerpoWorkspaceContext | null = null;
	private view: BodyView = 'FRONT';
	private lens: 'BODY' | JointCode = 'BODY';
	private activeMarkKind: BodyMarkKind = 'PAIN';
	private intensity = 7;
	private silhouette: BodySilhouette = 'NEUTRAL';
	private compareMode = false;
	private snapshot: BodySessionSnapshot | null = null;

	private mapSvg: SVGSVGElement | null = null;
	private mapLayer: SVGGElement | null = null;
	private compareSvg: SVGSVGElement | null = null;
	private compareLayer: SVGGElement | null = null;

	constructor(root: HTMLElement) {
		this.root = root;
		this.bindUi();
	}

	setContext(context: CuerpoWorkspaceContext | null): void {
		this.context = context;
		if (!context || context.customerId <= 0 || context.appointmentId <= 0) {
			this.snapshot = null;
			this.renderEmptyState();
			return;
		}
		const existing = getBodySnapshot(context.customerId, context.appointmentId);
		this.snapshot =
			existing ??
			({
				customerId: context.customerId,
				appointmentId: context.appointmentId,
				capturedAt: new Date().toISOString(),
				silhouette: this.silhouette,
				marks: [],
				joints: [],
				sessionLabel: context.sessionLabel,
			} satisfies BodySessionSnapshot);
		this.silhouette = this.snapshot.silhouette;
		this.renderSessionHeader();
		this.renderMap();
		this.renderSidebar();
		this.renderJointPanel();
	}

	private bindUi(): void {
		this.root.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;

			const viewBtn = target.closest<HTMLButtonElement>('[data-cuerpo-view]');
			if (viewBtn) {
				this.view = (viewBtn.dataset.cuerpoView as BodyView) || 'FRONT';
				this.syncViewButtons();
				this.renderMap();
				return;
			}

			const lensBtn = target.closest<HTMLButtonElement>('[data-cuerpo-lens]');
			if (lensBtn) {
				const lens = lensBtn.dataset.cuerpoLens;
				this.lens = lens === 'BODY' ? 'BODY' : (lens as JointCode);
				this.syncLensButtons();
				this.renderJointPanel();
				return;
			}

			const kindBtn = target.closest<HTMLButtonElement>('[data-cuerpo-mark-kind]');
			if (kindBtn) {
				this.activeMarkKind = (kindBtn.dataset.cuerpoMarkKind as BodyMarkKind) || 'PAIN';
				this.syncMarkKindButtons();
				return;
			}

			if (target.closest('[data-cuerpo-intensity-dec]')) {
				this.intensity = Math.max(0, this.intensity - 1);
				this.syncIntensity();
				return;
			}
			if (target.closest('[data-cuerpo-intensity-inc]')) {
				this.intensity = Math.min(10, this.intensity + 1);
				this.syncIntensity();
				return;
			}

			if (target.closest('[data-cuerpo-silhouette]')) {
				const value = target.closest<HTMLButtonElement>('[data-cuerpo-silhouette]')?.dataset
					.cuerpoSilhouette as BodySilhouette;
				if (value) {
					this.silhouette = value;
					this.persist();
					this.syncSilhouetteButtons();
				}
				return;
			}

			if (target.closest('[data-cuerpo-compare]')) {
				this.compareMode = !this.compareMode;
				this.root.querySelector('[data-cuerpo-compare-wrap]')?.classList.toggle('hidden', !this.compareMode);
				if (this.compareMode) this.renderCompareMap();
				return;
			}

			if (target.closest('[data-cuerpo-pdf]')) {
				void this.exportPdf();
				return;
			}

			if (target.closest('[data-cuerpo-add-mark]')) {
				this.addMarkAtCenter();
				return;
			}

			const testBtn = target.closest<HTMLButtonElement>('[data-cuerpo-test]');
			if (testBtn && this.snapshot) {
				const joint = testBtn.dataset.cuerpoJoint as JointCode;
				const testCode = testBtn.dataset.cuerpoTest || '';
				const result = (testBtn.dataset.cuerpoResult as TestResult) || 'NT';
				this.updateJointTest(joint, testCode, result);
				return;
			}

			const romInput = target.closest<HTMLInputElement>('input[data-cuerpo-rom]');
			if (romInput && this.snapshot) {
				romInput.addEventListener('change', () => this.persistRomFromDom(), { once: true });
			}

			const evaInput = target.closest<HTMLInputElement>('input[data-cuerpo-eva]');
			if (evaInput && this.snapshot) {
				evaInput.addEventListener('change', () => this.persistEvaFromDom(), { once: true });
			}
		});

		this.root.addEventListener('input', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement)) return;
			if (target.matches('[data-cuerpo-intensity-slider]')) {
				this.intensity = Math.max(0, Math.min(10, Number(target.value) || 0));
				this.syncIntensity(false);
			}
			if (target.matches('[data-cuerpo-eva]')) {
				this.persistEvaFromDom();
			}
			if (target.matches('[data-cuerpo-rom]')) {
				this.persistRomFromDom();
			}
		});
	}

	private renderEmptyState(): void {
		const sessionEl = this.root.querySelector('[data-cuerpo-session-label]');
		if (sessionEl) sessionEl.textContent = 'Seleccioná una cita para registrar el mapa.';
	}

	private renderSessionHeader(): void {
		const sessionEl = this.root.querySelector('[data-cuerpo-session-label]');
		if (!sessionEl || !this.context) return;
		const label = this.context.sessionLabel || `Sesión · Cita #${this.context.appointmentId}`;
		sessionEl.textContent = label;
	}

	private renderMap(): void {
		this.mapSvg = this.root.querySelector('[data-cuerpo-map-svg]');
		this.mapLayer = this.root.querySelector('[data-cuerpo-map-marks]');
		if (!this.mapSvg || !this.mapLayer) return;
		this.drawOutline(this.mapSvg);
		this.renderMarks(this.mapLayer, this.snapshot?.marks ?? [], (nx, ny) => {
			if (this.context?.readOnly) return;
			this.addMark(nx, ny);
		});
	}

	private renderCompareMap(): void {
		if (!this.context) return;
		const previous = getPreviousBodySnapshot(this.context.customerId, this.context.appointmentId);
		this.compareSvg = this.root.querySelector('[data-cuerpo-compare-svg]');
		this.compareLayer = this.root.querySelector('[data-cuerpo-compare-marks]');
		const empty = this.root.querySelector('[data-cuerpo-compare-empty]');
		if (!this.compareSvg || !this.compareLayer) return;
		if (!previous) {
			empty?.classList.remove('hidden');
			this.compareLayer.replaceChildren();
			return;
		}
		empty?.classList.add('hidden');
		this.drawOutline(this.compareSvg);
		this.renderMarks(this.compareLayer, previous.marks, () => undefined);
	}

	private drawOutline(svg: SVGSVGElement): void {
		const existing = svg.querySelector('[data-cuerpo-outline]');
		if (existing) existing.remove();
		const path = document.createElementNS(SVG_NS, 'path');
		path.setAttribute('d', BODY_OUTLINE[this.view]);
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.2');
		path.setAttribute('data-cuerpo-outline', '1');
		path.setAttribute('vector-effect', 'non-scaling-stroke');
		svg.appendChild(path);

		svg.onclick = (event) => {
			if (this.context?.readOnly) return;
			const rect = svg.getBoundingClientRect();
			const nx = (event.clientX - rect.left) / rect.width;
			const ny = (event.clientY - rect.top) / rect.height;
			if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
			this.addMark(nx, ny);
		};
	}

	private renderMarks(
		layer: SVGGElement,
		marks: BodyMark[],
		onPlace: (nx: number, ny: number) => void
	): void {
		layer.replaceChildren();
		for (const mark of marks.filter((m) => m.view === this.view)) {
			const meta = markKindMeta(mark.kind);
			const g = document.createElementNS(SVG_NS, 'g');
			g.setAttribute('transform', `translate(${mark.nx * 100}, ${mark.ny * 100})`);

			const halo = document.createElementNS(SVG_NS, 'circle');
			halo.setAttribute('r', String(2 + mark.intensity * 0.35));
			halo.setAttribute('fill', meta.color);
			halo.setAttribute('opacity', '0.28');
			g.appendChild(halo);

			const dot = document.createElementNS(SVG_NS, 'circle');
			dot.setAttribute('r', '1.6');
			dot.setAttribute('fill', meta.color);
			dot.setAttribute('role', 'button');
			dot.setAttribute('tabindex', '0');
			dot.setAttribute('aria-label', `${meta.label}${mark.intensity ? ` ${mark.intensity}/10` : ''}`);
			g.appendChild(dot);

			layer.appendChild(g);
		}
		layer.dataset.clickable = onPlace ? '1' : '0';
	}

	private addMarkAtCenter(): void {
		this.addMark(0.5, 0.45);
	}

	private addMark(nx: number, ny: number): void {
		if (!this.snapshot || !this.context) return;
		const mark: BodyMark = {
			id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			kind: this.activeMarkKind,
			intensity: this.activeMarkKind === 'SCAR' ? 0 : this.intensity,
			view: this.view,
			regionCode: `${this.view}_GENERIC`,
			nx,
			ny,
			side: null,
			note: '',
			createdAt: new Date().toISOString(),
		};
		this.snapshot = { ...this.snapshot, marks: [...this.snapshot.marks, mark] };
		this.persist();
		this.renderMap();
		this.renderSidebar();
	}

	private persist(): void {
		if (!this.snapshot) return;
		this.snapshot = {
			...this.snapshot,
			silhouette: this.silhouette,
			capturedAt: new Date().toISOString(),
		};
		saveBodySnapshot(this.snapshot);
	}

	private renderSidebar(): void {
		const list = this.root.querySelector('[data-cuerpo-marks-list]');
		const empty = this.root.querySelector('[data-cuerpo-marks-empty]');
		if (!list) return;
		list.replaceChildren();
		const marks = this.snapshot?.marks ?? [];
		if (!marks.length) {
			empty?.classList.remove('hidden');
			return;
		}
		empty?.classList.add('hidden');
		for (const mark of [...marks].reverse()) {
			const meta = markKindMeta(mark.kind);
			const li = document.createElement('li');
			li.className = 'cuerpo-mark-item';
			const title = document.createElement('span');
			title.className = 'cuerpo-mark-item__dot';
			title.style.backgroundColor = meta.color;
			const text = document.createElement('span');
			text.textContent = `${meta.label}${mark.intensity ? ` ${mark.intensity}/10` : ''} · ${mark.view}`;
			li.append(title, text);
			list.appendChild(li);
		}
	}

	private renderJointPanel(): void {
		const panel = this.root.querySelector('[data-cuerpo-joint-panel]');
		if (!panel) return;
		if (this.lens === 'BODY') {
			panel.classList.add('hidden');
			panel.setAttribute('hidden', '');
			return;
		}
		panel.classList.remove('hidden');
		panel.removeAttribute('hidden');
		const joint = this.lens;
		const assessment = this.getOrCreateJoint(joint);
		const romDefs = JOINT_ROM[joint];
		const tests = JOINT_TESTS[joint];

		const romWrap = panel.querySelector('[data-cuerpo-rom-fields]');
		if (romWrap) {
			romWrap.replaceChildren();
			for (const def of romDefs) {
				const label = document.createElement('label');
				label.className = 'cuerpo-rom-field';
				const span = document.createElement('span');
				span.textContent = def.label;
				const input = document.createElement('input');
				input.type = 'number';
				input.className = 'cuerpo-rom-field__input';
				input.dataset.cuerpoRom = '1';
				input.dataset.cuerpoJoint = joint;
				input.dataset.cuerpoRomCode = def.code;
				input.value = String(assessment.rom[def.code] ?? '');
				label.append(span, input, document.createTextNode(def.unit));
				romWrap.appendChild(label);
			}
		}

		const testsWrap = panel.querySelector('[data-cuerpo-tests]');
		if (testsWrap) {
			testsWrap.replaceChildren();
			for (const test of tests) {
				const row = document.createElement('div');
				row.className = 'cuerpo-test-row';
				const name = document.createElement('span');
				name.textContent = test.label;
				const actions = document.createElement('div');
				actions.className = 'cuerpo-test-row__actions';
				for (const result of ['NEG', 'POS', 'NT'] as TestResult[]) {
					const btn = document.createElement('button');
					btn.type = 'button';
					btn.className = 'cuerpo-test-chip';
					btn.dataset.cuerpoTest = test.code;
					btn.dataset.cuerpoJoint = joint;
					btn.dataset.cuerpoResult = result;
					const formatted = formatTestResult(result);
					btn.textContent = formatted.label;
					btn.classList.toggle('is-active', assessment.tests.find((t) => t.code === test.code)?.result === result);
					btn.classList.toggle(`cuerpo-test-chip--${formatted.tone}`, assessment.tests.find((t) => t.code === test.code)?.result === result);
					actions.appendChild(btn);
				}
				row.append(name, actions);
				testsWrap.appendChild(row);
			}
		}

		const evaInput = panel.querySelector<HTMLInputElement>('[data-cuerpo-eva]');
		if (evaInput) evaInput.value = String(assessment.eva);
	}

	private getOrCreateJoint(joint: JointCode): JointAssessment {
		if (!this.snapshot) {
			return { joint, side: 'R', rom: {}, tests: [], eva: 0 };
		}
		let assessment = this.snapshot.joints.find((j) => j.joint === joint);
		if (!assessment) {
			assessment = { joint, side: 'R', rom: {}, tests: [], eva: 0 };
			this.snapshot = { ...this.snapshot, joints: [...this.snapshot.joints, assessment] };
			this.persist();
		}
		return assessment;
	}

	private updateJointTest(joint: JointCode, testCode: string, result: TestResult): void {
		if (!this.snapshot) return;
		const assessment = this.getOrCreateJoint(joint);
		const tests = assessment.tests.filter((t) => t.code !== testCode);
		tests.push({ code: testCode, result });
		this.snapshot = {
			...this.snapshot,
			joints: this.snapshot.joints.map((j) =>
				j.joint === joint ? { ...j, tests } : j
			),
		};
		this.persist();
		this.renderJointPanel();
	}

	private persistRomFromDom(): void {
		if (!this.snapshot || this.lens === 'BODY') return;
		const joint = this.lens;
		const assessment = this.getOrCreateJoint(joint);
		const rom: Record<string, number> = { ...assessment.rom };
		for (const input of this.root.querySelectorAll<HTMLInputElement>(
			`input[data-cuerpo-rom][data-cuerpo-joint="${joint}"]`
		)) {
			const code = input.dataset.cuerpoRomCode || '';
			const value = Number(input.value);
			if (code && Number.isFinite(value)) rom[code] = value;
		}
		this.snapshot = {
			...this.snapshot,
			joints: this.snapshot.joints.map((j) => (j.joint === joint ? { ...j, rom } : j)),
		};
		this.persist();
	}

	private persistEvaFromDom(): void {
		if (!this.snapshot || this.lens === 'BODY') return;
		const joint = this.lens;
		const input = this.root.querySelector<HTMLInputElement>('[data-cuerpo-eva]');
		const eva = Math.max(0, Math.min(10, Number(input?.value) || 0));
		this.snapshot = {
			...this.snapshot,
			joints: this.snapshot.joints.map((j) => (j.joint === joint ? { ...j, eva } : j)),
		};
		this.persist();
	}

	private syncViewButtons(): void {
		for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-cuerpo-view]')) {
			btn.classList.toggle('is-active', btn.dataset.cuerpoView === this.view);
			btn.setAttribute('aria-pressed', btn.dataset.cuerpoView === this.view ? 'true' : 'false');
		}
	}

	private syncLensButtons(): void {
		for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-cuerpo-lens]')) {
			const lens = btn.dataset.cuerpoLens;
			const active = lens === this.lens || (this.lens === 'BODY' && lens === 'BODY');
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-pressed', active ? 'true' : 'false');
		}
	}

	private syncMarkKindButtons(): void {
		for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-cuerpo-mark-kind]')) {
			btn.classList.toggle('is-active', btn.dataset.cuerpoMarkKind === this.activeMarkKind);
		}
	}

	private syncIntensity(updateSlider = true): void {
		const valueEl = this.root.querySelector('[data-cuerpo-intensity-value]');
		if (valueEl) valueEl.textContent = String(this.intensity);
		const slider = this.root.querySelector<HTMLInputElement>('[data-cuerpo-intensity-slider]');
		if (slider && updateSlider) slider.value = String(this.intensity);
	}

	private syncSilhouetteButtons(): void {
		for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-cuerpo-silhouette]')) {
			btn.classList.toggle('is-active', btn.dataset.cuerpoSilhouette === this.silhouette);
		}
	}

	private async exportPdf(): Promise<void> {
		if (!this.snapshot || !this.context) return;
		let mapImage: string | null = null;
		if (this.mapSvg) {
			try {
				const serializer = new XMLSerializer();
				const source = serializer.serializeToString(this.mapSvg);
				const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
				const url = URL.createObjectURL(blob);
				const img = new Image();
				await new Promise<void>((resolve, reject) => {
					img.onload = () => resolve();
					img.onerror = () => reject(new Error('svg'));
					img.src = url;
				});
				const canvas = document.createElement('canvas');
				canvas.width = 300;
				canvas.height = 400;
				const ctx = canvas.getContext('2d');
				if (ctx) {
					ctx.fillStyle = '#ffffff';
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
					mapImage = canvas.toDataURL('image/png');
				}
				URL.revokeObjectURL(url);
			} catch {
				mapImage = null;
			}
		}
		downloadBodyMapPdf({
			customerName: this.context.customerName,
			snapshot: this.snapshot,
			mapImage,
		});
	}
}
