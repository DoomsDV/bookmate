import type { AgendaScanRow } from '../lib/appointment-ai-types';

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
			if (event.key === 'Escape' && shell?.open) {
				event.preventDefault();
				this.close();
			}
		}, { signal });

		this.querySelector('[data-agenda-default-professional]')?.addEventListener('change', () => {
			this.syncPlaceholderState(this.querySelector('[data-agenda-preview-defaults]') || this);
			this.applyDefaults(true);
		}, { signal });
		this.querySelector('[data-agenda-default-location]')?.addEventListener('change', () => {
			this.syncPlaceholderState(this.querySelector('[data-agenda-preview-defaults]') || this);
			this.applyDefaults(true);
		}, { signal });
		this.querySelector('[data-agenda-default-service]')?.addEventListener('change', () => {
			this.syncPlaceholderState(this.querySelector('[data-agenda-preview-defaults]') || this);
			this.applyDefaults(true);
		}, { signal });
	}

	disconnectedCallback() {
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
		this.renderRows();
		this.setError('');

		const shell = this.querySelector<HTMLDialogElement>('[data-agenda-preview-shell]');
		if (shell && !shell.open) shell.showModal();
	}

	close() {
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
		// Chrome/móvil ignora padding CSS en <option>; un NBSP da aire sin exagerar.
		const pad = (label: string) => `\u00A0${label}`;
		const opts = [`<option value="">${pad(this.escape(placeholder))}</option>`];
		for (const item of items) {
			const sel = item.id === selected ? ' selected' : '';
			opts.push(`<option value="${item.id}"${sel}>${pad(this.escape(item.name))}</option>`);
		}
		return opts.join('');
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
				'— Profesional —'
			);
		}
		if (locSelect) {
			locSelect.innerHTML = this.optionList(
				this.#locations.map((l) => ({ id: l.id_location, name: l.name })),
				this.#locations.length === 1 ? this.#locations[0].id_location : 0,
				'— Sucursal —'
			);
		}
		if (serviceSelect) {
			serviceSelect.innerHTML = this.optionList(
				this.#services.map((s) => ({ id: s.id_service, name: s.name })),
				this.defaultServiceIdFromRows(),
				'— Servicio —'
			);
		}
		this.syncPlaceholderState(this.querySelector('[data-agenda-preview-defaults]') || this);
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
		) => `
			<div class="agenda-preview-row__field ${extraClass}" data-field="${key}">
				<label>${label}</label>
				<div class="agenda-preview-row__control">
					<span class="material-symbols-rounded agenda-preview-row__icon" aria-hidden="true">${icon}</span>
					${controlHtml}
				</div>
			</div>
		`;

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
					'Teléfono',
					'call',
					`<input type="tel" data-row-phone value="${this.escape(row.customer_phone)}" placeholder="Añadir teléfono" aria-label="Teléfono" />`,
					'agenda-preview-row__field--compact agenda-preview-row__field--phone'
				)}
			</div>
			<div class="agenda-preview-row__datetime">
				${field(
					'time',
					'Hora',
					'schedule',
					`<input type="time" data-row-time value="${this.escape(row.time)}" aria-label="Hora" />`,
					'agenda-preview-row__field--time'
				)}
				${field(
					'date',
					'Fecha',
					'calendar_month',
					`<input type="date" data-row-date value="${this.escape(row.date)}" aria-label="Fecha" />`
				)}
			</div>
			${field(
				'service',
				'Servicio',
				'design_services',
				`<select data-row-service aria-label="Servicio">${this.optionList(
					this.#services.map((s) => ({ id: s.id_service, name: s.name })),
					row.ser_id_service,
					'— Servicio —'
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
						'— Profesional —'
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

		bind('[data-row-time]', (v) => (row.time = v));
		bind('[data-row-date]', (v) => (row.date = v));
		bind('[data-row-name]', (v) => {
			row.customer_name = v;
			const avatar = el.querySelector<HTMLElement>('[data-row-avatar]');
			if (avatar) avatar.textContent = this.clientInitial(v);
		});
		bind('[data-row-phone]', (v) => (row.customer_phone = v));
		bind('[data-row-service]', (v) => (row.ser_id_service = toInt(v)));
		bind('[data-row-professional]', (v) => (row.pro_id_professional = toInt(v)));

		el.querySelectorAll('.agenda-preview-row__check').forEach((node) => node.remove());
		this.refreshRowState(el, row);
		return el;
	}

	private syncPlaceholderState(root: ParentNode = this) {
		root.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
			select.classList.toggle('is-placeholder', !select.value);
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
