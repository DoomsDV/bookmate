import { createIdempotencyKey } from '../lib/idempotency';
import { showFlashMessage } from '../lib/flash';

type ComplementosStoreElement = HTMLElement & {
	__complementosBound?: boolean;
	__complementosReload?: () => void;
};

type AddonCancelRefundType = 'nce' | 'credit' | 'none';

type ModuleAddonItem = {
	code: string;
	name: string;
	short_description: string;
	feature_code: string;
	price_amount: number;
	currency: string;
	billing_period: string;
	audience_code: string | null;
	eligible: boolean;
	is_active_for_org: boolean;
	grant_type: string | null;
	status: string | null;
	prorate_amount: number | null;
	days_remaining: number | null;
	cancel_credit_amount: number;
	cancel_refund_type: AddonCancelRefundType;
};

type ComplementosTab = 'explore' | 'mine';

type AddonsCatalogPayload = {
	addons_billing_live?: boolean | number | string;
	items?: ModuleAddonItem[];
	active_items?: ModuleAddonItem[];
	available_items?: ModuleAddonItem[];
};

const currency = new Intl.NumberFormat('es-PY');
const formatGs = (amount: number) => `${currency.format(Math.max(0, Math.round(amount)))} Gs`;

const periodLabel = (period: string) => {
	const p = String(period || '').toUpperCase();
	if (p === 'MONTHLY' || p === 'MONTH') return '/ mes';
	if (p === 'YEARLY' || p === 'YEAR') return '/ año';
	return period ? ` / ${period.toLowerCase()}` : '';
};

const toBool = (value: unknown): boolean => value === true || value === 1 || value === '1';

const toNullableAmount = (value: unknown): number | null => {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const toRefundType = (value: unknown, grantType: string | null): AddonCancelRefundType => {
	const raw = String(value || '')
		.trim()
		.toLowerCase();
	if (raw === 'nce' || raw === 'credit' || raw === 'none') return raw;
	return grantType === 'PREVIEW' ? 'none' : 'credit';
};

const ADDON_COPY: Record<string, string> = {
	ODONTOGRAM_3D: 'Ficha clínica interactiva 3D y evolución de tratamientos.',
	BODY_MAP: 'Mapa corporal, zoom de articulación y evolución por sesión.',
};

const ODONTOGRAM_PREVIEW_SRC =
	'https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/gr7djv0kcgrr/b/bucket-hasel-aoxdev/o/odontograma%2Fodontograma-full.png';

const addonInitials = (name: string) => {
	const parts = String(name || '')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!parts.length) return 'CM';
	const first = parts[0]?.[0] || '';
	const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : parts[0]?.[1] || '';
	return `${first}${last}`.toUpperCase();
};

const isOdontogramAddon = (item: ModuleAddonItem) =>
	String(item.code || '').toUpperCase().includes('ODONTO');

const previewForAddon = (item: ModuleAddonItem) => {
	if (isOdontogramAddon(item)) {
		return `
			<div class="complementos-card__hero complementos-card__hero--odontogram" aria-hidden="true">
				<img class="complementos-card__hero-img" src="${ODONTOGRAM_PREVIEW_SRC}" alt="" />
			</div>
		`;
	}

	return `
		<div class="complementos-card__hero complementos-card__hero--initials" aria-hidden="true">
			<span class="complementos-card__hero-mark">${escapeHtml(addonInitials(item.name))}</span>
		</div>
	`;
};

const parseBillingLive = (payload: unknown): boolean => {
	const root = (payload || {}) as { data?: AddonsCatalogPayload };
	const data = root.data ?? (root as AddonsCatalogPayload);
	return toBool(data?.addons_billing_live);
};

const escapeHtml = (value: string) =>
	String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const readApiMessage = async (res: Response, fallback: string) => {
	try {
		const body = (await res.json()) as { message?: string };
		const msg = String(body?.message || '').trim();
		if (msg) return msg;
	} catch {
		/* ignore */
	}
	return fallback;
};

const invalidateSubscriptionCache = () => {
	try {
		const state = (window as Window & { __haselSubscriptionFetch?: { cachedData: unknown; cachedAt: number } })
			.__haselSubscriptionFetch;
		if (state) {
			state.cachedData = null;
			state.cachedAt = 0;
		}
	} catch {
		/* ignore */
	}
};

