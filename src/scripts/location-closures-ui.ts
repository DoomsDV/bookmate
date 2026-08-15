import TomSelect from 'tom-select';
import { showFlashMessage } from '../lib/flash';
import { showOrgClosuresTour } from '../lib/org-closures-tour';
import { destroyActiveBookmateTour } from '../lib/product-tour';

const showAppAlert = ({ type, message }: { type: 'success' | 'error'; message: string }) =>
	showFlashMessage({ type, message });

interface ClosureItem {
	id_location_closure: number;
	loc_id_location: number | null;
	name: string;
	start_date: string;
	end_date: string;
	is_full_day: 0 | 1;
	start_time: string | null;
	end_time: string | null;
	closure_group_id: string | null;
	scope: 'LOCATION' | 'ORG';
	location_count?: number;
}

interface LocationLovItem {
	id_location: number;
	name: string;
}

const $ = <T extends HTMLElement>(selector: string, root: ParentNode = document) =>
	root.querySelector(selector) as T | null;

const formatDateRange = (start: string, end: string) => {
	if (!start) return '';
	if (!end || start === end) return start;
	return `${start} → ${end}`;
};

const fmtWindow = (item: ClosureItem) =>
	item.is_full_day ? 'Día completo' : `${item.start_time ?? ''} – ${item.end_time ?? ''}`;

const TOM_SELECT_ES_RENDER = {
	option_create: (data: { input?: string }, escape: (str: string) => string) =>
		`<div class="create">Agregar «<strong>${escape(data.input ?? '')}</strong>»…</div>`,
	no_results: () => '<div class="no-results">Sin resultados</div>',
};

function buildItemHTML(item: ClosureItem, opts: { canDeleteGroup: boolean }) {
	const scopeBadge = item.closure_group_id
		? item.location_count && item.location_count > 0
			? `<span class="location-closures-badge location-closures-badge--org"><span class="material-symbols-rounded text-[0.9rem]">public</span>${item.location_count} sucursales</span>`
			: '<span class="location-closures-badge location-closures-badge--org"><span class="material-symbols-rounded text-[0.9rem]">public</span>Varias</span>'
		: '<span class="location-closures-badge"><span class="material-symbols-rounded text-[0.9rem]">store</span>Esta sucursal</span>';

	const windowBadge = item.is_full_day
		? '<span class="location-closures-badge">Día completo</span>'
		: `<span class="location-closures-badge">${item.start_time ?? ''} – ${item.end_time ?? ''}</span>`;

	const loc = item.loc_id_location ?? 0;
	const groupActions =
		item.closure_group_id && opts.canDeleteGroup
			? `<button type="button" class="location-closures-item__delete" data-closure-delete-group="${item.id_location_closure}" data-closure-loc="${loc}" title="Eliminar de todas las sucursales">
					<span class="material-symbols-rounded text-[1.15rem]">delete_sweep</span>
				</button>`
			: '';

	return `
		<div class="location-closures-item" data-closure-item data-closure-id="${item.id_location_closure}">
			<div class="location-closures-item__meta">
				<span class="location-closures-item__name">${escapeHtml(item.name)}</span>
				<span class="location-closures-item__dates">${escapeHtml(formatDateRange(item.start_date, item.end_date))}</span>
				<span class="location-closures-item__badges">
					${scopeBadge}
					${windowBadge}
				</span>
			</div>
			<div class="location-closures-item__actions">
				${groupActions}
				<button type="button" class="location-closures-item__delete" data-closure-delete="${item.id_location_closure}" data-closure-loc="${loc}" title="Eliminar cierre">
					<span class="material-symbols-rounded text-[1.15rem]">delete</span>
				</button>
			</div>
		</div>
	`;
}

