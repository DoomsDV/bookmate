import {
	BODY_MARK_KINDS,
	BODY_VIEWS,
	formatMarkSummary,
	isAllowedBodyRegion,
	JOINT_PREFERRED_VIEW,
	JOINT_ROM,
	JOINT_TESTS,
	markKindMeta,
	formatTestResult,
} from '../../lib/clinical-ficha/body-catalog';
import { downloadBodyMapPdf } from '../../lib/clinical-ficha/body-pdf';
import {
	BODY_VIEWBOX,
	getActiveMapViewBox,
	getBodyOutline,
	JOINT_VIEWPORTS,
	markToViewCoords,
	resolveBodyRegion,
	SILHOUETTE_LABELS,
} from '../../lib/clinical-ficha/body-silhouettes';
import {
	fetchBodySnapshot,
	fetchLatestBodySnapshot,
	getBodySnapshot,
	getLatestBodySnapshot,
	getPreviousBodySnapshot,
	isBodySnapshotDirty,
	markBodySnapshotClean,
	markBodySnapshotDirty,
	persistBodySnapshot,
	prefetchBodySnapshotsForCustomer,
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

const normalizeSilhouette = (value: BodySilhouette | undefined): BodySilhouette =>
	!value || value === 'NEUTRAL' ? 'FEMALE' : value;

const SVG_NS = 'http://www.w3.org/2000/svg';

export type CuerpoWorkspaceContext = {
	customerId: number;
	/** 0 = estado actual (solo lectura, último snapshot). */
	appointmentId: number;
	customerName: string;
	readOnly?: boolean;
	sessionLabel?: string;
	embedded?: boolean;
};

export class CuerpoWorkspace {
	private root: HTMLElement;
	private context: CuerpoWorkspaceContext | null = null;
	private view: BodyView = 'FRONT';
	private lens: 'BODY' | JointCode = 'BODY';
	private activeMarkKind: BodyMarkKind = 'PAIN';
	private activeMarkSide: 'L' | 'R' = 'R';
	private intensity = 7;
	private silhouette: BodySilhouette = 'FEMALE';
	private compareMode = false;
	private snapshot: BodySessionSnapshot | null = null;
	private dirty = false;
	private persisted = false;
	private loadToken = 0;
	private editingMarkId: string | null = null;
	private selectedMarkId: string | null = null;
	private saving = false;

	private mapSvg: SVGSVGElement | null = null;
	private mapLayer: SVGGElement | null = null;
	private outlineLayer: SVGGElement | null = null;
	private compareSvg: SVGSVGElement | null = null;
	private compareLayer: SVGGElement | null = null;

	constructor(root: HTMLElement) {
		this.root = root;
		this.bindUi();
	}

	setContext(context: CuerpoWorkspaceContext | null): void {
		if (!context || context.customerId <= 0) {
			this.clearContext();
			return;
		}

		const sameSession =
			this.context?.customerId === context.customerId &&
			this.context?.appointmentId === context.appointmentId &&
			Boolean(this.snapshot);

		this.context = context;
		if (sameSession) {
			this.renderSessionHeader();
			this.syncReadOnlyUi();
			this.syncDraftBanner();
			this.syncSaveButton();
			return;
		}

		void this.applyContext(context);
	}

	clearContext(): void {
		this.context = null;
		this.snapshot = null;
		this.dirty = false;
		this.persisted = false;
		this.editingMarkId = null;
		this.selectedMarkId = null;
		this.renderEmptyState();
		this.syncDraftBanner();
		this.syncReadOnlyUi();
		this.syncSaveButton();
	}

	getSnapshot(): BodySessionSnapshot | null {
		return this.snapshot ? { ...this.snapshot, marks: [...this.snapshot.marks], joints: [...this.snapshot.joints] } : null;
	}

	hasPendingSnapshot(): boolean {
		return Boolean(this.snapshot && this.dirty && this.context && this.context.appointmentId > 0);
	}

	async saveSession(): Promise<void> {
		if (this.saving || this.isReadOnly()) return;
		try {
			await this.flushSnapshotToServer();
		} catch (error) {
			const banner = this.root.querySelector('[data-cuerpo-draft-banner]');
			if (banner) {
				banner.textContent =
					error instanceof Error
						? error.message
						: 'No fue posible guardar el mapa corporal.';
				banner.classList.remove('hidden');
				banner.removeAttribute('hidden');
			}
			throw error;
		}
	}

	async flushSnapshotToServer(): Promise<void> {
		if (!this.snapshot || !this.context || this.context.appointmentId <= 0) return;
		this.saving = true;
		this.syncSaveButton();
		try {
			await persistBodySnapshot(this.snapshot);
			this.dirty = false;
			this.persisted = true;
			markBodySnapshotClean(this.context.customerId, this.context.appointmentId);
			this.syncDraftBanner();
			this.syncSaveButton();
		} finally {
			this.saving = false;
			this.syncSaveButton();
		}
	}

	private isReadOnly(): boolean {
		if (!this.context) return true;
		if (this.context.appointmentId <= 0) return true;
		return this.context.readOnly === true;
	}

	private async applyContext(context: CuerpoWorkspaceContext): Promise<void> {
		const token = ++this.loadToken;
		this.lens = 'BODY';
		this.syncLensButtons();
		this.syncZoomLabel();

		if (context.appointmentId <= 0) {
			this.dirty = false;
			this.persisted = false;
			const latest =
				getLatestBodySnapshot(context.customerId) ??
				(await fetchLatestBodySnapshot(context.customerId));
			if (token !== this.loadToken) return;
			this.snapshot = latest ? { ...latest } : null;
			this.hydrateFromSnapshot();
			return;
		}

		void prefetchBodySnapshotsForCustomer(context.customerId);

		const cached = getBodySnapshot(context.customerId, context.appointmentId);
		const localDirty = isBodySnapshotDirty(context.customerId, context.appointmentId);
		let snapshot = cached;

		if (!cached) {
			snapshot = await fetchBodySnapshot(context.customerId, context.appointmentId);
		}

		if (token !== this.loadToken) return;

		this.snapshot =
			snapshot ??
			({
				customerId: context.customerId,
				appointmentId: context.appointmentId,
				capturedAt: new Date().toISOString(),
				silhouette: this.silhouette,
				marks: [],
				joints: [],
				sessionLabel: context.sessionLabel,
			} satisfies BodySessionSnapshot);

		this.dirty = Boolean(cached && localDirty);
		this.persisted = Boolean(snapshot && !this.dirty);
		this.hydrateFromSnapshot();
	}

	private hydrateFromSnapshot(): void {
		this.silhouette = normalizeSilhouette(this.snapshot?.silhouette);
		if (this.snapshot && this.snapshot.silhouette !== this.silhouette) {
			this.snapshot = { ...this.snapshot, silhouette: this.silhouette };
		}
		this.renderSessionHeader();
		this.syncViewButtons();
		this.syncSilhouetteButtons();
		this.syncMarkKindButtons();
		this.syncMarkSideButtons();
		this.syncIntensity();
		this.renderMap();
		this.renderSidebar();
		this.renderJointPanel();
		this.syncDraftBanner();
		this.syncReadOnlyUi();
		this.syncSaveButton();
	}

	private syncDraftBanner(): void {
		const banner = this.root.querySelector('[data-cuerpo-draft-banner]');
		if (!banner) return;
		const show = Boolean(this.snapshot && this.dirty && !this.persisted && !this.isReadOnly());
		banner.classList.toggle('hidden', !show);
		if (show) {
			banner.textContent = 'Cambios sin guardar en esta sesión.';
			banner.removeAttribute('hidden');
		} else {
			banner.setAttribute('hidden', '');
		}
	}

	private syncSaveButton(): void {
		const button = this.root.querySelector<HTMLButtonElement>('[data-cuerpo-save-session]');
		if (!button) return;
		const readOnly = this.isReadOnly();
		const show = !readOnly && this.context && this.context.appointmentId > 0;
		button.classList.toggle('hidden', !show);
		if (!show) {
			button.disabled = true;
			return;
		}
		button.disabled = this.saving || !this.dirty;
		if (this.saving) {
			button.textContent = 'Guardando…';
		} else if (this.dirty) {
			button.innerHTML =
				'<span class="material-symbols-rounded" aria-hidden="true">save</span> Guardar sesión';
		} else {
			button.innerHTML =
				'<span class="material-symbols-rounded" aria-hidden="true">check</span> Sesión guardada';
		}
	}

	private syncReadOnlyUi(): void {
		const readOnly = this.isReadOnly();
		for (const selector of [
			'[data-cuerpo-add-mark]',
			'[data-cuerpo-save-session]',
			'[data-cuerpo-intensity-dec]',
			'[data-cuerpo-intensity-inc]',
			'[data-cuerpo-intensity-slider]',
			'[data-cuerpo-mark-kind]',
			'[data-cuerpo-mark-side]',
			'[data-cuerpo-silhouette]',
			'[data-cuerpo-rom]',
			'[data-cuerpo-eva]',
			'[data-cuerpo-test]',
		]) {
			for (const el of this.root.querySelectorAll<HTMLElement>(selector)) {
				if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
					el.disabled = readOnly;
				}
			}
		}
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
				this.renderSidebar();
				if (this.compareMode) void this.renderCompareMap();
				return;
			}

			const lensBtn = target.closest<HTMLButtonElement>('[data-cuerpo-lens]');
			if (lensBtn) {
				const lens = lensBtn.dataset.cuerpoLens;
				this.lens = lens === 'BODY' ? 'BODY' : (lens as JointCode);
				if (this.lens !== 'BODY') {
					const preferred = JOINT_PREFERRED_VIEW[this.lens];
					if (this.view !== preferred) {
						this.view = preferred;
						this.syncViewButtons();
					}
				}
				this.syncLensButtons();
				this.syncZoomLabel();
				this.renderMap();
				this.renderJointPanel();
				return;
			}

			const sideBtn = target.closest<HTMLButtonElement>('[data-cuerpo-mark-side]');
			if (sideBtn) {
				if (this.isReadOnly()) return;
				const side = sideBtn.dataset.cuerpoMarkSide;
				if (side === 'L' || side === 'R') {
					this.activeMarkSide = side;
					this.syncMarkSideButtons();
				}
				return;
			}

			const kindBtn = target.closest<HTMLButtonElement>('[data-cuerpo-mark-kind]');
			if (kindBtn) {
				this.activeMarkKind = (kindBtn.dataset.cuerpoMarkKind as BodyMarkKind) || 'PAIN';
				this.syncMarkKindButtons();
				return;
			}

			if (target.closest('[data-cuerpo-intensity-dec]')) {
				this.captureIntensityFromControls();
				this.intensity = Math.max(0, this.intensity - 1);
				this.syncIntensity();
				return;
			}
			if (target.closest('[data-cuerpo-intensity-inc]')) {
				this.captureIntensityFromControls();
				this.intensity = Math.min(10, this.intensity + 1);
				this.syncIntensity();
				return;
			}

			if (target.closest('[data-cuerpo-silhouette]')) {
				if (this.isReadOnly()) return;
				const value = target.closest<HTMLButtonElement>('[data-cuerpo-silhouette]')?.dataset
					.cuerpoSilhouette as BodySilhouette;
				if (value && value !== 'NEUTRAL') {
					this.silhouette = value;
					this.persist();
					this.syncSilhouetteButtons();
					this.syncMapAriaLabel();
					this.renderMap();
					if (this.compareMode) void this.renderCompareMap();
				}
				return;
			}

			if (target.closest('[data-cuerpo-compare]')) {
				this.compareMode = !this.compareMode;
				this.root.querySelector('[data-cuerpo-compare-wrap]')?.classList.toggle('hidden', !this.compareMode);
				if (this.compareMode) void this.renderCompareMap();
				return;
			}

			if (target.closest('[data-cuerpo-pdf]')) {
				void this.exportPdf();
				return;
			}

			if (target.closest('[data-cuerpo-save-session]')) {
				void this.saveSession();
				return;
			}

			if (target.closest('[data-cuerpo-add-mark]')) {
				if (this.isReadOnly()) return;
				this.addMarkAtCenter();
				return;
			}

			const removeMarkBtn = target.closest<HTMLButtonElement>('[data-cuerpo-mark-remove]');
			if (removeMarkBtn) {
				if (this.isReadOnly()) return;
				const markId = removeMarkBtn.dataset.cuerpoMarkRemove;
				if (markId) this.removeMark(markId);
				return;
			}

			const markItem = target.closest<HTMLButtonElement>('[data-cuerpo-mark-item]');
			if (markItem) {
				const markId = markItem.dataset.cuerpoMarkItem;
				if (markId) this.openMarkEditor(markId);
				return;
			}

			const mapMark = target.closest<SVGElement>('[data-cuerpo-map-mark]');
			if (mapMark) {
				const markId = mapMark.getAttribute('data-mark-id');
				if (markId && !this.isReadOnly()) this.openMarkEditor(markId);
				return;
			}

			if (target.closest('[data-cuerpo-mark-editor-close]')) {
				this.closeMarkEditor();
				return;
			}

			if (target.closest('[data-cuerpo-mark-editor-delete]')) {
				if (this.editingMarkId) this.removeMark(this.editingMarkId);
				this.closeMarkEditor();
				return;
			}

			const editorSideBtn = target.closest<HTMLButtonElement>('[data-cuerpo-mark-editor-side]');
			if (editorSideBtn) {
				this.syncMarkEditorSideButtons(editorSideBtn.dataset.cuerpoMarkEditorSide as 'L' | 'R');
				return;
			}

			const testBtn = target.closest<HTMLButtonElement>('[data-cuerpo-test]');
			if (testBtn && this.snapshot) {
				if (this.isReadOnly()) return;
				const joint = testBtn.dataset.cuerpoJoint as JointCode;
				const testCode = testBtn.dataset.cuerpoTest || '';
				const result = (testBtn.dataset.cuerpoResult as TestResult) || 'NT';
				this.updateJointTest(joint, testCode, result);
				return;
			}
		});

		this.root.querySelector('[data-cuerpo-mark-editor-form]')?.addEventListener('submit', (event) => {
			event.preventDefault();
			this.saveMarkFromEditor();
		});

		this.root.addEventListener('input', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement)) return;
			if (target.matches('[data-cuerpo-intensity-slider]')) {
				this.handleIntensityControlChange(target);
				return;
			}
			if (target.matches('[data-cuerpo-mark-editor-intensity]')) {
				const valueEl = this.root.querySelector('[data-cuerpo-mark-editor-intensity-value]');
				if (valueEl) valueEl.textContent = `${target.value}/10`;
				return;
			}
			if (target.matches('[data-cuerpo-eva]')) {
				if (this.isReadOnly()) return;
				this.persistEvaFromDom();
			}
			if (target.matches('[data-cuerpo-rom]')) {
				if (this.isReadOnly()) return;
				this.persistRomFromDom();
			}
		});

		this.root.addEventListener('change', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement)) return;
			if (target.matches('[data-cuerpo-intensity-slider]')) {
				this.handleIntensityControlChange(target);
			}
		});
	}

	private captureIntensityFromControls(): number {
		const slider = this.root.querySelector<HTMLInputElement>('[data-cuerpo-intensity-slider]');
		if (slider) {
			const parsed = Number(slider.value);
			if (Number.isFinite(parsed)) {
				this.intensity = Math.max(0, Math.min(10, Math.round(parsed)));
				return this.intensity;
			}
		}
		const valueEl = this.root.querySelector('[data-cuerpo-intensity-value]');
		const parsedLabel = Number(String(valueEl?.textContent || '').trim());
		if (Number.isFinite(parsedLabel)) {
			this.intensity = Math.max(0, Math.min(10, Math.round(parsedLabel)));
		}
		return this.intensity;
	}

	private handleIntensityControlChange(target: HTMLInputElement): void {
		if (this.isReadOnly()) return;
		this.intensity = Math.max(0, Math.min(10, Number(target.value) || 0));
		this.syncIntensity(false);
	}

	private resolveMarkSide(regionSide: 'L' | 'R' | null, nx: number): 'L' | 'R' {
		if (regionSide === 'L' || regionSide === 'R') return regionSide;
		if (this.view === 'FRONT' || this.view === 'BACK') {
			return nx < 0.5 ? 'L' : 'R';
		}
		return this.activeMarkSide;
	}

	private renderEmptyState(): void {
		const chip = this.root.querySelector('[data-cuerpo-session-chip]');
		if (chip) chip.textContent = 'Sin cita';
	}

	private renderSessionHeader(): void {
		const chipWrap = this.root.querySelector('[data-cuerpo-session-chip-wrap]');
		const chip = this.root.querySelector('[data-cuerpo-session-chip]');
		const sessionEl = this.root.querySelector('[data-cuerpo-session-label]');
		if (!this.context) return;

		const embedded = this.context.embedded === true;
		chipWrap?.classList.toggle('hidden', !embedded);
		if (embedded && chip) {
			if (this.context.appointmentId <= 0) {
				chip.textContent = 'Estado actual · solo lectura';
			} else {
				chip.textContent =
					this.context.sessionLabel || `Cita #${this.context.appointmentId}`;
			}
		}

		if (sessionEl && !embedded) {
			if (this.context.appointmentId <= 0) {
				sessionEl.textContent = 'Estado actual · solo lectura';
			} else {
				sessionEl.textContent =
					this.context.sessionLabel || `Cita #${this.context.appointmentId}`;
			}
		}
	}

	private syncZoomLabel(): void {
		const label = this.root.querySelector('[data-cuerpo-zoom-label]');
		if (!label) return;
		if (this.lens === 'BODY') {
			label.classList.add('hidden');
			label.textContent = '';
			return;
		}
		const viewport = JOINT_VIEWPORTS[this.lens];
		label.classList.remove('hidden');
		label.textContent = `Zoom: ${viewport.label}`;
	}

	private applyMapViewBox(svg: SVGSVGElement): void {
		const box = getActiveMapViewBox(this.lens, this.view);
		svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
	}

	private renderMap(): void {
		this.mapSvg = this.root.querySelector('[data-cuerpo-map-svg]');
		this.mapLayer = this.root.querySelector('[data-cuerpo-map-marks]');
		this.outlineLayer = this.root.querySelector('[data-cuerpo-map-outline]');
		if (!this.mapSvg || !this.mapLayer || !this.outlineLayer) return;
		this.ensureSvgNamespace(this.mapSvg);
		this.applyMapViewBox(this.mapSvg);
		this.drawOutline(this.mapSvg, this.outlineLayer, { interactive: true });
		this.renderMarks(this.mapLayer, this.snapshot?.marks ?? [], { interactive: true });
		this.syncMapAriaLabel();
		this.syncZoomLabel();
	}

	private async renderCompareMap(): Promise<void> {
		if (!this.context || this.context.appointmentId <= 0) return;
		this.compareSvg = this.root.querySelector('[data-cuerpo-compare-svg]');
		this.compareLayer = this.root.querySelector('[data-cuerpo-compare-marks]');
		const empty = this.root.querySelector('[data-cuerpo-compare-empty]');
		const loading = this.root.querySelector('[data-cuerpo-compare-loading]');
		if (!this.compareSvg || !this.compareLayer) return;

		let previous = getPreviousBodySnapshot(this.context.customerId, this.context.appointmentId);
		if (!previous) {
			loading?.classList.remove('hidden');
			empty?.classList.add('hidden');
			await prefetchBodySnapshotsForCustomer(this.context.customerId);
			previous = getPreviousBodySnapshot(this.context.customerId, this.context.appointmentId);
			loading?.classList.add('hidden');
		}

		if (!previous) {
			empty?.classList.remove('hidden');
			this.compareLayer.replaceChildren();
			return;
		}
		empty?.classList.add('hidden');
		const compareOutline = this.compareSvg.querySelector('[data-cuerpo-map-outline]');
		if (!(compareOutline instanceof SVGGElement)) return;
		this.ensureSvgNamespace(this.compareSvg);
		this.applyMapViewBox(this.compareSvg);
		this.drawOutline(this.compareSvg, compareOutline, { interactive: false });
		this.renderMarks(this.compareLayer, previous.marks, { interactive: false });
	}

	private ensureSvgNamespace(svg: SVGSVGElement): void {
		if (!svg.getAttribute('xmlns')) {
			svg.setAttribute('xmlns', SVG_NS);
		}
	}

	private drawOutline(
		svg: SVGSVGElement,
		layer: SVGGElement,
		options: { interactive: boolean }
	): void {
		layer.replaceChildren();
		const path = document.createElementNS(SVG_NS, 'path');
		path.setAttribute('d', getBodyOutline(this.silhouette, this.view));
		path.setAttribute('fill', 'currentColor');
		path.setAttribute('fill-opacity', '0.1');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.2');
		path.setAttribute('data-cuerpo-outline', '1');
		path.setAttribute('vector-effect', 'non-scaling-stroke');
		path.setAttribute('shape-rendering', 'geometricPrecision');
		layer.appendChild(path);

		if (options.interactive) {
			svg.onclick = (event) => {
				if (this.isReadOnly()) return;
				if ((event.target as Element | null)?.closest('[data-cuerpo-map-mark]')) return;
				const { nx, ny } = this.pointerToNormalizedCoords(svg, event.clientX, event.clientY);
				if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
				if (!this.isPointOnBody(path, nx, ny)) return;
				this.addMark(nx, ny);
			};
		} else {
			svg.onclick = null;
		}
	}

	private pointerToNormalizedCoords(
		svg: SVGSVGElement,
		clientX: number,
		clientY: number
	): { nx: number; ny: number } {
		const rect = svg.getBoundingClientRect();
		const box = getActiveMapViewBox(this.lens, this.view);
		const relX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
		const relY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
		const x = box.x + relX * box.width;
		const y = box.y + relY * box.height;
		return {
			nx: x / BODY_VIEWBOX.width,
			ny: y / BODY_VIEWBOX.height,
		};
	}

	private isPointOnBody(path: SVGPathElement, nx: number, ny: number): boolean {
		const { x, y } = markToViewCoords(nx, ny);
		const svg = path.ownerSVGElement;
		if (!svg || typeof path.isPointInFill !== 'function') return true;
		const point = svg.createSVGPoint();
		point.x = x;
		point.y = y;
		return path.isPointInFill(point);
	}

	private renderMarks(
		layer: SVGGElement,
		marks: BodyMark[],
		options: { interactive: boolean }
	): void {
		layer.replaceChildren();
		for (const mark of marks.filter((m) => m.view === this.view)) {
			const meta = markKindMeta(mark.kind);
			const { x, y } = markToViewCoords(mark.nx, mark.ny);
			const g = document.createElementNS(SVG_NS, 'g');
			g.setAttribute('transform', `translate(${x}, ${y})`);
			if (options.interactive) {
				g.setAttribute('data-cuerpo-map-mark', '1');
				g.setAttribute('data-mark-id', mark.id);
				g.style.cursor = this.isReadOnly() ? 'default' : 'pointer';
			}

			const halo = document.createElementNS(SVG_NS, 'circle');
			halo.setAttribute('r', String(2 + mark.intensity * 0.35));
			halo.setAttribute('fill', meta.color);
			halo.setAttribute('opacity', mark.id === this.selectedMarkId ? '0.45' : '0.28');
			g.appendChild(halo);

			const dot = document.createElementNS(SVG_NS, 'circle');
			dot.setAttribute('r', mark.id === this.selectedMarkId ? '2.1' : '1.6');
			dot.setAttribute('fill', meta.color);
			dot.setAttribute('aria-hidden', 'true');
			g.appendChild(dot);

			layer.appendChild(g);
		}
	}

	private addMarkAtCenter(): void {
		this.addMark(0.5, 0.45);
	}

	private addMark(nx: number, ny: number): void {
		if (!this.snapshot || !this.context || this.isReadOnly()) return;
		const intensity = this.activeMarkKind === 'SCAR' ? 0 : this.captureIntensityFromControls();
		const region = resolveBodyRegion(this.view, nx, ny);
		if (!isAllowedBodyRegion(region.regionCode)) return;
		const side = this.resolveMarkSide(region.side, nx);
		const mark: BodyMark = {
			id: `m_${crypto.randomUUID()}`,
			kind: this.activeMarkKind,
			intensity,
			view: this.view,
			regionCode: region.regionCode,
			nx,
			ny,
			side,
			note: '',
			createdAt: new Date().toISOString(),
		};
		this.activeMarkSide = side;
		this.syncMarkSideButtons();
		this.snapshot = { ...this.snapshot, marks: [...this.snapshot.marks, mark] };
		this.persist();
		this.renderMap();
		this.renderSidebar();
		if (this.compareMode) void this.renderCompareMap();
	}

	private removeMark(markId: string): void {
		if (!this.snapshot || !this.context || this.isReadOnly()) return;
		const nextMarks = this.snapshot.marks.filter((mark) => mark.id !== markId);
		if (nextMarks.length === this.snapshot.marks.length) return;
		this.snapshot = { ...this.snapshot, marks: nextMarks };
		if (this.selectedMarkId === markId) this.selectedMarkId = null;
		if (this.editingMarkId === markId) this.editingMarkId = null;
		this.persist();
		this.renderMap();
		this.renderSidebar();
		if (this.compareMode) void this.renderCompareMap();
	}

	private updateMark(markId: string, patch: Partial<BodyMark>): void {
		if (!this.snapshot || this.isReadOnly()) return;
		this.snapshot = {
			...this.snapshot,
			marks: this.snapshot.marks.map((mark) =>
				mark.id === markId ? { ...mark, ...patch } : mark
			),
		};
		this.persist();
		this.renderMap();
		this.renderSidebar();
		if (this.compareMode) void this.renderCompareMap();
	}

	private persist(): void {
		if (!this.snapshot || this.isReadOnly() || !this.context) return;
		this.snapshot = {
			...this.snapshot,
			silhouette: this.silhouette,
			capturedAt: new Date().toISOString(),
		};
		saveBodySnapshot(this.snapshot);
		markBodySnapshotDirty(this.context.customerId, this.context.appointmentId);
		this.dirty = true;
		this.persisted = false;
		this.syncDraftBanner();
		this.syncSaveButton();
	}

	private renderSidebar(): void {
		const list = this.root.querySelector('[data-cuerpo-marks-list]');
		const empty = this.root.querySelector('[data-cuerpo-marks-empty]');
		const viewHint = this.root.querySelector('[data-cuerpo-marks-view-hint]');
		if (!list) return;
		list.replaceChildren();
		const marks = this.snapshot?.marks ?? [];
		const marksInView = marks.filter((mark) => mark.view === this.view);

		if (!marks.length) {
			empty?.classList.remove('hidden');
			viewHint?.classList.add('hidden');
			return;
		}
		empty?.classList.add('hidden');
		viewHint?.classList.toggle('hidden', !(marks.length > 0 && marksInView.length === 0));

		const readOnly = this.isReadOnly();
		for (const mark of [...marks].reverse()) {
			const meta = markKindMeta(mark.kind);
			const li = document.createElement('li');
			li.className = 'cuerpo-mark-item';

			const openBtn = document.createElement('button');
			openBtn.type = 'button';
			openBtn.className = 'cuerpo-mark-item__open';
			openBtn.dataset.cuerpoMarkItem = mark.id;
			if (mark.id === this.selectedMarkId) openBtn.classList.add('is-selected');
			openBtn.setAttribute('aria-label', `Editar ${formatMarkSummary(mark)}`);

			const title = document.createElement('span');
			title.className = 'cuerpo-mark-item__dot';
			title.style.backgroundColor = meta.color;
			const text = document.createElement('span');
			text.className = 'cuerpo-mark-item__text';
			text.textContent = formatMarkSummary(mark);
			openBtn.append(title, text);

			li.appendChild(openBtn);
			if (!readOnly) {
				const removeBtn = document.createElement('button');
				removeBtn.type = 'button';
				removeBtn.className = 'cuerpo-mark-item__remove';
				removeBtn.dataset.cuerpoMarkRemove = mark.id;
				removeBtn.setAttribute('aria-label', `Eliminar ${formatMarkSummary(mark)}`);
				const removeIcon = document.createElement('span');
				removeIcon.className = 'material-symbols-rounded';
				removeIcon.setAttribute('aria-hidden', 'true');
				removeIcon.textContent = 'delete';
				removeBtn.appendChild(removeIcon);
				li.appendChild(removeBtn);
			}
			list.appendChild(li);
		}
	}

	private openMarkEditor(markId: string): void {
		if (this.isReadOnly() || !this.snapshot) return;
		const mark = this.snapshot.marks.find((item) => item.id === markId);
		if (!mark) return;
		this.editingMarkId = markId;
		this.selectedMarkId = markId;
		this.renderMap();
		this.renderSidebar();

		const dialog = this.root.querySelector<HTMLDialogElement>('[data-cuerpo-mark-editor]');
		const kindSelect = this.root.querySelector<HTMLSelectElement>('[data-cuerpo-mark-editor-kind]');
		const intensityInput = this.root.querySelector<HTMLInputElement>('[data-cuerpo-mark-editor-intensity]');
		const intensityValue = this.root.querySelector('[data-cuerpo-mark-editor-intensity-value]');
		const noteInput = this.root.querySelector<HTMLInputElement>('[data-cuerpo-mark-editor-note]');

		if (kindSelect) {
			kindSelect.replaceChildren();
			for (const item of BODY_MARK_KINDS) {
				const option = document.createElement('option');
				option.value = item.code;
				option.textContent = item.label;
				option.selected = item.code === mark.kind;
				kindSelect.appendChild(option);
			}
		}
		if (intensityInput) {
			intensityInput.value = String(mark.intensity);
			intensityInput.disabled = mark.kind === 'SCAR';
		}
		if (intensityValue) intensityValue.textContent = `${mark.intensity}/10`;
		if (noteInput) noteInput.value = mark.note || '';
		this.syncMarkEditorSideButtons(mark.side || 'R');
		dialog?.showModal();
	}

	private closeMarkEditor(): void {
		this.root.querySelector<HTMLDialogElement>('[data-cuerpo-mark-editor]')?.close();
		this.editingMarkId = null;
	}

	private getMarkEditorSide(): 'L' | 'R' {
		const active = this.root.querySelector<HTMLButtonElement>(
			'[data-cuerpo-mark-editor-side].is-active'
		);
		return active?.dataset.cuerpoMarkEditorSide === 'L' ? 'L' : 'R';
	}

	private syncMarkEditorSideButtons(side: 'L' | 'R'): void {
		for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-cuerpo-mark-editor-side]')) {
			const active = btn.dataset.cuerpoMarkEditorSide === side;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-pressed', active ? 'true' : 'false');
		}
	}

	private saveMarkFromEditor(): void {
		if (!this.editingMarkId || !this.snapshot) return;
		const kind =
			(this.root.querySelector<HTMLSelectElement>('[data-cuerpo-mark-editor-kind]')?.value as BodyMarkKind) ||
			'PAIN';
		const intensityRaw = Number(
			this.root.querySelector<HTMLInputElement>('[data-cuerpo-mark-editor-intensity]')?.value || 0
		);
		const intensity = kind === 'SCAR' ? 0 : Math.max(0, Math.min(10, Math.round(intensityRaw)));
		const note = String(this.root.querySelector<HTMLInputElement>('[data-cuerpo-mark-editor-note]')?.value || '').trim();
		this.updateMark(this.editingMarkId, {
			kind,
			intensity,
			side: this.getMarkEditorSide(),
			note,
		});
		this.closeMarkEditor();
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
		const assessment = this.getJointAssessment(joint);
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
				const inputWrap = document.createElement('div');
				inputWrap.className = 'cuerpo-rom-field__input-wrap';
				const input = document.createElement('input');
				input.type = 'number';
				input.className = 'cuerpo-rom-field__input';
				input.dataset.cuerpoRom = '1';
				input.dataset.cuerpoJoint = joint;
				input.dataset.cuerpoRomCode = def.code;
				input.value = String(assessment?.rom[def.code] ?? '');
				const unit = document.createElement('span');
				unit.className = 'cuerpo-rom-field__unit';
				unit.textContent = def.unit;
				inputWrap.append(input, unit);
				label.append(span, inputWrap);
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
					btn.classList.toggle('is-active', assessment?.tests.find((t) => t.code === test.code)?.result === result);
					btn.classList.toggle(`cuerpo-test-chip--${formatted.tone}`, assessment?.tests.find((t) => t.code === test.code)?.result === result);
					actions.appendChild(btn);
				}
				row.append(name, actions);
				testsWrap.appendChild(row);
			}
		}

		const evaInput = panel.querySelector<HTMLInputElement>('[data-cuerpo-eva]');
		if (evaInput) evaInput.value = String(assessment?.eva ?? 0);
	}

	private getJointAssessment(joint: JointCode): JointAssessment | null {
		return this.snapshot?.joints.find((j) => j.joint === joint) ?? null;
	}

	private ensureJointAssessment(joint: JointCode): JointAssessment {
		if (!this.snapshot) {
			return { joint, side: this.activeMarkSide, rom: {}, tests: [], eva: 0 };
		}
		let assessment = this.snapshot.joints.find((j) => j.joint === joint);
		if (!assessment) {
			assessment = { joint, side: this.activeMarkSide, rom: {}, tests: [], eva: 0 };
			this.snapshot = { ...this.snapshot, joints: [...this.snapshot.joints, assessment] };
		}
		return assessment;
	}

	private updateJointTest(joint: JointCode, testCode: string, result: TestResult): void {
		if (!this.snapshot || this.isReadOnly()) return;
		const assessment = this.ensureJointAssessment(joint);
		const tests = assessment.tests.filter((t) => t.code !== testCode);
		tests.push({ code: testCode, result });
		this.snapshot = {
			...this.snapshot,
			joints: this.snapshot.joints.map((j) =>
				j.joint === joint ? { ...j, tests, side: this.activeMarkSide } : j
			),
		};
		this.persist();
		this.renderJointPanel();
		if (this.compareMode) void this.renderCompareMap();
	}

	private persistRomFromDom(): void {
		if (!this.snapshot || this.lens === 'BODY' || this.isReadOnly()) return;
		const joint = this.lens;
		const assessment = this.ensureJointAssessment(joint);
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
			joints: this.snapshot.joints.map((j) =>
				j.joint === joint ? { ...j, rom, side: this.activeMarkSide } : j
			),
		};
		this.persist();
		if (this.compareMode) void this.renderCompareMap();
	}

	private persistEvaFromDom(): void {
		if (!this.snapshot || this.lens === 'BODY' || this.isReadOnly()) return;
		const joint = this.lens;
		const input = this.root.querySelector<HTMLInputElement>('[data-cuerpo-eva]');
		const eva = Math.max(0, Math.min(10, Number(input?.value) || 0));
		this.ensureJointAssessment(joint);
		this.snapshot = {
			...this.snapshot,
			joints: this.snapshot.joints.map((j) =>
				j.joint === joint ? { ...j, eva, side: this.activeMarkSide } : j
			),
		};
		this.persist();
		if (this.compareMode) void this.renderCompareMap();
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

	private syncMarkSideButtons(): void {
		for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-cuerpo-mark-side]')) {
			const active = btn.dataset.cuerpoMarkSide === this.activeMarkSide;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-pressed', active ? 'true' : 'false');
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
			const active = btn.dataset.cuerpoSilhouette === this.silhouette;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-pressed', active ? 'true' : 'false');
		}
	}

	private syncMapAriaLabel(): void {
		if (!this.mapSvg) return;
		const viewLabel = BODY_VIEWS.find((item) => item.code === this.view)?.label ?? this.view;
		const zoom =
			this.lens === 'BODY' ? '' : `, zoom ${JOINT_VIEWPORTS[this.lens].label.toLowerCase()}`;
		this.mapSvg.setAttribute(
			'aria-label',
			`${SILHOUETTE_LABELS[this.silhouette]}, vista ${viewLabel.toLowerCase()}${zoom}`
		);
	}

	private async exportPdf(): Promise<void> {
		if (!this.snapshot || !this.context) return;
		let mapImage: string | null = null;
		if (this.mapSvg) {
			try {
				this.ensureSvgNamespace(this.mapSvg);
				const clone = this.mapSvg.cloneNode(true) as SVGSVGElement;
				for (const node of clone.querySelectorAll('[stroke="currentColor"]')) {
					node.setAttribute('stroke', '#5c6570');
				}
				for (const node of clone.querySelectorAll('[fill="currentColor"]')) {
					node.setAttribute('fill', '#5c6570');
				}
				const serializer = new XMLSerializer();
				const source = serializer.serializeToString(clone);
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