const parseItem = (item: Record<string, unknown>): ModuleAddonItem => {
	const grantType = item.grant_type != null ? String(item.grant_type).trim() || null : null;
	return {
		code: String(item.code || '').trim(),
		name: String(item.name || '').trim() || 'Complemento',
		short_description: String(item.short_description || '').trim(),
		feature_code: String(item.feature_code || '').trim(),
		price_amount: Number(item.price_amount) || 0,
		currency: String(item.currency || 'PYG').trim() || 'PYG',
		billing_period: String(item.billing_period || 'MONTHLY').trim() || 'MONTHLY',
		audience_code: item.audience_code != null ? String(item.audience_code).trim() || null : null,
		eligible: toBool(item.eligible),
		is_active_for_org: toBool(item.is_active_for_org),
		grant_type: grantType,
		status: item.status != null ? String(item.status).trim() || null : null,
		prorate_amount: toNullableAmount(item.prorate_amount),
		days_remaining: toNullableAmount(item.days_remaining),
		cancel_credit_amount: Number(item.cancel_credit_amount) || 0,
		cancel_refund_type: toRefundType(item.cancel_refund_type, grantType),
	};
};

const parseItemList = (value: unknown): ModuleAddonItem[] => {
	if (!Array.isArray(value)) return [];
	return (value as Array<Record<string, unknown>>)
		.map(parseItem)
		.filter((item) => item.code);
};

const parseCatalog = (payload: unknown) => {
	const root = (payload || {}) as { data?: AddonsCatalogPayload; items?: ModuleAddonItem[] };
	const data = root.data ?? (root as AddonsCatalogPayload);
	const items = parseItemList(data?.items ?? root.items);
	const hasSplit = Array.isArray(data?.active_items) || Array.isArray(data?.available_items);
	return {
		activeItems: hasSplit
			? parseItemList(data.active_items)
			: items.filter((item) => item.is_active_for_org),
		availableItems: hasSplit
			? parseItemList(data.available_items)
			: items.filter((item) => !item.is_active_for_org),
	};
};

const confirmDialog = async (opts: {
	type?: 'warning' | 'info';
	title: string;
	message: string;
	confirmText: string;
	cancelText?: string;
}): Promise<boolean> => {
	if (window.BookmateAlert?.confirm) {
		return window.BookmateAlert.confirm({
			type: opts.type || 'info',
			title: opts.title,
			message: opts.message,
			confirmText: opts.confirmText,
			cancelText: opts.cancelText || 'Volver',
		});
	}
	return window.confirm(opts.message);
};

const pollInvoice = async (hash: string): Promise<'paid' | 'failed' | 'pending'> => {
	for (let attempt = 0; attempt < 6; attempt++) {
		try {
			const res = await fetch(`/api/subscription/invoice/${encodeURIComponent(hash)}`);
			const data = await res.json().catch(() => ({}));
			const status = data?.data?.status;
			if (res.ok && data?.status === 'success' && status === 'PAID') return 'paid';
			if (status === 'FAILED') return 'failed';
		} catch {
			/* reintenta */
		}
		await new Promise((r) => setTimeout(r, 2500));
	}
	return 'pending';
};

if (!customElements.get('complementos-store')) {
	customElements.define('complementos-store', class extends HTMLElement {});
}

