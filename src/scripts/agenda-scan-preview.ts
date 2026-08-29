import type { AgendaScanRow } from '../lib/appointment-ai-types';
import { openPanelModal } from '../lib/panel-scroll-lock';
import {
	bindPanelThemedSelectRoot,
	closePanelThemedSelects,
	destroyPanelThemedSelect,
	ensurePanelThemedSelect,
	syncPanelThemedSelect,
	type PanelThemedSelectOptions,
} from '../lib/panel-themed-select';

interface CatalogProfessional {
	id_professional: number;
	name: string;
}
interface CatalogLocation {
	id_location: number;
	name: string;
}
interface CatalogService {
	id_service: number;
	name: string;
	duration_minutes: number;
}

interface PreviewRowState {
	uid: string;
	customer_name: string;
	customer_phone: string;
	date: string;
	time: string;
	ser_id_service: number;
	pro_id_professional: number;
	loc_id_location: number;
	confidence: 'high' | 'medium' | 'low';
	raw_text: string;
}

// Paraguay opera en -03:00 de forma permanente desde 2024.
const ASUNCION_OFFSET = '-03:00';

const PLACEHOLDER_SERVICE = 'Elegir servicio';
const PLACEHOLDER_PROFESSIONAL = 'Asignar';
const PLACEHOLDER_LOCATION = 'Sucursal';
const MONTHS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const DEFAULT_THEMED_TRIGGER =
	'panel-modal-select__trigger panel-themed-select__trigger schedule-themed-select__trigger';
const ROW_THEMED_TRIGGER =
	'agenda-preview-row__select-trigger panel-themed-select__trigger schedule-themed-select__trigger';

const uid = () => `row_${Math.random().toString(36).slice(2, 10)}`;

const pad2 = (value: number) => String(value).padStart(2, '0');

const toInt = (value: unknown): number => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const extractDateTime = (startIso: string | null | undefined): { date: string; time: string } => {
	const raw = String(startIso || '').trim();
	const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
	if (!match) return { date: '', time: '' };
	return { date: match[1], time: match[2] };
};

const normalizeTime = (time: string) => {
	const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})/);
	if (!match) return time;
	return `${pad2(Number(match[1]))}:${match[2]}`;
};

const addMinutesWallClock = (date: string, time: string, minutes: number) => {
	const [y, mo, d] = date.split('-').map(Number);
	const [h, mi] = normalizeTime(time).split(':').map(Number);
	const base = new Date(Date.UTC(y, mo - 1, d, h, mi));
	base.setUTCMinutes(base.getUTCMinutes() + minutes);
	return {
		date: `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(base.getUTCDate())}`,
		time: `${pad2(base.getUTCHours())}:${pad2(base.getUTCMinutes())}`,
	};
};

const buildIso = (date: string, time: string) =>
	`${date}T${normalizeTime(time)}:00${ASUNCION_OFFSET}`;

const MONTH_NAMES = [
	'Enero',
	'Febrero',
	'Marzo',
	'Abril',
	'Mayo',
	'Junio',
	'Julio',
	'Agosto',
	'Septiembre',
	'Octubre',
	'Noviembre',
	'Diciembre',
];

const TIME_SLOTS = (() => {
	const slots: string[] = [];
	for (let hour = 6; hour <= 22; hour += 1) {
		for (const minute of [0, 15, 30, 45]) {
			if (hour === 22 && minute > 0) break;
			slots.push(`${pad2(hour)}:${pad2(minute)}`);
		}
	}
	return slots;
})();

const formatDisplayDate = (iso: string) => {
	const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return '';
	const month = MONTHS_SHORT[Number(match[2]) - 1];
	if (!month) return `${match[3]}/${match[2]}/${match[1]}`;
	return `${Number(match[3])} ${month} ${match[1]}`;
};