function escapeHtml(str: string) {
	return String(str).replace(/[&<>"']/g, (ch) => {
		switch (ch) {
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

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: {
			Accept: 'application/json',
			...(init.headers || {}),
		},
	});
	const body = await response.json().catch(() => null);
	if (!response.ok || !body || body.status !== 'success') {
		const message =
			body && typeof body.message === 'string' && body.message.trim().length > 0
				? body.message
				: 'No fue posible completar la operación.';
		throw new Error(message);
	}
	return body as T;
}

class LocationClosuresUI {
	private root: HTMLElement;
	private currentLocationId = 0;
	private orgMode = false;
	private editModalOpen = false;
	private abortController: AbortController | null = null;
	private orgCloseTimer: number | null = null;
	private locationsTom: TomSelect | null = null;
	private locationsLoaded = false;
	private locationsLoadPromise: Promise<void> | null = null;
	private motives: {
		holidays: Array<{
			id_holiday: number;
			name: string;
			holiday_date: string;
			already_closed: boolean;
		}>;
		custom_names: string[];
	} = { holidays: [], custom_names: [] };
	private motivesLoaded = false;
	private motivesLoadPromise: Promise<void> | null = null;
	private selectedHolidayId = 0;
	private hideMotiveTimer: number | null = null;

	constructor(root: HTMLElement) {
		this.root = root;
		this.bind();
	}

	destroy() {
		if (this.orgCloseTimer) {
			window.clearTimeout(this.orgCloseTimer);
			this.orgCloseTimer = null;
		}
		this.abortController?.abort();
		this.abortController = null;
		if (this.locationsTom) {
			this.locationsTom.destroy();
			this.locationsTom = null;
		}
		if (this.hideMotiveTimer) {
			window.clearTimeout(this.hideMotiveTimer);
			this.hideMotiveTimer = null;
		}
	}

	/** Siempre resuelve nodos vivos del DOM (evita refs stale tras HMR / server:defer). */
	private els() {
		const root = this.root.isConnected
			? this.root
			: (document.querySelector('location-manager') as HTMLElement | null);
		if (!root || !root.isConnected) return null;
		this.root = root;
		return {
			root,
			section: $('[data-closures-section]', root),
			listEl: $('[data-closures-list]', root),
			emptyEl: $('[data-closures-empty]', root),
			orgDialog: $('[data-org-closures-dialog]', root) as HTMLDialogElement | null,
			orgListEl: $('[data-org-closures-list]', root),
			orgEmptyEl: $('[data-org-closures-empty]', root),
			formDialog: $('[data-closure-form-dialog]', root) as HTMLDialogElement | null,
			formEl: $('[data-closure-form]', root) as HTMLFormElement | null,
			formTitle: $('[data-closure-form-title]', root),
			formError: $('[data-closure-form-error]', root),
			inputName: $('[data-closure-name]', root) as HTMLInputElement | null,
			inputHolidayId: $('[data-closure-holiday-id]', root) as HTMLInputElement | null,
			motiveClear: $('[data-closure-motive-clear]', root) as HTMLButtonElement | null,
			motiveResults: $('[data-closure-motive-results]', root),
			inputStart: $('[data-closure-start-date]', root) as HTMLInputElement | null,
			inputEnd: $('[data-closure-end-date]', root) as HTMLInputElement | null,
			inputFullDay: $('[data-closure-full-day]', root) as HTMLInputElement | null,
			partialRow: $('[data-closure-partial-row]', root),
			inputStartTime: $('[data-closure-start-time]', root) as HTMLInputElement | null,
			inputEndTime: $('[data-closure-end-time]', root) as HTMLInputElement | null,
			scopeWrap: $('[data-closure-scope-wrap]', root),
			applyAll: $('[data-closure-apply-all]', root) as HTMLInputElement | null,
			locationsWrap: $('[data-closure-locations-wrap]', root),
			locationsSelect: $('[data-closure-locations]', root) as HTMLSelectElement | null,
		};
	}

	private bind() {
		this.abortController?.abort();
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		this.root.addEventListener(
			'location-modal:edit-opened',
			(event: Event) => {
				const custom = event as CustomEvent<{ locationId: number }>;
				const locationId = Number(custom.detail?.locationId || 0);
				if (locationId > 0) {
					this.editModalOpen = true;
					this.currentLocationId = locationId;
					this.els()?.section?.removeAttribute('hidden');
					void this.reloadLocationClosures();
				}
			},
			{ signal }
		);

		this.root.addEventListener(
			'location-modal:closed',
			() => {
				this.editModalOpen = false;
				this.currentLocationId = 0;
				this.els()?.section?.setAttribute('hidden', '');
			},
			{ signal }
		);

		document.addEventListener(
			'hasel:open-org-closure',
			(event: Event) => {
				const detail = (event as CustomEvent<{
					name?: string;
					idHoliday?: number;
					startDate?: string;
					endDate?: string;
					fullDay?: boolean;
					applyAll?: boolean;
				}>).detail;
				void this.openOrgFormPrefill(detail || {});
			},
			{ signal }
		);

		const motiveInput = this.els()?.inputName;
		motiveInput?.addEventListener(
			'focus',
			() => {
				void this.ensureMotivesLoaded().then(() => this.renderMotiveResults());
			},
			{ signal }
		);
		motiveInput?.addEventListener(
			'input',
			() => {
				this.onMotiveInput();
			},
			{ signal }
		);
		motiveInput?.addEventListener(
			'blur',
			() => {
				if (this.hideMotiveTimer) window.clearTimeout(this.hideMotiveTimer);
				this.hideMotiveTimer = window.setTimeout(() => this.hideMotiveResults(), 120);
			},
			{ signal }
		);
		this.els()?.motiveClear?.addEventListener(
			'click',
			(event) => {
				event.preventDefault();
				this.clearSelectedHoliday({ clearFields: true });
				this.els()?.inputName?.focus();
			},
			{ signal }
		);

		// Delegación en location-manager: el botón vive en LocationsListIsland (server:defer).
		this.root.addEventListener(
			'click',
			(event) => {
				const target = event.target as HTMLElement;
				const els = this.els();

				// Click en backdrop del drawer / form dialog.
				if (els?.orgDialog && target === els.orgDialog) {
					this.closeOrgDialog();
					return;
				}
				if (els?.formDialog && target === els.formDialog) {
					this.closeForm();
					return;
				}

				if (target.closest('[data-open-org-closures]')) {
					event.preventDefault();
					this.openOrgDialog();
					return;
				}
				if (target.closest('[data-close-org-closures]')) {
					this.closeOrgDialog();
					return;
				}
				if (target.closest('[data-org-closures-tour-help]')) {
					event.preventDefault();
					showOrgClosuresTour();
					return;
				}
				if (target.closest('[data-add-closure-btn]')) {
					this.openForm('location');
					return;
				}
				if (target.closest('[data-add-org-closure-btn]')) {
					this.openForm('org');
					return;
				}
				if (target.closest('[data-close-closure-form]')) {
					this.closeForm();
					return;
				}

				const del = target.closest('[data-closure-delete]') as HTMLElement | null;
				if (del) {
					const id = Number(del.getAttribute('data-closure-delete') || '0');
					const loc = Number(del.getAttribute('data-closure-loc') || '0');
					if (id > 0) void this.deleteClosure(id, loc, false);
					return;
				}
				const delGroup = target.closest('[data-closure-delete-group]') as HTMLElement | null;
				if (delGroup) {
					const id = Number(delGroup.getAttribute('data-closure-delete-group') || '0');
					const loc = Number(delGroup.getAttribute('data-closure-loc') || '0');
					if (id > 0) void this.deleteClosure(id, loc, true);
				}
			},
			{ signal }
		);

		this.root.addEventListener(
			'change',
			(event) => {
				const target = event.target as HTMLElement;
				if (target.matches('[data-closure-full-day]')) this.syncPartialVisibility();
				if (target.matches('[data-closure-apply-all]')) this.syncLocationsVisibility();
			},
			{ signal }
		);

		this.root.addEventListener(
			'submit',
			(event) => {
				const target = event.target as HTMLElement;
				if (target.matches('[data-closure-form]')) {
					event.preventDefault();
					void this.submitForm();
				}
			},
			{ signal }
		);
	}

	private syncPartialVisibility() {
		const els = this.els();
		if (!els) return;
		const full = els.inputFullDay?.checked ?? true;
		if (els.partialRow) {
			if (full) els.partialRow.setAttribute('hidden', '');
			else els.partialRow.removeAttribute('hidden');
		}
		if (els.inputStartTime) els.inputStartTime.required = !full;
		if (els.inputEndTime) els.inputEndTime.required = !full;
	}

	private syncLocationsVisibility() {
		const els = this.els();
		if (!els) return;
		const applyAll = els.applyAll?.checked ?? false;
		if (els.locationsWrap) {
			if (applyAll) els.locationsWrap.setAttribute('hidden', '');
			else els.locationsWrap.removeAttribute('hidden');
		}
		if (applyAll) {
			this.locationsTom?.clear(true);
		}
	}

	private hideMotiveResults() {
		this.els()?.motiveResults?.classList.add('hidden');
	}

	private showMotiveResults() {
		this.els()?.motiveResults?.classList.remove('hidden');
	}

	private formatHolidayDate(iso: string) {
		if (!iso) return '';
		const [year, month, day] = iso.split('-');
		if (!year || !month || !day) return iso;
		return `${day}/${month}/${year}`;
	}

	private stripHolidayPrefix(name: string) {
		return name.replace(/^feriado nacional:\s*/i, '').trim();
	}

	private setSelectedHoliday(holiday: {
		id_holiday: number;
		name: string;
		holiday_date: string;
		already_closed: boolean;
	}) {
		const els = this.els();
		if (!els) return;
		this.selectedHolidayId = holiday.id_holiday;
		if (els.inputHolidayId) els.inputHolidayId.value = String(holiday.id_holiday);
		if (els.inputName) els.inputName.value = holiday.name;
		if (els.inputStart) els.inputStart.value = holiday.holiday_date;
		if (els.inputEnd) els.inputEnd.value = holiday.holiday_date;
		if (els.inputFullDay) {
			els.inputFullDay.checked = true;
			this.syncPartialVisibility();
		}
		els.motiveClear?.classList.remove('hidden');
		this.hideMotiveResults();
		if (holiday.already_closed) {
			this.setFormError('Ya existe un cierre para este feriado.');
		} else {
			this.setFormError(null);
		}
	}

	private setCustomMotive(name: string) {
		const els = this.els();
		if (!els) return;
		this.selectedHolidayId = 0;
		if (els.inputHolidayId) els.inputHolidayId.value = '';
		if (els.inputName) els.inputName.value = name;
		els.motiveClear?.classList.toggle('hidden', name.trim().length === 0);
		this.hideMotiveResults();
		this.setFormError(null);
	}

	private clearSelectedHoliday(options: { clearFields?: boolean } = {}) {
		const els = this.els();
		if (!els) return;
		this.selectedHolidayId = 0;
		if (els.inputHolidayId) els.inputHolidayId.value = '';
		els.motiveClear?.classList.add('hidden');
		if (options.clearFields && els.inputName) els.inputName.value = '';
		this.setFormError(null);
	}

	private onMotiveInput() {
		const els = this.els();
		const typed = (els?.inputName?.value || '').trim();
		if (this.selectedHolidayId > 0) {
			const selected = this.motives.holidays.find((h) => h.id_holiday === this.selectedHolidayId);
			if (!selected || typed !== selected.name) {
				this.clearSelectedHoliday();
			}
		}
		els?.motiveClear?.classList.toggle('hidden', typed.length === 0);
		this.renderMotiveResults();
	}

	private renderMotiveResults() {
		const els = this.els();
		if (!els?.motiveResults) return;
		const query = this.stripHolidayPrefix((els.inputName?.value || '').trim()).toLowerCase();
		const holidays = this.motives.holidays.filter((holiday) => {
			if (!query) return true;
			return `${holiday.name} ${this.formatHolidayDate(holiday.holiday_date)}`.toLowerCase().includes(query);
		});
		const customs = this.motives.custom_names.filter((name) => {
			if (!query) return true;
			return name.toLowerCase().includes(query);
		});

		els.motiveResults.replaceChildren();

		if (holidays.length === 0 && customs.length === 0) {
			this.hideMotiveResults();
			return;
		}

		for (const holiday of holidays.slice(0, 8)) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `closure-motive-lov__option${holiday.already_closed ? ' is-disabled' : ''}`;
			const name = document.createElement('span');
			name.className = 'closure-motive-lov__option-name';
			name.textContent = holiday.name;
			const meta = document.createElement('span');
			meta.className = 'closure-motive-lov__option-meta';
			meta.textContent = holiday.already_closed
				? `${this.formatHolidayDate(holiday.holiday_date)} · Ya registrado`
				: this.formatHolidayDate(holiday.holiday_date);
			button.append(name, meta);
			button.addEventListener('mousedown', (event) => event.preventDefault());
			button.addEventListener('click', () => this.setSelectedHoliday(holiday));
			els.motiveResults.appendChild(button);
		}

		for (const name of customs.slice(0, 6)) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'closure-motive-lov__option';
			const label = document.createElement('span');
			label.className = 'closure-motive-lov__option-name';
			label.textContent = name;
			const meta = document.createElement('span');
			meta.className = 'closure-motive-lov__option-meta';
			meta.textContent = 'Motivo personalizado';
			button.append(label, meta);
			button.addEventListener('mousedown', (event) => event.preventDefault());
			button.addEventListener('click', () => this.setCustomMotive(name));
			els.motiveResults.appendChild(button);
		}

		this.showMotiveResults();
	}

	private async ensureMotivesLoaded() {
		if (this.motivesLoaded) return;
		if (this.motivesLoadPromise) return this.motivesLoadPromise;

		this.motivesLoadPromise = (async () => {
			try {
				const body = await fetchJson<{
					data?: {
						holidays?: Array<{
							id_holiday: number;
							name: string;
							holiday_date: string;
							already_closed: boolean | number;
						}>;
						custom_names?: string[];
					};
				}>('/api/closures/motives');
				const holidays = Array.isArray(body.data?.holidays) ? body.data.holidays : [];
				this.motives = {
					holidays: holidays
						.map((item) => ({
							id_holiday: Number(item.id_holiday),
							name: String(item.name || '').trim(),
							holiday_date: String(item.holiday_date || '').trim(),
							already_closed: Boolean(item.already_closed) && item.already_closed !== 0,
						}))
						.filter((item) => item.id_holiday > 0 && item.name && item.holiday_date),
					custom_names: Array.isArray(body.data?.custom_names)
						? body.data.custom_names.map((name) => String(name || '').trim()).filter(Boolean)
						: [],
				};
				this.motivesLoaded = true;
			} catch {
				this.motives = { holidays: [], custom_names: [] };
			}
		})().finally(() => {
			this.motivesLoadPromise = null;
		});
		return this.motivesLoadPromise;
	}

	private ensureLocationsControl() {
		const els = this.els();
		if (!els?.locationsSelect || this.locationsTom) return;
		this.locationsTom = new TomSelect(els.locationsSelect, {
			plugins: { remove_button: { title: 'Quitar' } },
			placeholder: 'Busca o selecciona sucursales...',
			create: false,
			persist: false,
			maxOptions: 200,
			closeAfterSelect: false,
			hideSelected: true,
			render: TOM_SELECT_ES_RENDER,
		});
	}

	private async ensureLocationsLoaded() {
		this.ensureLocationsControl();
		if (this.locationsLoaded) return;
		if (this.locationsLoadPromise) return this.locationsLoadPromise;

		this.locationsTom?.disable();
		this.locationsLoadPromise = (async () => {
			const body = await fetchJson<{
				data?: { locations?: LocationLovItem[] };
				locations?: LocationLovItem[];
			}>('/api/schedules/meta');
			const rows = Array.isArray(body.data?.locations)
				? body.data.locations
				: Array.isArray(body.locations)
					? body.locations
					: [];
			this.locationsTom?.clear(true);
			this.locationsTom?.clearOptions();
			rows.forEach((loc) => {
				const id = Number(loc.id_location);
				const name = String(loc.name || '').trim();
				if (!Number.isInteger(id) || id <= 0 || !name) return;
				this.locationsTom?.addOption({ value: String(id), text: name });
			});
			this.locationsTom?.refreshOptions(false);
			this.locationsLoaded = true;
		})().finally(() => {
			this.locationsTom?.enable();
			this.locationsLoadPromise = null;
		});
		return this.locationsLoadPromise;
	}

	private setSelectedLocations(ids: number[]) {
		if (!this.locationsTom) return;
		this.locationsTom.setValue(ids.map(String) as string[], true);
	}

	private getSelectedLocationIds(): number[] {
		if (!this.locationsTom) return [];
		const val = this.locationsTom.getValue();
		const arr = Array.isArray(val) ? val : String(val || '').split(',');
		return arr.map(Number).filter((n) => Number.isInteger(n) && n > 0);
	}

	private setFormError(msg: string | null) {
		const formError = this.els()?.formError;
		if (!formError) return;
		if (msg) {
			formError.textContent = msg;
			formError.removeAttribute('hidden');
		} else {
			formError.textContent = '';
			formError.setAttribute('hidden', '');
		}
	}

	private async resetForm(mode: 'location' | 'org') {
		const els = this.els();
		if (!els) return;
		this.setFormError(null);
		els.formEl?.reset();
		if (els.inputFullDay) els.inputFullDay.checked = true;
		this.syncPartialVisibility();
		els.scopeWrap?.removeAttribute('hidden');

		await Promise.all([this.ensureLocationsLoaded(), this.ensureMotivesLoaded()]);
		this.locationsTom?.clear(true);
		this.clearSelectedHoliday({ clearFields: true });
		this.hideMotiveResults();

		if (mode === 'org') {
			if (els.applyAll) els.applyAll.checked = true;
			if (els.formTitle) els.formTitle.textContent = 'Nuevo cierre general';
		} else {
			if (els.applyAll) els.applyAll.checked = false;
			if (els.formTitle) els.formTitle.textContent = 'Añadir cierre';
			if (this.currentLocationId > 0) {
				this.setSelectedLocations([this.currentLocationId]);
			}
		}
		this.syncLocationsVisibility();

		const today = new Date().toISOString().slice(0, 10);
		if (els.inputStart) els.inputStart.value = today;
		if (els.inputEnd) els.inputEnd.value = today;
	}

	private openForm(mode: 'location' | 'org') {
		const formDialog = this.els()?.formDialog;
		if (!formDialog?.isConnected) return;
		this.orgMode = mode === 'org';
		void this.resetForm(mode).then(() => {
			if (!formDialog.open) formDialog.showModal();
		});
	}

	async openOrgFormPrefill(prefill: {
		name?: string;
		idHoliday?: number;
		startDate?: string;
		endDate?: string;
		fullDay?: boolean;
		applyAll?: boolean;
	}) {
		const formDialog = this.els()?.formDialog;
		if (!formDialog?.isConnected) return;
		this.orgMode = true;
		await this.resetForm('org');
		const els = this.els();
		if (!els) return;

		const name = this.stripHolidayPrefix(String(prefill.name || '').trim());
		const idHoliday = Number(prefill.idHoliday || 0);
		const holiday =
			(idHoliday > 0 ? this.motives.holidays.find((item) => item.id_holiday === idHoliday) : null) ||
			this.motives.holidays.find((item) => item.name.toLowerCase() === name.toLowerCase()) ||
			null;
		if (holiday) {
			this.setSelectedHoliday(holiday);
		} else if (name) {
			this.setCustomMotive(name);
		}

		if (prefill.startDate && els.inputStart) els.inputStart.value = prefill.startDate;
		if (prefill.endDate && els.inputEnd) els.inputEnd.value = prefill.endDate;
		if (els.inputFullDay) {
			els.inputFullDay.checked = prefill.fullDay !== false;
			this.syncPartialVisibility();
		}
		if (els.applyAll) els.applyAll.checked = prefill.applyAll !== false;
		this.syncLocationsVisibility();

		if (!formDialog.open) formDialog.showModal();
	}

	private closeForm() {
		const formDialog = this.els()?.formDialog;
		if (formDialog?.open) formDialog.close();
	}

	private openOrgDialog() {
		const orgDialog = this.els()?.orgDialog;
		if (!orgDialog?.isConnected) return;
		if (this.orgCloseTimer) {
			window.clearTimeout(this.orgCloseTimer);
			this.orgCloseTimer = null;
		}
		orgDialog.classList.remove('is-closing');
		if (!orgDialog.open) orgDialog.showModal();
		void this.reloadOrgClosures();
	}

	private closeOrgDialog() {
		destroyActiveBookmateTour();
		const orgDialog = this.els()?.orgDialog;
		if (!orgDialog?.open || !orgDialog.isConnected) return;
		orgDialog.classList.add('is-closing');
		this.orgCloseTimer = window.setTimeout(() => {
			const live = this.els()?.orgDialog;
			if (live?.isConnected) {
				live.close();
				live.classList.remove('is-closing');
			}
			this.orgCloseTimer = null;
		}, 160);
	}

	private async reloadLocationClosures() {
		const els = this.els();
		if (!this.currentLocationId || !els?.listEl) return;
		try {
			const body = await fetchJson<{ data: ClosureItem[] }>(
				`/api/locations/${this.currentLocationId}/closures`
			);
			const items = Array.isArray(body.data) ? body.data : [];
			const live = this.els();
			if (!live?.listEl) return;
			this.renderList(live.listEl, live.emptyEl, items, { canDeleteGroup: true });
		} catch (error) {
			showAppAlert({
				type: 'error',
				message: error instanceof Error ? error.message : 'No fue posible listar los cierres.',
			});
		}
	}

	private async reloadOrgClosures() {
		const els = this.els();
		if (!els?.orgListEl) return;
		try {
			const body = await fetchJson<{ data: ClosureItem[] }>(`/api/closures/org`);
			const items = Array.isArray(body.data) ? body.data : [];
			const live = this.els();
			if (!live?.orgListEl) return;
			this.renderList(live.orgListEl, live.orgEmptyEl, items, { canDeleteGroup: true });
		} catch (error) {
			showAppAlert({
				type: 'error',
				message: error instanceof Error ? error.message : 'No fue posible listar los cierres generales.',
			});
		}
	}

	private renderList(
		list: HTMLElement,
		empty: HTMLElement | null,
		items: ClosureItem[],
		opts: { canDeleteGroup: boolean }
	) {
		if (items.length === 0) {
			list.innerHTML = '';
			if (empty) list.appendChild(empty);
			empty?.removeAttribute('hidden');
			return;
		}
		list.innerHTML = items.map((it) => buildItemHTML(it, opts)).join('');
	}

	private async deleteClosure(id: number, locHint: number, deleteGroup: boolean) {
		const confirmed = await window.BookmateAlert?.confirm({
			type: 'error',
			title: deleteGroup ? 'Eliminar cierre general' : 'Eliminar cierre',
			message: deleteGroup
				? 'Esta acción eliminará el cierre en todas las sucursales del grupo. ¿Deseas continuar?'
				: 'Esta acción eliminará el cierre de forma permanente. ¿Deseas continuar?',
			confirmText: 'Eliminar',
			cancelText: 'Cancelar',
		});
		if (!confirmed) return;

		try {
			const locationForUrl = locHint > 0 ? locHint : this.currentLocationId;
			if (!locationForUrl) throw new Error('No se pudo resolver la sucursal del cierre.');
			const url = `/api/locations/${locationForUrl}/closures/${id}${deleteGroup ? '?delete_group=1' : ''}`;
			const body = await fetchJson<{ message?: string }>(url, { method: 'DELETE' });
			showAppAlert({ type: 'success', message: body.message || 'Cierre eliminado.' });
			this.motivesLoaded = false;
			await Promise.all([this.reloadLocationClosures(), this.reloadOrgClosures()]);
			this.notifyRefresh();
		} catch (error) {
			showAppAlert({
				type: 'error',
				message: error instanceof Error ? error.message : 'No fue posible eliminar el cierre.',
			});
		}
	}

	private async submitForm() {
		const els = this.els();
		if (!els) return;
		this.setFormError(null);
		const name = this.stripHolidayPrefix((els.inputName?.value || '').trim());
		const holidayId = Number(els.inputHolidayId?.value || this.selectedHolidayId || 0);
		const startDate = (els.inputStart?.value || '').trim();
		const endDate = (els.inputEnd?.value || '').trim();
		const isFullDay = els.inputFullDay?.checked ? 1 : 0;
		const applyAll = els.applyAll?.checked ? 1 : 0;
		const locationIds = applyAll === 1 ? [] : this.getSelectedLocationIds();

		if (!name) {
			this.setFormError('El nombre es obligatorio.');
			return;
		}
		if (!startDate || !endDate) {
			this.setFormError('Las fechas son obligatorias.');
			return;
		}
		if (endDate < startDate) {
			this.setFormError('La fecha fin no puede ser anterior a la fecha inicio.');
			return;
		}
		if (applyAll === 0 && locationIds.length === 0) {
			this.setFormError('Seleccioná al menos una sucursal.');
			return;
		}

		const payload: Record<string, unknown> = {
			name,
			start_date: startDate,
			end_date: endDate,
			is_full_day: isFullDay,
			apply_all_locations: applyAll,
		};
		if (holidayId > 0) payload.id_holiday = holidayId;
		if (applyAll === 0) payload.location_ids = locationIds;

		if (!isFullDay) {
			const startTime = (els.inputStartTime?.value || '').trim();
			const endTime = (els.inputEndTime?.value || '').trim();
			if (!startTime || !endTime) {
				this.setFormError('Indicá hora inicio y hora fin.');
				return;
			}
			if (endTime <= startTime) {
				this.setFormError('La hora fin debe ser mayor a la hora inicio.');
				return;
			}
			payload.start_time = startTime;
			payload.end_time = endTime;
		}

		try {
			const useOrgEndpoint = applyAll === 1 || locationIds.length > 0;
			const singleId =
				locationIds.length === 1 ? locationIds[0] : this.currentLocationId;
			const url = useOrgEndpoint
				? '/api/closures/org'
				: `/api/locations/${singleId}/closures`;
			if (!useOrgEndpoint && !singleId) {
				this.setFormError('No hay sucursal activa para crear el cierre.');
				return;
			}
			const body = await fetchJson<{ message?: string }>(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			showAppAlert({ type: 'success', message: body.message || 'Cierre creado.' });
			this.closeForm();
			this.motivesLoaded = false;
			await Promise.all([this.reloadLocationClosures(), this.reloadOrgClosures()]);
			this.notifyRefresh();
		} catch (error) {
			this.setFormError(error instanceof Error ? error.message : 'No fue posible guardar el cierre.');
		}
	}

	private notifyRefresh() {
		document.dispatchEvent(new CustomEvent('locations:closures-updated'));
	}
}