export const initComplementosPage = () => {
	const root = document.querySelector<ComplementosStoreElement>('complementos-store');
	if (!root) return;

	if (root.__complementosBound) {
		root.__complementosReload?.();
		return;
	}
	root.__complementosBound = true;

	const errorEl = root.querySelector<HTMLElement>('[data-complementos-error]');
	const loadingEl = root.querySelector<HTMLElement>('[data-complementos-loading]');
	const bannerEl = root.querySelector<HTMLElement>('[data-complementos-banner]');
	const leadEl = root.querySelector<HTMLElement>('[data-complementos-lead]');
	const badgeEl = root.querySelector<HTMLElement>('[data-complementos-mine-badge]');
	const tabButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-complementos-tab]'));
	const panels = {
		explore: root.querySelector<HTMLElement>('[data-complementos-panel="explore"]'),
		mine: root.querySelector<HTMLElement>('[data-complementos-panel="mine"]'),
	};
	const grids = {
		explore: root.querySelector<HTMLElement>('[data-complementos-grid="explore"]'),
		mine: root.querySelector<HTMLElement>('[data-complementos-grid="mine"]'),
	};
	const empties = {
		explore: root.querySelector<HTMLElement>('[data-complementos-empty="explore"]'),
		mine: root.querySelector<HTMLElement>('[data-complementos-empty="mine"]'),
	};

	let activeItems: ModuleAddonItem[] = [];
	let availableItems: ModuleAddonItem[] = [];
	let billingLive = false;
	let busyCode: string | null = null;
	let loadRequestId = 0;
	let activeTab: ComplementosTab = 'explore';
	const pendingActivateKeys = new Map<string, string>();

	const findItem = (code: string) =>
		activeItems.find((item) => item.code === code) ||
		availableItems.find((item) => item.code === code) ||
		null;

	const setError = (message: string) => {
		if (!errorEl) return;
		const msg = String(message || '').trim();
		errorEl.textContent = msg;
		errorEl.classList.toggle('hidden', !msg);
	};

	const setLoading = (loading: boolean) => {
		loadingEl?.classList.toggle('hidden', !loading);
		if (loading) {
			panels.explore?.classList.add('hidden');
			panels.mine?.classList.add('hidden');
		}
	};

	const renderCard = (item: ModuleAddonItem) => {
		const active = item.is_active_for_org;
		const eligible = item.eligible;
		const price = formatGs(item.price_amount);
		const period = periodLabel(item.billing_period);
		const desc =
			ADDON_COPY[item.code.toUpperCase()] ||
			item.short_description ||
			'Módulo mensual para tu negocio.';
		const isBusy = busyCode === item.code;
		const activateLabel = billingLive ? 'Suscribirse' : 'Activar';
		const activatingLabel = billingLive ? 'Procesando…' : 'Activando…';
		const showProrate =
			billingLive &&
			!active &&
			item.prorate_amount != null &&
			item.prorate_amount > 0 &&
			item.prorate_amount < item.price_amount;
		const days = Math.max(0, Math.round(item.days_remaining || 0));
		const showCancelHint =
			billingLive && active && item.cancel_refund_type !== 'none' && item.cancel_credit_amount > 0;

		const priceBlock = billingLive
			? `<div class="complementos-card__price">
					<span class="complementos-card__amount">${escapeHtml(price)}</span>
					<span class="complementos-card__period">${escapeHtml(period.trim() || '/ mes')}</span>
				</div>`
			: `<div class="complementos-card__price">
					<span class="complementos-card__amount is-struck">${escapeHtml(price)}</span>
					<span class="complementos-card__free">Gratis</span>
				</div>`;

		const prorateHint = showProrate
			? `<p class="complementos-card__hint">Hoy: ${escapeHtml(formatGs(item.prorate_amount || 0))} (proporcional${
					days > 0 ? ` · ${days} día${days === 1 ? '' : 's'}` : ''
				})</p>`
			: '';
		const cancelHint = showCancelHint
			? `<p class="complementos-card__hint">Al cancelar: ${
					item.cancel_refund_type === 'nce' ? 'nota de crédito estimada' : 'crédito estimado'
				} ${escapeHtml(formatGs(item.cancel_credit_amount))}</p>`
			: '';

		let action = '';
		if (active) {
			action = `
				<button
					type="button"
					class="complementos-card__cta complementos-card__cta--soft"
					data-addon-cancel
					data-addon-code="${escapeHtml(item.code)}"
					${isBusy ? 'disabled' : ''}
				>
					<span>${isBusy ? 'Desactivando…' : 'Desactivar'}</span>
					<span class="complementos-card__cta-glyph" aria-hidden="true">
						<span class="material-symbols-rounded">remove</span>
					</span>
				</button>
			`;
		} else if (eligible) {
			action = `
				<button
					type="button"
					class="complementos-card__cta complementos-card__cta--primary"
					data-addon-activate
					data-addon-code="${escapeHtml(item.code)}"
					${isBusy ? 'disabled' : ''}
				>
					<span>${isBusy ? activatingLabel : activateLabel}</span>
					<span class="complementos-card__cta-glyph" aria-hidden="true">
						<span class="material-symbols-rounded">arrow_forward</span>
					</span>
				</button>
			`;
		}

		const featuredClass = isOdontogramAddon(item) ? ' is-featured' : '';
		const activeClass = active ? ' is-active' : '';
		const eyebrow = billingLive ? 'Módulo mensual' : 'Beta · sin cargo';
		const status = active
			? `<span class="complementos-card__status">
					<span class="complementos-card__status-dot" aria-hidden="true"></span>
					${billingLive ? (item.grant_type === 'PREVIEW' ? 'Activo · vista previa' : 'Activo') : 'Activo · sin cargo'}
				</span>`
			: '';

		return `
			<article class="complementos-card${featuredClass}${activeClass}" data-addon-card data-addon-code="${escapeHtml(item.code)}">
				<div class="complementos-card__shell">
					<div class="complementos-card__core">
						${previewForAddon(item)}
						<div class="complementos-card__body">
							<p class="complementos-card__eyebrow">${eyebrow}</p>
							<h2 class="complementos-card__title">${escapeHtml(item.name)}</h2>
							<p class="complementos-card__desc">${escapeHtml(desc)}</p>
							<div class="complementos-card__meta">
								${priceBlock}
								${status}
							</div>
							${prorateHint}
							${cancelHint}
							${action}
						</div>
					</div>
				</div>
			</article>
		`;
	};

	const renderMeta = () => {
		bannerEl?.classList.toggle('is-hidden', billingLive);
		if (leadEl) {
			leadEl.textContent = billingLive
				? 'Módulos mensuales extras para tu negocio. Se facturan junto con tu suscripción.'
				: 'Módulos extras para tu negocio. Activálos cuando los necesites.';
		}
		if (badgeEl) {
			const count = activeItems.length;
			badgeEl.textContent = String(count);
			badgeEl.classList.toggle('hidden', count <= 0);
		}
	};

	const setActiveTab = (tab: ComplementosTab) => {
		activeTab = tab;
		for (const button of tabButtons) {
			const isActive = button.dataset.complementosTab === tab;
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-selected', isActive ? 'true' : 'false');
		}
		for (const key of ['explore', 'mine'] as const) {
			const panel = panels[key];
			if (!panel) continue;
			const show = key === tab;
			panel.classList.toggle('hidden', !show);
			panel.toggleAttribute('hidden', !show);
		}
	};

	const renderList = (tab: ComplementosTab, items: ModuleAddonItem[]) => {
		const gridEl = grids[tab];
		const emptyEl = empties[tab];
		if (!gridEl || !emptyEl) return;
		const hasError = Boolean(errorEl && !errorEl.classList.contains('hidden') && errorEl.textContent?.trim());
		if (!items.length) {
			gridEl.classList.add('hidden');
			gridEl.innerHTML = '';
			emptyEl.classList.toggle('hidden', hasError);
			return;
		}
		emptyEl.classList.add('hidden');
		gridEl.classList.remove('hidden');
		gridEl.innerHTML = items.map(renderCard).join('');
	};

	const render = () => {
		renderMeta();
		renderList('explore', availableItems);
		renderList('mine', activeItems);
		setActiveTab(activeTab);
	};

	const load = async () => {
		const requestId = ++loadRequestId;
		setError('');
		setLoading(true);
		empties.explore?.classList.add('hidden');
		empties.mine?.classList.add('hidden');
		grids.explore?.classList.add('hidden');
		grids.mine?.classList.add('hidden');

		try {
			const res = await fetch('/api/addons', {
				headers: { Accept: 'application/json' },
			});

			if (requestId !== loadRequestId) return;

			if (res.status === 404) {
				activeItems = [];
				availableItems = [];
				setError(
					'Los complementos todavía no están disponibles en este entorno. Probá de nuevo en unos minutos.'
				);
				render();
				return;
			}

			if (!res.ok) {
				const message = await readApiMessage(
					res,
					'No pudimos cargar los complementos. Intentá de nuevo.'
				);
				activeItems = [];
				availableItems = [];
				setError(message);
				render();
				return;
			}

			const payload = await res.json();
			if (requestId !== loadRequestId) return;
			billingLive = parseBillingLive(payload);
			const catalog = parseCatalog(payload);
			activeItems = catalog.activeItems;
			availableItems = catalog.availableItems;
			setError('');
			render();
		} catch {
			if (requestId !== loadRequestId) return;
			activeItems = [];
			availableItems = [];
			setError('No pudimos cargar los complementos. Revisá tu conexión e intentá de nuevo.');
			render();
		} finally {
			if (requestId === loadRequestId) setLoading(false);
		}
	};

	const postJson = async (path: string, body: Record<string, unknown>, headers: Record<string, string> = {}) => {
		const res = await fetch(path, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				...headers,
			},
			body: JSON.stringify(body),
		});
		const payload = await res.json().catch(() => ({}));
		if (!res.ok || payload?.status !== 'success') {
			throw new Error(
				String(payload?.message || '').trim() ||
					'No se pudo completar la operación. Intentá de nuevo.'
			);
		}
		return payload;
	};

	const setBusy = (code: string | null) => {
		busyCode = code;
		render();
	};

	const confirmActivate = async (item: ModuleAddonItem): Promise<boolean> => {
		if (!billingLive) return true;
		const prorate = item.prorate_amount;
		const chargeToday =
			prorate != null && prorate >= 0 ? prorate : item.price_amount;
		const message =
			chargeToday <= 0
				? `Sin cobro hoy. ${item.name} se suma al cargo de la próxima renovación (${formatGs(item.price_amount)} / mes).`
				: prorate != null && prorate > 0 && prorate < item.price_amount
					? `Hoy se cobra ${formatGs(prorate)} (proporcional). Después, ${formatGs(item.price_amount)} / mes con tu suscripción.`
					: `Se cobrará ${formatGs(item.price_amount)} / mes con tu tarjeta registrada.`;
		return confirmDialog({
			type: 'info',
			title: `Suscribirse a ${item.name}`,
			message,
			confirmText: chargeToday > 0 ? `Pagar ${formatGs(chargeToday)}` : 'Activar sin cobro',
			cancelText: 'Cancelar',
		});
	};

	const confirmCancel = async (item: ModuleAddonItem): Promise<boolean> => {
		const credit = item.cancel_credit_amount;
		const refundType = item.cancel_refund_type;
		const message =
			!billingLive || refundType === 'none' || item.grant_type === 'PREVIEW'
				? `Vas a desactivar ${item.name}. No se genera crédito ni nota de crédito.`
				: refundType === 'nce' && credit > 0
					? `Al cancelar ${item.name} se emitirá una nota de crédito por ${formatGs(credit)} (tiempo no usado). El módulo deja de estar disponible de inmediato.`
					: credit > 0
						? `Al cancelar ${item.name} se acreditarán ${formatGs(credit)} a favor por el tiempo no utilizado. El módulo deja de estar disponible de inmediato.`
						: `Vas a cancelar ${item.name}. El módulo deja de estar disponible de inmediato.`;
		return confirmDialog({
			type: 'warning',
			title: billingLive ? 'Cancelar complemento' : 'Desactivar complemento',
			message,
			confirmText: billingLive ? 'Cancelar módulo' : 'Desactivar',
			cancelText: 'Volver',
		});
	};

	const activateAddon = async (code: string) => {
		const item = findItem(code);
		if (!item) return;
		const confirmed = await confirmActivate(item);
		if (!confirmed) return;

		setBusy(code);
		const idemKey = pendingActivateKeys.get(code) || createIdempotencyKey();
		pendingActivateKeys.set(code, idemKey);

		let res: Response;
		try {
			res = await fetch('/api/addons', {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					'Idempotency-Key': idemKey,
				},
				body: JSON.stringify({ addon_code: code }),
			});
		} catch {
			setBusy(null);
			showFlashMessage({
				type: 'error',
				message:
					'No pudimos confirmar el cobro. Revisá tu conexión y tocá Suscribirse de nuevo para reintentar.',
			});
			return;
		}

		let payload: Record<string, unknown>;
		try {
			payload = await res.json().catch(() => ({}));
			// 201 = PENDING/Pagopar (éxito). El cobro se decide por requires_polling/hash, no por HTTP.
			const httpOk = res.status === 200 || res.status === 201 || res.ok;
			if (!httpOk || payload?.status !== 'success') {
				throw new Error(
					String(payload?.message || '').trim() || 'No se pudo activar el complemento.'
				);
			}
		} catch (error) {
			pendingActivateKeys.delete(code);
			setBusy(null);
			showFlashMessage({
				type: 'error',
				message: error instanceof Error ? error.message : 'No se pudo activar el complemento.',
			});
			return;
		}

		const data = (payload?.data || {}) as Record<string, unknown>;
		const hash = String(data.hash || '').trim();
		const paymentStatus = String(data.payment_status || data.status || '').toUpperCase();
		const needsPoll =
			(data.requires_polling !== 0 && data.requires_polling !== false && Boolean(hash)) ||
			(paymentStatus === 'PENDING' && Boolean(hash));

		if (needsPoll) {
			showFlashMessage({ type: 'info', message: 'Cobro iniciado. Confirmando el pago…' });
			const poll = await pollInvoice(hash);
			pendingActivateKeys.delete(code);
			if (poll === 'paid') {
				invalidateSubscriptionCache();
				showFlashMessage({
					type: 'success',
					message: 'Pago confirmado. El complemento ya está activo.',
				});
				busyCode = null;
				activeTab = 'mine';
				await load();
				return;
			}
			busyCode = null;
			render();
			showFlashMessage({
				type: poll === 'failed' ? 'error' : 'info',
				message:
					poll === 'failed'
						? 'El pago no se completó. Podés intentarlo nuevamente.'
						: 'Tu pago está siendo procesado. Se reflejará en unos minutos.',
			});
			return;
		}

		pendingActivateKeys.delete(code);
		invalidateSubscriptionCache();
		const paidWithoutCharge = String(data.status || data.payment_status || '').toUpperCase() === 'PAID';
		showFlashMessage({
			type: 'success',
			message: paidWithoutCharge
				? 'Complemento activado usando tu saldo a favor.'
				: billingLive
					? 'Listo. Se sumará al cargo de la próxima renovación.'
					: 'Complemento activado. Ya lo podés usar en el perfil del cliente.',
		});
		busyCode = null;
		activeTab = 'mine';
		await load();
	};

	const cancelAddon = async (code: string) => {
		const item = findItem(code);
		if (!item) return;
		const confirmed = await confirmCancel(item);
		if (!confirmed) return;

		setBusy(code);
		try {
			const payload = await postJson('/api/addons/cancel', { addon_code: code });
			const data = (payload?.data || {}) as Record<string, unknown>;
			const granted = Number(data.credit_granted || 0);
			const nceAmount = Number(data.nce_amount || 0);
			const nceQueued = Number(data.nce_queued || 0) === 1 || data.nce_queued === true;
			invalidateSubscriptionCache();
			showFlashMessage({
				type: 'success',
				message:
					nceQueued && nceAmount > 0
						? `Cancelado. Se emitirá nota de crédito por ${formatGs(nceAmount)}.`
						: granted > 0
							? `Cancelado. Se acreditaron ${formatGs(granted)} a favor.`
							: billingLive
								? 'Complemento cancelado.'
								: 'Complemento desactivado.',
			});
			busyCode = null;
			await load();
		} catch (error) {
			busyCode = null;
			render();
			showFlashMessage({
				type: 'error',
				message:
					error instanceof Error ? error.message : 'No se pudo desactivar el complemento.',
			});
		}
	};

	root.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		const tabBtn = target?.closest<HTMLButtonElement>('[data-complementos-tab]');
		if (tabBtn) {
			const next = tabBtn.dataset.complementosTab === 'mine' ? 'mine' : 'explore';
			setActiveTab(next);
			return;
		}

		const activateBtn = target?.closest<HTMLButtonElement>('[data-addon-activate]');
		const cancelBtn = target?.closest<HTMLButtonElement>('[data-addon-cancel]');

		if (activateBtn) {
			const code = String(activateBtn.dataset.addonCode || '').trim();
			if (!code || busyCode) return;
			void activateAddon(code);
			return;
		}

		if (cancelBtn) {
			const code = String(cancelBtn.dataset.addonCode || '').trim();
			if (!code || busyCode) return;
			void cancelAddon(code);
		}
	});

	root.__complementosReload = () => {
		void load();
	};

	void load();
};