const parseIsoDate = (iso: string): Date | null => {
	const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDate = (date: Date) =>
	`${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const snapTime = (raw: string): string | null => {
	const value = String(raw || '').trim().replace('.', ':').replace(',', ':');
	if (!value) return null;
	const match = value.match(/^(\d{1,2})(?::(\d{0,2}))?$/);
	if (!match) return null;
	const hour = Number(match[1]);
	if (!Number.isInteger(hour) || hour > 23) return null;
	const typedMinutes = match[2];
	let minute = !typedMinutes ? 0 : Number(typedMinutes.padEnd(2, '0').slice(0, 2));
	if (!Number.isInteger(minute) || minute > 59) return null;
	minute = Math.min(45, Math.round(minute / 15) * 15);
	return `${pad2(hour)}:${pad2(minute)}`;
};

class AgendaScanPreview extends HTMLElement {
	#bound = false;
	#listeners: AbortController | null = null;
	#rows: PreviewRowState[] = [];
	#professionals: CatalogProfessional[] = [];
	#locations: CatalogLocation[] = [];
	#services: CatalogService[] = [];
	#catalogLoaded = false;
	#catalogLoading: Promise<void> | null = null;
	#defaultProfessionalId = 0;
	#saving = false;
	#zoom = 1;
	#panX = 0;
	#panY = 0;
	#dragging = false;
	#dragStartX = 0;
	#dragStartY = 0;
	#panStartX = 0;
	#panStartY = 0;
	#calView = new Date();
	#activeDateRow: PreviewRowState | null = null;
	#activeDateEl: HTMLElement | null = null;
	#activeTimeRow: PreviewRowState | null = null;
	#activeTimeEl: HTMLElement | null = null;
	#activeTimeInput: HTMLInputElement | null = null;
	#outsideClose: ((event: Event) => void) | null = null;
	#defaultsSettleTimer: number | undefined;

	connectedCallback() {
		if (this.#bound) return;
		this.#bound = true;
		this.#listeners = new AbortController();
		const signal = this.#listeners.signal;

		document.addEventListener('agenda-scan:success', this.handleScanSuccess as EventListener, {
			signal,
		});

		this.querySelectorAll('[data-agenda-preview-close]').forEach(
			(button) => {
				button.addEventListener('click', (event) => {
					event.preventDefault();
					this.close();
				}, { signal });
			}
		);

		this.querySelector('[data-agenda-add-row]')?.addEventListener('click', (event) => {
			event.preventDefault();
			this.addRow();
		}, { signal });

		this.querySelector('[data-agenda-preview-save]')?.addEventListener('click', (event) => {
			event.preventDefault();
			void this.save();
		}, { signal });

		const bindZoom = (selector: string, delta: number) => {
			const button = this.querySelector<HTMLButtonElement>(selector);
			button?.addEventListener('pointerdown', (event) => event.preventDefault(), { signal });
			button?.addEventListener('click', () => this.setZoom(this.#zoom + delta), { signal });
		};
		bindZoom('[data-agenda-zoom-in]', 0.25);
		bindZoom('[data-agenda-zoom-out]', -0.25);
		this.bindImagePan(signal);

		const shell = this.querySelector<HTMLDialogElement>('[data-agenda-preview-shell]');
		shell?.addEventListener('cancel', (event) => {
			event.preventDefault();
			this.close();
		}, { signal });
		document.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape' || !shell?.open) return;
			event.preventDefault();
			if (this.isPopoverOpen()) {
				this.closePopovers(true);
				return;
			}
			this.close();
		}, { signal });

		this.querySelector('[data-agenda-cal-prev]')?.addEventListener('click', () => {
			this.#calView = new Date(this.#calView.getFullYear(), this.#calView.getMonth() - 1, 1);
			this.renderCalendarDays();
		}, { signal });
		this.querySelector('[data-agenda-cal-next]')?.addEventListener('click', () => {
			this.#calView = new Date(this.#calView.getFullYear(), this.#calView.getMonth() + 1, 1);
			this.renderCalendarDays();
		}, { signal });

		this.querySelector('[data-agenda-default-professional]')?.addEventListener('change', () => {
			this.syncPlaceholderState(this.querySelector('[data-agenda-preview-defaults]') || this);
			this.applyDefaults(true);
			this.updateDefaultsSummary();
		}, { signal });
		this.querySelector('[data-agenda-default-location]')?.addEventListener('change', () => {
			this.syncPlaceholderState(this.querySelector('[data-agenda-preview-defaults]') || this);
			this.applyDefaults(true);
			this.updateDefaultsSummary();
		}, { signal });
		this.querySelector('[data-agenda-default-service]')?.addEventListener('change', () => {
			this.syncPlaceholderState(this.querySelector('[data-agenda-preview-defaults]') || this);
			this.applyDefaults(true);
			this.updateDefaultsSummary();
		}, { signal });

		this.querySelector('[data-agenda-defaults-toggle]')?.addEventListener('click', (event) => {
			event.preventDefault();
			this.toggleDefaultsOpen();
		}, { signal });
		window.matchMedia('(max-width: 640px)').addEventListener('change', () => {
			this.syncDefaultsCollapseA11y();
			this.updateDefaultsSummary();
		}, { signal });
		this.setDefaultsOpen(false);

		this.mountDefaultThemedSelects();
		bindPanelThemedSelectRoot(this, signal);
		this.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (target.closest('[data-panel-themed-select-trigger]')) {
				this.closeDateTimePopovers();
			}
		}, { signal });
	}

	disconnectedCallback() {
		this.closePopovers();
		this.destroyThemedSelects();
		this.#bound = false;
		this.#listeners?.abort();
		this.#listeners = null;
	}

	private handleScanSuccess = (event: CustomEvent) => {
		const detail = event.detail as { appointments?: AgendaScanRow[]; imageDataUrl?: string };
		void this.openWith(detail?.appointments || [], detail?.imageDataUrl || '');
	};

	private async openWith(appointments: AgendaScanRow[], imageDataUrl: string) {
		await this.ensureCatalog();

		this.#rows = appointments.map((row) => {
			const { date, time } = extractDateTime(row.start_time);
			const confidence =
				row.row_confidence || row.confidence || (row.missing_fields?.length ? 'medium' : 'high');
			return {
				uid: uid(),
				customer_name: String(row.customer_name || '').trim(),
				customer_phone: String(row.customer_phone || '').trim(),
				date,
				time,
				ser_id_service: toInt(row.ser_id_service),
				pro_id_professional: toInt(row.pro_id_professional),
				loc_id_location: toInt(row.loc_id_location),
				confidence: confidence === 'low' || confidence === 'medium' ? confidence : 'high',
				raw_text: String(row.raw_text || '').trim(),
			};
		});

		this.populateDefaultsSelects();
		this.setupImage(imageDataUrl);
		this.applyDefaults(false);
		this.setDefaultsOpen(false);
		this.renderRows();
		this.setError('');

		const shell = this.querySelector<HTMLDialogElement>('[data-agenda-preview-shell]');
		if (shell && !shell.open) openPanelModal(shell);
	}

	close() {
		this.closePopovers();
		const shell = this.querySelector<HTMLDialogElement>('[data-agenda-preview-shell]');
		if (!shell?.open) return;

		if (shell.classList.contains('is-closing')) return;
		shell.classList.add('is-closing');

		const finish = () => {
			shell.classList.remove('is-closing');
			if (shell.open) shell.close();
		};

		const duration = this.readCloseDurationMs(shell);
		let done = false;
		const handleEnd = (event: AnimationEvent) => {
			if (event.target !== shell) return;
			if (done) return;
			done = true;
			shell.removeEventListener('animationend', handleEnd);
			finish();
		};
		shell.addEventListener('animationend', handleEnd);
		window.setTimeout(() => {
			if (done) return;
			done = true;
			shell.removeEventListener('animationend', handleEnd);
			finish();
		}, duration + 60);
	}

	private readCloseDurationMs(el: HTMLElement) {
		const raw = getComputedStyle(el).getPropertyValue('--modal-close-duration').trim();
		if (!raw) return 160;
		if (raw.endsWith('ms')) return Number.parseFloat(raw) || 160;
		if (raw.endsWith('s')) return (Number.parseFloat(raw) || 0.16) * 1000;
		return Number.parseFloat(raw) || 160;
	}

	private async ensureCatalog() {
		if (this.#catalogLoaded) return;
		if (this.#catalogLoading) return this.#catalogLoading;

		this.#catalogLoading = (async () => {
			try {
				const response = await fetch('/api/appointments/meta', {
					headers: { Accept: 'application/json' },
					credentials: 'same-origin',
				});
				const payload = (await response.json()) as {
					status?: string;
					data?: {
						professionals?: Array<Record<string, unknown>>;
						locations?: Array<Record<string, unknown>>;
						services?: Array<Record<string, unknown>>;
						session?: { role_id?: number; professional_id?: number };
					};
				};
				if (response.ok && payload.status === 'success' && payload.data) {
					this.#professionals = (payload.data.professionals || []).map((item) => ({
						id_professional: toInt(item.id_professional),
						name: String(item.display_name || item.name || '').trim() || `Profesional #${toInt(item.id_professional)}`,
					}));
					this.#locations = (payload.data.locations || []).map((item) => ({
						id_location: toInt(item.id_location),
						name: String(item.name || '').trim() || `Sucursal #${toInt(item.id_location)}`,
					}));
					this.#services = (payload.data.services || []).map((item) => ({
						id_service: toInt(item.id_service),
						name: String(item.name || '').trim() || `Servicio #${toInt(item.id_service)}`,
						duration_minutes: Number(item.duration_minutes) || 60,
					}));
					this.#defaultProfessionalId = toInt(payload.data.session?.professional_id);
					this.#catalogLoaded = true;
				}
			} catch {
				// Catálogo vacío: los selects quedarán sin opciones y las filas se marcarán incompletas.
			} finally {
				this.#catalogLoading = null;
			}
		})();

		return this.#catalogLoading;
	}

	private optionList(
		items: Array<{ id: number; name: string }>,
		selected: number,
		placeholder: string
	) {
		const opts = [`<option value="">${this.escape(placeholder)}</option>`];
		for (const item of items) {
			const sel = item.id === selected ? ' selected' : '';
			opts.push(`<option value="${item.id}"${sel}>${this.escape(item.name)}</option>`);
		}
		return opts.join('');
	}

	private themedSelectOptions(select: HTMLSelectElement): PanelThemedSelectOptions {
		const isDefault = select.matches(
			'[data-agenda-default-professional], [data-agenda-default-location], [data-agenda-default-service]'
		);
		let placeholder = PLACEHOLDER_SERVICE;
		if (select.matches('[data-row-professional]')) {
			placeholder = PLACEHOLDER_PROFESSIONAL;
		} else if (select.matches('[data-agenda-default-professional]')) {
			placeholder = 'Profesional';
		} else if (select.matches('[data-agenda-default-service]')) {
			placeholder = 'Servicio';
		} else if (select.matches('[data-agenda-default-location]')) {
			placeholder = PLACEHOLDER_LOCATION;
		}
		return {
			triggerClass: isDefault ? DEFAULT_THEMED_TRIGGER : ROW_THEMED_TRIGGER,
			placeholder,
			hideEmptyOption: true,
		};
	}

	private mountThemedSelect(select: HTMLSelectElement | null | undefined) {
		if (!select) return;
		ensurePanelThemedSelect(select, this.themedSelectOptions(select));
	}

	private mountDefaultThemedSelects() {
		this.mountThemedSelect(this.querySelector('[data-agenda-default-professional]'));
		this.mountThemedSelect(this.querySelector('[data-agenda-default-location]'));
		this.mountThemedSelect(this.querySelector('[data-agenda-default-service]'));
	}

	private mountRowThemedSelects(rowEl: HTMLElement) {
		rowEl.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
			this.mountThemedSelect(select);
		});
	}

	private destroyThemedSelects() {
		this.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
			destroyPanelThemedSelect(select);
		});
	}

	private escape(value: string) {
		return value.replace(/[&<>"']/g, (char) => {
			switch (char) {
				case '&':
					return '&amp;';
				case '<':
					return '&lt;';
				case '>':
					return '&gt;';
				case '"':
					return '&quot;';
				default:
					return '&#39;';
			}
		});
	}

	private populateDefaultsSelects() {
		const proSelect = this.querySelector<HTMLSelectElement>('[data-agenda-default-professional]');
		const locSelect = this.querySelector<HTMLSelectElement>('[data-agenda-default-location]');
		const serviceSelect = this.querySelector<HTMLSelectElement>('[data-agenda-default-service]');
		if (proSelect) {
			proSelect.innerHTML = this.optionList(
				this.#professionals.map((p) => ({ id: p.id_professional, name: p.name })),
				this.#defaultProfessionalId,
				'Profesional'
			);
		}
		if (locSelect) {
			locSelect.innerHTML = this.optionList(
				this.#locations.map((l) => ({ id: l.id_location, name: l.name })),
				this.#locations.length === 1 ? this.#locations[0].id_location : 0,
				PLACEHOLDER_LOCATION
			);
		}
		if (serviceSelect) {
			serviceSelect.innerHTML = this.optionList(
				this.#services.map((s) => ({ id: s.id_service, name: s.name })),
				this.defaultServiceIdFromRows(),
				'Servicio'
			);
		}
		this.mountDefaultThemedSelects();
		this.syncPlaceholderState(this.querySelector('[data-agenda-preview-defaults]') || this);
		this.updateDefaultsSummary();
	}

	private selectedOptionLabel(selector: string) {
		const select = this.querySelector<HTMLSelectElement>(selector);
		if (!select?.value) return '';
		return select.selectedOptions[0]?.textContent?.trim() || '';
	}

	private updateDefaultsSummary() {
		const summary = this.querySelector<HTMLElement>('[data-agenda-defaults-summary]');
		const root = this.querySelector<HTMLElement>('[data-agenda-preview-defaults]');
		if (!summary) return;
		const parts = [
			this.selectedOptionLabel('[data-agenda-default-location]'),
			this.selectedOptionLabel('[data-agenda-default-professional]'),
			this.selectedOptionLabel('[data-agenda-default-service]'),
		].filter(Boolean);
		const isOpen = root?.classList.contains('is-open') ?? false;
		summary.textContent = parts.join(' / ');
		summary.hidden = isOpen || parts.length === 0;
	}

	private isDefaultsMobile() {
		return window.matchMedia('(max-width: 640px)').matches;
	}

	private setDefaultsOpen(open: boolean) {
		const root = this.querySelector<HTMLElement>('[data-agenda-preview-defaults]');
		const toggle = this.querySelector<HTMLButtonElement>('[data-agenda-defaults-toggle]');
		if (!root || !toggle) return;
		if (!open) closePanelThemedSelects(this);
		// El overflow:visible (necesario para que los selects desplieguen su lista) se
		// activa recién cuando termina la transición de grid-template-rows: si se aplica
		// de entrada, el contenido se muestra sin recortar durante toda la animación y
		// se ve un salto/"lag" en mobile en vez de un acordeón fluido.
		window.clearTimeout(this.#defaultsSettleTimer);
		root.classList.remove('is-settled');
		root.classList.toggle('is-open', open);
		toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		this.syncDefaultsCollapseA11y();
		this.updateDefaultsSummary();
		if (open) {
			this.#defaultsSettleTimer = window.setTimeout(() => {
				root.classList.add('is-settled');
			}, 240);
		}
	}

	private toggleDefaultsOpen() {
		const root = this.querySelector<HTMLElement>('[data-agenda-preview-defaults]');
		this.setDefaultsOpen(!(root?.classList.contains('is-open') ?? false));
	}

	private syncDefaultsCollapseA11y() {
		const panel = this.querySelector<HTMLElement>('[data-agenda-defaults-panel]');
		const root = this.querySelector<HTMLElement>('[data-agenda-preview-defaults]');
		if (!panel) return;
		const collapsedOnMobile = this.isDefaultsMobile() && !root?.classList.contains('is-open');
		if (collapsedOnMobile) {
			panel.setAttribute('inert', '');
		} else {
			panel.removeAttribute('inert');
		}
	}

	private defaultServiceIdFromRows() {
		if (this.#services.length === 1) return this.#services[0].id_service;
		const ids = new Set(
			this.#rows.map((row) => row.ser_id_service).filter((id) => id > 0)
		);
		if (ids.size === 1) return [...ids][0];
		return 0;
	}

	private setupImage(imageDataUrl: string) {
		const pane = this.querySelector<HTMLElement>('[data-agenda-preview-image-pane]');
		const img = this.querySelector<HTMLImageElement>('[data-agenda-preview-image]');
		const dialog = this.querySelector<HTMLElement>('.agenda-preview-dialog');
		if (!pane || !img) return;
		if (imageDataUrl) {
			img.src = imageDataUrl;
			pane.classList.add('is-visible');
			pane.style.display = '';
			dialog?.classList.add('has-image');
		} else {
			img.removeAttribute('src');
			pane.classList.remove('is-visible');
			pane.style.display = '';
			dialog?.classList.remove('has-image');
		}
		this.#panX = 0;
		this.#panY = 0;
		this.setZoom(1);
	}

	private bindImagePan(signal: AbortSignal) {
		const frame = this.querySelector<HTMLElement>('[data-agenda-image-frame]');
		if (!frame) return;

		const onPointerMove = (event: PointerEvent) => {
			if (!this.#dragging) return;
			const dx = event.clientX - this.#dragStartX;
			const dy = event.clientY - this.#dragStartY;
			this.#panX = this.#panStartX + dx;
			this.#panY = this.#panStartY + dy;
			this.applyImageTransform();
		};

		const endPan = () => {
			if (!this.#dragging) return;
			this.#dragging = false;
			frame.classList.remove('is-panning');
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', endPan);
			window.removeEventListener('pointercancel', endPan);
			window.removeEventListener('blur', endPan);
		};

		const onPointerDown = (event: PointerEvent) => {
			if (event.button !== 0 && event.pointerType === 'mouse') return;
			if (this.#zoom <= 1) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest('button')) return;

			this.#dragging = true;
			this.#dragStartX = event.clientX;
			this.#dragStartY = event.clientY;
			this.#panStartX = this.#panX;
			this.#panStartY = this.#panY;
			frame.classList.add('is-panning');
			event.preventDefault();

			window.addEventListener('pointermove', onPointerMove);
			window.addEventListener('pointerup', endPan);
			window.addEventListener('pointercancel', endPan);
			window.addEventListener('blur', endPan);
		};

		frame.addEventListener('pointerdown', onPointerDown, { signal });

		signal.addEventListener('abort', () => endPan(), { once: true });

		const img = this.querySelector<HTMLImageElement>('[data-agenda-preview-image]');
		img?.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
	}

	private setZoom(value: number) {
		this.#zoom = Math.min(4, Math.max(0.5, value));
		if (this.#zoom <= 1) {
			this.#panX = 0;
			this.#panY = 0;
		}
		this.applyImageTransform();
		this.syncPanCursor();
	}

	private applyImageTransform() {
		const img = this.querySelector<HTMLImageElement>('[data-agenda-preview-image]');
		if (!img) return;
		img.style.transform = `translate(${this.#panX}px, ${this.#panY}px) scale(${this.#zoom})`;
	}

	private syncPanCursor() {
		const frame = this.querySelector<HTMLElement>('[data-agenda-image-frame]');
		if (!frame) return;
		frame.classList.toggle('is-zoomable', this.#zoom > 1);
	}

	private defaultsValues() {
		return {
			professional: toInt(
				this.querySelector<HTMLSelectElement>('[data-agenda-default-professional]')?.value
			),
			location: toInt(
				this.querySelector<HTMLSelectElement>('[data-agenda-default-location]')?.value
			),
			service: toInt(
				this.querySelector<HTMLSelectElement>('[data-agenda-default-service]')?.value
			),
		};
	}

	private applyDefaults(overwriteAll: boolean) {
		this.syncDefaultsToRows(overwriteAll);
		this.renderRows();
	}

	private syncDefaultsToRows(overwriteAll: boolean) {
		const defaults = this.defaultsValues();
		for (const row of this.#rows) {
			if (defaults.professional && (overwriteAll || !row.pro_id_professional)) {
				row.pro_id_professional = defaults.professional;
			}
			if (defaults.location && (overwriteAll || !row.loc_id_location)) {
				row.loc_id_location = defaults.location;
			}
			if (defaults.service && (overwriteAll || !row.ser_id_service)) {
				row.ser_id_service = defaults.service;
			}
		}
	}

	private applyGlobalLocation() {
		const location = this.defaultsValues().location;
		if (!location) return;
		for (const row of this.#rows) {
			row.loc_id_location = location;
		}
	}

	private addRow() {
		const defaults = this.defaultsValues();
		this.#rows.push({
			uid: uid(),
			customer_name: '',
			customer_phone: '',
			date: '',
			time: '',
			ser_id_service: defaults.service,
			pro_id_professional: defaults.professional,
			loc_id_location: defaults.location,
			confidence: 'high',
			raw_text: '',
		});
		this.renderRows();
	}

	private isRowValid(row: PreviewRowState) {
		return Boolean(
			row.customer_name.trim() &&
				row.ser_id_service > 0 &&
				row.pro_id_professional > 0 &&
				row.loc_id_location > 0 &&
				row.date &&
				row.time
		);
	}

	private renderRows() {
		this.closePopovers();
		const container = this.querySelector<HTMLElement>('[data-agenda-preview-rows]');
		if (!container) return;
		container.innerHTML = '';

		for (const row of this.#rows) {
			container.appendChild(this.buildRowElement(row));
		}

		this.updateCounts();
	}

	private clientInitial(name: string) {
		const trimmed = name.trim();
		if (!trimmed) return '?';
		const parts = trimmed.split(/\s+/).filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
		}
		return trimmed.slice(0, 1).toUpperCase();
	}

	private buildRowElement(row: PreviewRowState) {
		const el = document.createElement('div');
		el.className = 'agenda-preview-row';
		el.dataset.uid = row.uid;
		el.dataset.confidence = row.confidence;

		const field = (
			key: string,
			label: string,
			icon: string,
			controlHtml: string,
			extraClass = ''
		) => {
			const hasSelect = controlHtml.includes('<select');
			return `
			<div class="agenda-preview-row__field ${extraClass}" data-field="${key}">
				<label>${label}</label>
				<div class="agenda-preview-row__control">
					<span class="material-symbols-rounded agenda-preview-row__icon" aria-hidden="true">${icon}</span>
					${controlHtml}
					${hasSelect ? '<span class="agenda-preview-row__chevron material-symbols-rounded" aria-hidden="true">expand_more</span>' : ''}
				</div>
			</div>
		`;
		};

		el.innerHTML = `
			<div class="agenda-preview-row__client">
				<div class="agenda-preview-row__lead" data-field="name">
					<span class="agenda-preview-row__avatar" data-row-avatar aria-hidden="true">${this.escape(this.clientInitial(row.customer_name))}</span>
					<input
						type="text"
						class="agenda-preview-row__lead-name"
						data-row-name
						value="${this.escape(row.customer_name)}"
						placeholder="Nombre del cliente"
						aria-label="Cliente"
					/>
				</div>
				${field(
					'phone',
					'Teléfono (opcional)',
					'call',
					`<input type="tel" data-row-phone value="${this.escape(row.customer_phone)}" placeholder="Teléfono pendiente" aria-label="Teléfono (opcional)" />`,
					'agenda-preview-row__field--compact agenda-preview-row__field--phone'
				)}
			</div>
			<div class="agenda-preview-row__datetime">
				${field(
					'time',
					'Hora',
					'schedule',
					`<input type="text" inputmode="numeric" autocomplete="off" spellcheck="false" class="agenda-preview-timeinput" data-row-time value="${this.escape(row.time)}" placeholder="hh:mm" aria-label="Hora" aria-autocomplete="list" aria-expanded="false" aria-controls="agenda-preview-times-list" />`,
					'agenda-preview-row__field--time'
				)}
				${field(
					'date',
					'Fecha',
					'calendar_month',
					`<button type="button" class="agenda-preview-datebtn${row.date ? '' : ' is-empty'}" data-row-date aria-haspopup="dialog" aria-label="Fecha">${this.escape(formatDisplayDate(row.date) || 'Elegir fecha')}</button>`
				)}
			</div>
			${field(
				'service',
				'Servicio',
				'design_services',
				`<select data-row-service aria-label="Servicio">${this.optionList(
					this.#services.map((s) => ({ id: s.id_service, name: s.name })),
					row.ser_id_service,
					PLACEHOLDER_SERVICE
				)}</select>`
			)}
			<div class="agenda-preview-row__pro">
				${field(
					'professional',
					'Profesional',
					'badge',
					`<select data-row-professional aria-label="Profesional">${this.optionList(
						this.#professionals.map((p) => ({ id: p.id_professional, name: p.name })),
						row.pro_id_professional,
						PLACEHOLDER_PROFESSIONAL
					)}</select>`
				)}
			</div>
			<button type="button" class="agenda-preview-row__delete" data-row-delete aria-label="Eliminar cita">
				<span class="material-symbols-rounded" aria-hidden="true">delete</span>
			</button>
		`;

		const signal = this.#listeners?.signal;
		el.querySelector('[data-row-delete]')?.addEventListener('click', () => {
			this.#rows = this.#rows.filter((r) => r.uid !== row.uid);
			this.renderRows();
		}, signal ? { signal } : undefined);

		const bind = (selector: string, apply: (value: string) => void) => {
			el.querySelector(selector)?.addEventListener('input', (event) => {
				apply((event.target as HTMLInputElement | HTMLSelectElement).value);
				this.refreshRowState(el, row);
			}, signal ? { signal } : undefined);
			el.querySelector(selector)?.addEventListener('change', (event) => {
				apply((event.target as HTMLInputElement | HTMLSelectElement).value);
				this.refreshRowState(el, row);
			}, signal ? { signal } : undefined);
		};

		el.querySelector('[data-row-date]')?.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.openCalendar(row, event.currentTarget as HTMLElement, el);
		}, signal ? { signal } : undefined);

		const timeInput = el.querySelector<HTMLInputElement>('[data-row-time]');
		timeInput?.addEventListener('focus', () => {
			this.openTimes(row, timeInput, el);
		}, signal ? { signal } : undefined);
		timeInput?.addEventListener('input', () => {
			this.renderTimeOptions(timeInput.value, row.time);
		}, signal ? { signal } : undefined);
		timeInput?.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.commitTime(row, timeInput, el);
				this.closePopovers();
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				this.closePopovers(true);
			}
		}, signal ? { signal } : undefined);
		timeInput?.addEventListener('blur', () => {
			window.setTimeout(() => {
				if (this.#activeTimeInput !== timeInput) return;
				this.commitTime(row, timeInput, el);
				this.closePopovers();
			}, 140);
		}, signal ? { signal } : undefined);

		bind('[data-row-name]', (v) => {
			row.customer_name = v;
			const avatar = el.querySelector<HTMLElement>('[data-row-avatar]');
			if (avatar) avatar.textContent = this.clientInitial(v);
		});
		bind('[data-row-phone]', (v) => (row.customer_phone = v));
		bind('[data-row-service]', (v) => (row.ser_id_service = toInt(v)));
		bind('[data-row-professional]', (v) => (row.pro_id_professional = toInt(v)));

		el.querySelectorAll('.agenda-preview-row__check').forEach((node) => node.remove());
		this.mountRowThemedSelects(el);
		this.refreshRowState(el, row);
		return el;
	}

	private isPopoverOpen() {
		const cal = this.querySelector<HTMLElement>('[data-agenda-cal]');
		const times = this.querySelector<HTMLElement>('[data-agenda-times]');
		const themedOpen = this.querySelector('.panel-themed-select.is-open, .schedule-themed-select.is-open');
		return Boolean((cal && !cal.hidden) || (times && !times.hidden) || themedOpen);
	}

	private bindOutsideClose() {
		if (this.#outsideClose) return;
		this.#outsideClose = (event: Event) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			const cal = this.querySelector('[data-agenda-cal]');
			const times = this.querySelector('[data-agenda-times]');
			if (cal?.contains(target) || times?.contains(target)) return;
			if (this.#activeDateEl?.contains(target) || this.#activeTimeEl?.contains(target)) return;
			if (this.#activeTimeRow && this.#activeTimeInput) {
				const rowEl = this.#activeTimeInput.closest<HTMLElement>('.agenda-preview-row');
				if (rowEl) this.commitTime(this.#activeTimeRow, this.#activeTimeInput, rowEl);
			}
			this.closePopovers();
		};
		document.addEventListener('pointerdown', this.#outsideClose);
	}

	private unbindOutsideClose() {
		if (!this.#outsideClose) return;
		document.removeEventListener('pointerdown', this.#outsideClose);
		this.#outsideClose = null;
	}

	private closePopovers(restoreTime = false) {
		closePanelThemedSelects(this);
		this.closeDateTimePopovers(restoreTime);
	}

	private closeDateTimePopovers(restoreTime = false) {
		const cal = this.querySelector<HTMLElement>('[data-agenda-cal]');
		const times = this.querySelector<HTMLElement>('[data-agenda-times]');
		if (cal) cal.hidden = true;
		if (times) times.hidden = true;
		this.#activeDateEl?.closest('[data-field]')?.classList.remove('is-open');
		this.#activeTimeEl?.closest('[data-field]')?.classList.remove('is-open');
		if (this.#activeTimeInput) {
			this.#activeTimeInput.setAttribute('aria-expanded', 'false');
			if (restoreTime && this.#activeTimeRow) {
				this.#activeTimeInput.value = this.#activeTimeRow.time;
			}
		}
		this.#activeDateRow = null;
		this.#activeDateEl = null;
		this.#activeTimeRow = null;
		this.#activeTimeEl = null;
		this.#activeTimeInput = null;
		this.unbindOutsideClose();
	}

	private positionPopover(popover: HTMLElement, anchor: HTMLElement) {
		popover.hidden = false;
		const rect = anchor.getBoundingClientRect();
		const width = popover.offsetWidth;
		const height = popover.offsetHeight;
		let left = rect.left;
		if (left + width > window.innerWidth - 8) {
			left = Math.max(8, window.innerWidth - width - 8);
		}
		let top = rect.bottom + 6;
		if (top + height > window.innerHeight - 8) {
			top = Math.max(8, rect.top - height - 6);
		}
		popover.style.left = `${left}px`;
		popover.style.top = `${top}px`;
	}

	private openCalendar(row: PreviewRowState, button: HTMLElement, rowEl: HTMLElement) {
		const cal = this.querySelector<HTMLElement>('[data-agenda-cal]');
		if (!cal) return;
		this.closePopovers();
		this.#activeDateRow = row;
		this.#activeDateEl = button;
		button.closest('[data-field]')?.classList.add('is-open');
		this.#calView = parseIsoDate(row.date) || new Date();
		this.renderCalendarDays();
		this.positionPopover(cal, button);
		this.bindOutsideClose();
		void rowEl;
	}

	private renderCalendarDays() {
		const grid = this.querySelector<HTMLElement>('[data-agenda-cal-days]');
		const label = this.querySelector<HTMLElement>('[data-agenda-cal-label]');
		if (!grid) return;
		const year = this.#calView.getFullYear();
		const month = this.#calView.getMonth();
		if (label) label.textContent = `${MONTH_NAMES[month]} ${year}`;

		const selected = this.#activeDateRow?.date || '';
		const today = toIsoDate(new Date());
		const first = new Date(year, month, 1);
		const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
		const cursor = new Date(year, month, 1 - startOffset);

		grid.innerHTML = '';
		for (let i = 0; i < 42; i += 1) {
			const iso = toIsoDate(cursor);
			const day = document.createElement('button');
			day.type = 'button';
			day.className = 'agenda-preview-cal__day';
			if (cursor.getMonth() !== month) day.classList.add('agenda-preview-cal__day--out');
			if (iso === today) day.classList.add('agenda-preview-cal__day--today');
			if (iso === selected) day.classList.add('agenda-preview-cal__day--selected');
			day.textContent = String(cursor.getDate());
			day.addEventListener('click', () => this.selectDate(iso));
			grid.appendChild(day);
			cursor.setDate(cursor.getDate() + 1);
		}
	}

	private selectDate(iso: string) {
		const row = this.#activeDateRow;
		const button = this.#activeDateEl;
		if (!row || !button) return;
		row.date = iso;
		button.textContent = formatDisplayDate(iso) || 'Elegir fecha';
		button.classList.toggle('is-empty', !iso);
		const rowEl = button.closest<HTMLElement>('.agenda-preview-row');
		if (rowEl) this.refreshRowState(rowEl, row);
		this.closePopovers();
	}

	private openTimes(row: PreviewRowState, input: HTMLInputElement, rowEl: HTMLElement) {
		const list = this.querySelector<HTMLElement>('[data-agenda-times]');
		if (!list) return;
		if (this.#activeTimeInput === input && !list.hidden) {
			this.renderTimeOptions(input.value, row.time);
			return;
		}
		this.closePopovers();
		this.#activeTimeRow = row;
		this.#activeTimeInput = input;
		this.#activeTimeEl = input;
		input.closest('[data-field]')?.classList.add('is-open');
		input.setAttribute('aria-expanded', 'true');
		this.renderTimeOptions(input.value, row.time);
		this.positionPopover(list, input);
		this.bindOutsideClose();
		const active = list.querySelector<HTMLElement>('.is-active');
		active?.scrollIntoView({ block: 'nearest' });
		void rowEl;
	}

	private renderTimeOptions(query: string, selected: string) {
		const list = this.querySelector<HTMLElement>('[data-agenda-times]');
		if (!list) return;
		const digits = String(query || '').replace(/\D/g, '');
		const slots = TIME_SLOTS.filter((slot) => {
			if (!query.trim()) return true;
			return slot.startsWith(query.trim()) || slot.replace(':', '').startsWith(digits);
		});
		list.innerHTML = '';
		for (const slot of slots.length ? slots : TIME_SLOTS) {
			const option = document.createElement('button');
			option.type = 'button';
			option.className = 'agenda-preview-times__opt';
			option.setAttribute('role', 'option');
			if (slot === selected || slot === snapTime(query)) option.classList.add('is-active');
			option.textContent = slot;
			option.addEventListener('pointerdown', (event) => {
				event.preventDefault();
				this.selectTime(slot);
			});
			list.appendChild(option);
		}
	}

	private selectTime(slot: string) {
		const row = this.#activeTimeRow;
		const input = this.#activeTimeInput;
		if (!row || !input) return;
		row.time = slot;
		input.value = slot;
		const rowEl = input.closest<HTMLElement>('.agenda-preview-row');
		if (rowEl) this.refreshRowState(rowEl, row);
		this.closePopovers();
	}

	private commitTime(row: PreviewRowState, input: HTMLInputElement, rowEl: HTMLElement) {
		const snapped = snapTime(input.value);
		if (snapped) {
			row.time = snapped;
			input.value = snapped;
		} else {
			input.value = row.time;
		}
		this.refreshRowState(rowEl, row);
	}

	private syncPlaceholderState(root: ParentNode = this) {
		root.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
			select.classList.toggle('is-placeholder', !select.value);
			const themed = select.closest<HTMLElement>('.panel-themed-select, .schedule-themed-select');
			if (themed) syncPanelThemedSelect(themed, this.themedSelectOptions(select));
		});
	}

	private refreshRowState(el: HTMLElement, row: PreviewRowState) {
		const filled: Record<string, boolean> = {
			time: Boolean(row.time),
			date: Boolean(row.date),
			name: Boolean(row.customer_name.trim()),
			phone: Boolean(row.customer_phone.trim()),
			service: row.ser_id_service > 0,
			professional: row.pro_id_professional > 0,
			location: row.loc_id_location > 0,
		};

		for (const [key, isFilled] of Object.entries(filled)) {
			const node = el.querySelector(`[data-field="${key}"]`);
			if (!node) continue;
			node.classList.toggle('is-valid', isFilled);
			node.classList.remove('is-missing');
		}

		this.applyGlobalLocation();
		const ready = this.isRowValid(row);
		const dateBtn = el.querySelector<HTMLElement>('[data-row-date]');
		if (dateBtn) {
			dateBtn.textContent = formatDisplayDate(row.date) || 'Elegir fecha';
			dateBtn.classList.toggle('is-empty', !row.date);
		}
		el.classList.toggle('is-incomplete', !ready);
		el.setAttribute('aria-label', ready ? 'Listo' : 'Datos faltantes');
		this.syncPlaceholderState(el);
		this.updateCounts();
	}

	private updateCounts() {
		this.applyGlobalLocation();
		const total = this.#rows.length;
		const hasLocation = this.defaultsValues().location > 0;
		const valid = hasLocation ? this.#rows.filter((row) => this.isRowValid(row)).length : 0;
		const countNode = this.querySelector<HTMLElement>('[data-agenda-preview-count]');
		if (countNode) countNode.textContent = String(total);
		const pendingLabel = this.querySelector<HTMLElement>('[data-agenda-preview-pending-label]');
		if (pendingLabel) pendingLabel.textContent = total === 1 ? 'pendiente' : 'pendientes';

		const saveLabel = this.querySelector<HTMLElement>('[data-agenda-save-label]');
		if (saveLabel) {
			if (total === 0) {
				saveLabel.textContent = 'Completar y guardar';
			} else if (valid === 0) {
				saveLabel.textContent = 'Completá los datos para guardar';
			} else if (valid === total) {
				saveLabel.textContent = 'Completar y guardar';
			} else {
				saveLabel.textContent = `Guardar ${valid} de ${total} citas`;
			}
		}

		const saveButton = this.querySelector<HTMLButtonElement>('[data-agenda-preview-save]');
		if (saveButton) saveButton.disabled = valid === 0 || this.#saving;
	}

	private serviceDuration(serviceId: number) {
		const service = this.#services.find((item) => item.id_service === serviceId);
		return service && service.duration_minutes > 0 ? service.duration_minutes : 60;
	}

	private setError(message: string) {
		const node = this.querySelector<HTMLElement>('[data-agenda-preview-error]');
		if (!node) return;
		if (!message) {
			node.textContent = '';
			node.classList.add('hidden');
			return;
		}
		node.textContent = message;
		node.classList.remove('hidden');
	}

	private async save() {
		if (this.#saving) return;
		this.syncDefaultsToRows(false);
		this.applyGlobalLocation();
		const validRows = this.#rows.filter((row) => this.isRowValid(row));
		if (validRows.length === 0) {
			this.setError('Completá al menos una cita con cliente, servicio, profesional, sucursal, fecha y hora.');
			return;
		}

		this.#saving = true;
		this.updateCounts();
		this.setError('');

		const appointments = validRows.map((row) => {
			const end = addMinutesWallClock(row.date, row.time, this.serviceDuration(row.ser_id_service));
			return {
				loc_id_location: row.loc_id_location,
				pro_id_professional: row.pro_id_professional,
				ser_id_service: row.ser_id_service,
				customer_name: row.customer_name.trim(),
				customer_phone: row.customer_phone.trim() || undefined,
				start_time: buildIso(row.date, row.time),
				end_time: buildIso(end.date, end.time),
			};
		});

		try {
			const response = await fetch('/api/appointments/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ appointments }),
			});
			const payload = (await response.json()) as {
				status?: string;
				message?: string;
				data?: { created?: number; failed?: number };
			};

			const created = Number(payload.data?.created || 0);
			const failed = Number(payload.data?.failed || 0);

			if (!response.ok && created === 0) {
				throw new Error(payload.message || 'No fue posible guardar las citas.');
			}

			if (created > 0) {
				const saveButton = this.querySelector<HTMLButtonElement>('[data-agenda-preview-save]');
				if (saveButton) {
					const detail = failed > 0 ? ` · ${failed} con error` : '';
					saveButton.textContent = `✓ ${created} guardadas${detail}`;
				}
				window.setTimeout(() => {
					window.location.href = '/panel/calendar';
				}, 700);
				return;
			}

			this.setError(payload.message || 'No se pudo guardar ninguna cita. Revisá los datos.');
		} catch (error) {
			this.setError(error instanceof Error ? error.message : 'No fue posible guardar las citas.');
		} finally {
			this.#saving = false;
			this.updateCounts();
		}
	}
}

if (!customElements.get('agenda-scan-preview')) {
	customElements.define('agenda-scan-preview', AgendaScanPreview);
}

export { AgendaScanPreview };
