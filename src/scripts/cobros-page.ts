import type { CobroItem, CobrosDatePreset, CobrosStatusFilter } from '../lib/cobros';

type CobrosManagerElement = HTMLElement & {
	__cobrosBound?: boolean;
};

const formatMoney = (amount: number, currency = 'PYG') =>
	new Intl.NumberFormat('es-PY', {
		style: 'currency',
		currency,
		maximumFractionDigits: 0,
	}).format(Number(amount) || 0);

const formatDateTime = (iso?: string | null) => {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return new Intl.DateTimeFormat('es-PY', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(d);
};

const statusLabel = (item: CobroItem) => {
	if (item.ui_status === 'approved') return 'Aprobado';
	if (item.ui_status === 'pending') return 'Pendiente de revisión';
	if (item.ui_status === 'refund_pending') return 'Reembolso pendiente';
	if (item.ui_status === 'refund_awaiting_alias') return 'Esperando alias';
	if (item.ui_status === 'refund_sent') return 'Reembolso enviado';
	if (item.ui_status === 'refund_waived') return 'Reembolso renunciado';
	return String(item.ocr_status || item.payment_status || '—');
};

const statusChipClass = (item: CobroItem) => {
	if (item.ui_status === 'approved') return 'cobros-chip cobros-chip--approved';
	if (item.ui_status === 'pending') return 'cobros-chip cobros-chip--pending';
	if (item.ui_status === 'refund_pending' || item.ui_status === 'refund_awaiting_alias') {
		return 'cobros-chip cobros-chip--refund';
	}
	if (item.ui_status === 'refund_sent') return 'cobros-chip cobros-chip--sent';
	if (item.ui_status === 'refund_waived') return 'cobros-chip cobros-chip--other';
	return 'cobros-chip cobros-chip--other';
};

export const initCobrosPage = () => {
	const root = document.querySelector<CobrosManagerElement>('cobros-manager');
	if (!root || root.__cobrosBound) return;
	root.__cobrosBound = true;

	const errorEl = root.querySelector<HTMLElement>('[data-cobros-error]');
	const loadingEl = root.querySelector<HTMLElement>('[data-cobros-loading]');
	const emptyEl = root.querySelector<HTMLElement>('[data-cobros-empty]');
	const summaryEl = root.querySelector<HTMLElement>('[data-cobros-summary]');
	const tableBody = root.querySelector<HTMLElement>('[data-cobros-table-body]');
	const cardsEl = root.querySelector<HTMLElement>('[data-cobros-cards]');
	const datePresetEl = root.querySelector<HTMLSelectElement>('[data-cobros-date-preset]');
	const customDatesEl = root.querySelector<HTMLElement>('[data-cobros-custom-dates]');
	const dateFromEl = root.querySelector<HTMLInputElement>('[data-cobros-date-from]');
	const dateToEl = root.querySelector<HTMLInputElement>('[data-cobros-date-to]');
	const modal = root.querySelector<HTMLDialogElement>('[data-cobros-modal]');
	const featureSection = root.querySelector<HTMLElement>('[data-requires-feature="DEPOSIT_COLLECTION"]');
	const lockedSection = root.querySelector<HTMLElement>('[data-cobros-feature-locked]');

	let statusFilter: CobrosStatusFilter = 'pending';
	let datePreset: CobrosDatePreset = 'this_month';
	let items: CobroItem[] = [];
	let selected: CobroItem | null = null;
	let busy = false;

	const setError = (message: string) => {
		if (!errorEl) return;
		if (!message) {
			errorEl.classList.add('hidden');
			errorEl.textContent = '';
			return;
		}
		errorEl.textContent = message;
		errorEl.classList.remove('hidden');
	};

	const setLoading = (on: boolean) => {
		loadingEl?.classList.toggle('hidden', !on);
	};

	const applyFeatureGate = () => {
		const hasFeature =
			typeof window !== 'undefined' &&
			window.HaselSubscription?.hasFeature?.('DEPOSIT_COLLECTION');
		if (hasFeature === false) {
			featureSection?.classList.add('hidden');
			lockedSection?.classList.remove('hidden');
			return false;
		}
		lockedSection?.classList.add('hidden');
		featureSection?.classList.remove('hidden');
		return true;
	};

	const syncTabs = () => {
		root.querySelectorAll<HTMLButtonElement>('[data-cobros-tab]').forEach((btn) => {
			btn.classList.toggle('is-active', btn.dataset.cobrosTab === statusFilter);
		});
	};

	const syncCustomDates = () => {
		customDatesEl?.classList.toggle('hidden', datePreset !== 'custom');
	};

	const openModal = (item: CobroItem) => {
		selected = item;
		if (!modal) return;

		const setText = (sel: string, value: string) => {
			const el = modal.querySelector<HTMLElement>(sel);
			if (el) el.textContent = value;
		};

		const isRefund =
			item.ui_status === 'refund_pending' ||
			item.ui_status === 'refund_awaiting_alias' ||
			item.ui_status === 'refund_sent' ||
			item.ui_status === 'refund_waived';

		setText(
			'[data-cobros-modal-title]',
			isRefund ? 'Detalle de reembolso' : 'Validar comprobante'
		);
		setText('[data-cobros-modal-subtitle]', formatDateTime(item.start_time || item.created_at));
		setText('[data-cobros-modal-customer]', item.customer_name || '—');
		setText('[data-cobros-modal-service]', item.service_name || '—');
		setText(
			'[data-cobros-modal-amount]',
			formatMoney(
				item.refund_amount != null && isRefund ? item.refund_amount : item.amount,
				item.currency
			)
		);
		setText('[data-cobros-modal-reference]', item.payment_reference || '—');
		setText(
			'[data-cobros-modal-ocr]',
			[
				item.ocr_status || '—',
				item.ocr_reference ? `ref ${item.ocr_reference}` : '',
				item.ocr_amount != null ? formatMoney(item.ocr_amount) : '',
			]
				.filter(Boolean)
				.join(' · ')
		);
		setText('[data-cobros-modal-refund-alias]', item.refund_alias || '—');
		setText('[data-cobros-modal-refund-status]', statusLabel(item));

		const img = modal.querySelector<HTMLImageElement>('[data-cobros-modal-image]');
		const noImg = modal.querySelector<HTMLElement>('[data-cobros-modal-no-image]');
		if (img && noImg) {
			if (item.receipt_url) {
				img.src = item.receipt_url;
				img.classList.remove('hidden');
				noImg.classList.add('hidden');
			} else {
				img.removeAttribute('src');
				img.classList.add('hidden');
				noImg.classList.remove('hidden');
			}
		}

		const canReview = item.ui_status === 'pending';
		const canMarkSent = item.ui_status === 'refund_pending';
		const canWaive =
			item.ui_status === 'refund_pending' || item.ui_status === 'refund_awaiting_alias';
		modal.querySelector<HTMLElement>('[data-cobros-modal-actions]')?.classList.toggle('hidden', !canReview);
		modal.querySelector<HTMLElement>('[data-cobros-reject-wrap]')?.classList.toggle('hidden', !canReview);
		modal.querySelector<HTMLElement>('[data-cobros-refund-block]')?.classList.toggle('hidden', !isRefund);
		modal
			.querySelector<HTMLElement>('[data-cobros-mark-refund-sent]')
			?.classList.toggle('hidden', !canMarkSent);
		modal.querySelector<HTMLElement>('[data-cobros-waive-wrap]')?.classList.toggle('hidden', !canWaive);

		const claimNote = modal.querySelector<HTMLElement>('[data-cobros-claim-note]');
		if (claimNote) {
			if (item.refund_claim_open) {
				claimNote.textContent = 'Hay un reclamo OPEN por SLA / cliente (cuenta como strike).';
				claimNote.classList.remove('hidden');
			} else if (item.refund_sla_breached) {
				claimNote.textContent = 'SLA de 48h hábiles vencido — el cliente puede reclamar.';
				claimNote.classList.remove('hidden');
			} else {
				claimNote.textContent = '';
				claimNote.classList.add('hidden');
			}
		}
		const reasonInput = modal.querySelector<HTMLInputElement>('[data-cobros-reject-reason]');
		if (reasonInput) reasonInput.value = item.reject_reason || '';
		setText('[data-cobros-modal-status]', '');

		if (!modal.open) modal.showModal();
	};

	const closeModal = () => {
		selected = null;
		modal?.close();
	};

	const render = () => {
		if (!tableBody || !cardsEl) return;
		tableBody.replaceChildren();
		cardsEl.replaceChildren();

		if (summaryEl) {
			summaryEl.textContent = `${items.length} cobro${items.length === 1 ? '' : 's'}`;
		}

		const empty = items.length === 0;
		emptyEl?.classList.toggle('hidden', !empty);
		cardsEl.classList.toggle('hidden', empty);

		for (const item of items) {
			const tr = document.createElement('tr');
			tr.className = 'border-b border-(--shell-border)/70';
			tr.innerHTML = `
				<td class="px-4 py-3 whitespace-nowrap">${formatDateTime(item.start_time || item.created_at)}</td>
				<td class="px-4 py-3 font-semibold">${item.customer_name || '—'}</td>
				<td class="px-4 py-3">${item.service_name || '—'}</td>
				<td class="px-4 py-3 font-bold">${formatMoney(item.amount, item.currency)}</td>
				<td class="px-4 py-3"><span class="${statusChipClass(item)}">${statusLabel(item)}</span></td>
				<td class="px-4 py-3 text-right">
					<button type="button" class="text-sm font-bold text-(--primary)" data-cobros-open="${item.id_transaction}">
						Ver comprobante
					</button>
				</td>
			`;
			tableBody.appendChild(tr);

			const card = document.createElement('article');
			card.className =
				'grid gap-3 rounded-2xl border border-(--shell-border) bg-(--surface-bright) p-4 shadow-sm';
			card.innerHTML = `
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="m-0 text-base font-bold text-(--on-surface)">${item.customer_name || '—'}</p>
						<p class="m-0 mt-0.5 text-lg font-extrabold text-(--on-surface)">${formatMoney(item.amount, item.currency)}</p>
					</div>
					<span class="${statusChipClass(item)}">${statusLabel(item)}</span>
				</div>
				<div class="text-sm text-(--on-surface-variant)">
					<p class="m-0">${item.service_name || '—'}</p>
					<p class="m-0 mt-1">${formatDateTime(item.start_time || item.created_at)}</p>
					<p class="m-0 mt-1 font-mono text-xs">${item.payment_reference || ''}</p>
				</div>
				<button type="button" class="inline-flex h-12 w-full items-center justify-center rounded-full bg-(--primary) px-5 text-base font-semibold text-(--on-primary)" data-cobros-open="${item.id_transaction}">
					${
						item.ui_status === 'refund_pending' ||
						item.ui_status === 'refund_awaiting_alias' ||
						item.ui_status === 'refund_sent'
							? 'Ver reembolso'
							: 'Validar comprobante'
					}
				</button>
			`;
			cardsEl.appendChild(card);
		}
	};

	const load = async () => {
		if (!applyFeatureGate()) return;
		setError('');
		setLoading(true);
		try {
			const params = new URLSearchParams({
				status: statusFilter,
				date_preset: datePreset,
				page: '1',
				limit: '50',
			});
			if (datePreset === 'custom') {
				if (dateFromEl?.value) params.set('date_from', dateFromEl.value);
				if (dateToEl?.value) params.set('date_to', dateToEl.value);
			}

			const response = await fetch(`/api/cobros?${params.toString()}`, {
				headers: { Accept: 'application/json' },
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible cargar los cobros.'));
			}
			items = Array.isArray(payload.data) ? payload.data : [];
			render();
		} catch (error) {
			items = [];
			render();
			setError(error instanceof Error ? error.message : 'No fue posible cargar los cobros.');
		} finally {
			setLoading(false);
		}
	};

	const approve = async () => {
		if (!selected || busy) return;
		busy = true;
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (statusEl) statusEl.textContent = 'Aprobando…';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/approve`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: '{}',
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible aprobar.'));
			}
			closeModal();
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible aprobar.';
			}
		} finally {
			busy = false;
		}
	};

	const reject = async () => {
		if (!selected || busy) return;
		busy = true;
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		const reason =
			modal?.querySelector<HTMLInputElement>('[data-cobros-reject-reason]')?.value.trim() ||
			'';
		if (statusEl) statusEl.textContent = 'Rechazando…';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/reject`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason: reason || null }),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible rechazar.'));
			}
			closeModal();
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible rechazar.';
			}
		} finally {
			busy = false;
		}
	};

	const markRefundSent = async () => {
		if (!selected || busy) return;
		busy = true;
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (statusEl) statusEl.textContent = 'Marcando como enviado…';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/mark-refund-sent`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: '{}',
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible marcar el reembolso.'));
			}
			closeModal();
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible marcar el reembolso.';
			}
		} finally {
			busy = false;
		}
	};

	const waiveRefund = async () => {
		if (!selected || busy) return;
		const reasonInput = modal?.querySelector<HTMLInputElement>('[data-cobros-waive-reason]');
		const reason = String(reasonInput?.value || '').trim();
		if (reason.length < 5) {
			const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
			if (statusEl) statusEl.textContent = 'Indica un motivo de al menos 5 caracteres.';
			return;
		}
		busy = true;
		const statusEl = modal?.querySelector<HTMLElement>('[data-cobros-modal-status]');
		if (statusEl) statusEl.textContent = 'Guardando waiver…';
		try {
			const response = await fetch(`/api/cobros/${selected.id_transaction}/waive-refund`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason }),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || payload.status !== 'success') {
				throw new Error(String(payload.message || 'No fue posible renunciar al reembolso.'));
			}
			closeModal();
			await load();
			document.dispatchEvent(new CustomEvent('hasel:cobros-changed'));
		} catch (error) {
			if (statusEl) {
				statusEl.textContent =
					error instanceof Error ? error.message : 'No fue posible renunciar al reembolso.';
			}
		} finally {
			busy = false;
		}
	};

	root.querySelectorAll<HTMLButtonElement>('[data-cobros-tab]').forEach((btn) => {
		btn.addEventListener('click', () => {
			statusFilter = (btn.dataset.cobrosTab || 'all') as CobrosStatusFilter;
			syncTabs();
			void load();
		});
	});

	datePresetEl?.addEventListener('change', () => {
		datePreset = (datePresetEl.value || 'this_month') as CobrosDatePreset;
		syncCustomDates();
		if (datePreset !== 'custom') void load();
	});

	dateFromEl?.addEventListener('change', () => {
		if (datePreset === 'custom') void load();
	});
	dateToEl?.addEventListener('change', () => {
		if (datePreset === 'custom') void load();
	});

	root.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		const openBtn = target?.closest<HTMLElement>('[data-cobros-open]');
		if (openBtn) {
			const id = Number(openBtn.dataset.cobrosOpen || 0);
			const item = items.find((x) => x.id_transaction === id);
			if (item) openModal(item);
		}
	});

	modal?.querySelector('[data-cobros-modal-close]')?.addEventListener('click', closeModal);
	modal?.querySelector('[data-cobros-approve]')?.addEventListener('click', () => void approve());
	modal?.querySelector('[data-cobros-reject]')?.addEventListener('click', () => void reject());
	modal
		?.querySelector('[data-cobros-mark-refund-sent]')
		?.addEventListener('click', () => void markRefundSent());
	modal?.querySelector('[data-cobros-waive]')?.addEventListener('click', () => void waiveRefund());
	modal?.addEventListener('click', (event) => {
		if (event.target === modal) closeModal();
	});

	document.addEventListener('hasel:subscription', () => {
		void load();
	});

	// Default tab: pendientes (donde vive el negocio)
	statusFilter = 'pending';
	syncTabs();
	syncCustomDates();
	void load();
};

if (!customElements.get('cobros-manager')) {
	customElements.define('cobros-manager', class extends HTMLElement {});
}
