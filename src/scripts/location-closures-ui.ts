import { showFlashMessage } from '../lib/flash';

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

const $ = <T extends HTMLElement>(selector: string, root: ParentNode = document) =>
	root.querySelector(selector) as T | null;

const formatDateRange = (start: string, end: string) => {
	if (!start) return '';
	if (!end || start === end) return start;
	return `${start} → ${end}`;
};

const fmtWindow = (item: ClosureItem) =>
	item.is_full_day ? 'Día completo' : `${item.start_time ?? ''} – ${item.end_time ?? ''}`;

function buildItemHTML(item: ClosureItem, opts: { canDeleteGroup: boolean }) {
	const scopeBadge = item.closure_group_id
		? '<span class="location-closures-badge location-closures-badge--org"><span class="material-symbols-rounded text-[0.9rem]">public</span>Todas</span>'
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
			inputStart: $('[data-closure-start-date]', root) as HTMLInputElement | null,
			inputEnd: $('[data-closure-end-date]', root) as HTMLInputElement | null,
			inputFullDay: $('[data-closure-full-day]', root) as HTMLInputElement | null,
			partialRow: $('[data-closure-partial-row]', root),
			inputStartTime: $('[data-closure-start-time]', root) as HTMLInputElement | null,
			inputEndTime: $('[data-closure-end-time]', root) as HTMLInputElement | null,
			scopeWrap: $('[data-closure-scope-wrap]', root),
			scopeSingle: $('[data-closure-scope-single]', root) as HTMLInputElement | null,
			scopeAll: $('[data-closure-scope-all]', root) as HTMLInputElement | null,
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

	private resetForm(mode: 'location' | 'org') {
		const els = this.els();
		if (!els) return;
		this.setFormError(null);
		els.formEl?.reset();
		if (els.inputFullDay) els.inputFullDay.checked = true;
		this.syncPartialVisibility();
		if (mode === 'org') {
			if (els.scopeAll) els.scopeAll.checked = true;
			if (els.scopeSingle) els.scopeSingle.checked = false;
			els.scopeWrap?.setAttribute('hidden', '');
			if (els.formTitle) els.formTitle.textContent = 'Nuevo cierre general';
		} else {
			if (els.scopeSingle) els.scopeSingle.checked = true;
			if (els.scopeAll) els.scopeAll.checked = false;
			els.scopeWrap?.removeAttribute('hidden');
			if (els.formTitle) els.formTitle.textContent = 'Añadir cierre';
		}
		const today = new Date().toISOString().slice(0, 10);
		if (els.inputStart && !els.inputStart.value) els.inputStart.value = today;
		if (els.inputEnd && !els.inputEnd.value) els.inputEnd.value = today;
	}

	private openForm(mode: 'location' | 'org') {
		const formDialog = this.els()?.formDialog;
		if (!formDialog?.isConnected) return;
		this.orgMode = mode === 'org';
		this.resetForm(mode);
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
		const name = (els.inputName?.value || '').trim();
		const startDate = (els.inputStart?.value || '').trim();
		const endDate = (els.inputEnd?.value || '').trim();
		const isFullDay = els.inputFullDay?.checked ? 1 : 0;
		const applyAll = this.orgMode || (els.scopeAll?.checked ?? false) ? 1 : 0;

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

		const payload: Record<string, unknown> = {
			name,
			start_date: startDate,
			end_date: endDate,
			is_full_day: isFullDay,
			apply_all_locations: applyAll,
		};

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
			const url =
				applyAll === 1
					? '/api/closures/org'
					: `/api/locations/${this.currentLocationId}/closures`;
			if (applyAll !== 1 && !this.currentLocationId) {
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

export function initLocationClosuresUI() {
	const root = document.querySelector('location-manager') as HTMLElement | null;
	if (!root?.isConnected) return;

	const existing = (root as any).__closuresUi as LocationClosuresUI | undefined;
	if (existing && activeClosuresUI === existing && root.isConnected) return;

	activeClosuresUI?.destroy();
	activeClosuresUI = new LocationClosuresUI(root);
	(root as any).__closuresUi = activeClosuresUI;
}