let activeClosuresUI: LocationClosuresUI | null = null;

const consumeClosureQuery = (ui: LocationClosuresUI) => {
	const params = new URLSearchParams(window.location.search);
	if (params.get('open_org_closure') !== '1') return;

	const name = String(params.get('name') || '').trim();
	const startDate = String(params.get('start') || '').trim();
	const endDate = String(params.get('end') || '').trim() || startDate;
	const idHoliday = Number(params.get('id_holiday') || 0);
	void ui.openOrgFormPrefill({
		name,
		idHoliday: idHoliday > 0 ? idHoliday : undefined,
		startDate,
		endDate,
		fullDay: params.get('full_day') !== '0',
		applyAll: params.get('apply_all') !== '0',
	});

	const cleaned = new URL(window.location.href);
	['open_org_closure', 'name', 'id_holiday', 'start', 'end', 'full_day', 'apply_all'].forEach((key) => {
		cleaned.searchParams.delete(key);
	});
	const next = `${cleaned.pathname}${cleaned.search}${cleaned.hash}`;
	window.history.replaceState({}, '', next);
};

export function initLocationClosuresUI() {
	const root = document.querySelector('location-manager') as HTMLElement | null;
	if (!root?.isConnected) return;

	const existing = (root as any).__closuresUi as LocationClosuresUI | undefined;
	if (existing && activeClosuresUI === existing && root.isConnected) {
		consumeClosureQuery(existing);
		return;
	}

	activeClosuresUI?.destroy();
	activeClosuresUI = new LocationClosuresUI(root);
	(root as any).__closuresUi = activeClosuresUI;
	consumeClosureQuery(activeClosuresUI);
}
