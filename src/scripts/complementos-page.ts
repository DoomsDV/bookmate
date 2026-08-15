import { showFlashMessage } from '../lib/flash';

type ComplementosStoreElement = HTMLElement & {
	__complementosBound?: boolean;
	__complementosReload?: () => void;
};

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
};

type AddonsCatalogPayload = {
	addons_billing_live?: boolean | number | string;
	items?: ModuleAddonItem[];
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

const ADDON_COPY: Record<string, string> = {
	ODONTOGRAM_3D: 'Ficha clínica interactiva 3D y evolución de tratamientos.',
};

const odontogramPreviewHtml = () => `
		<div class="complementos-card__preview complementos-card__preview--odontogram" aria-hidden="true"></div>
	`;

const previewForAddon = (code: string) => {
	if (String(code || '').toUpperCase().includes('ODONTO')) return odontogramPreviewHtml();
	return '';
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

const parseItems = (payload: unknown): ModuleAddonItem[] => {
	const root = (payload || {}) as { data?: AddonsCatalogPayload; items?: ModuleAddonItem[] };
	const data = root.data ?? (root as AddonsCatalogPayload);
	const raw = (
		Array.isArray(data?.items) ? data.items : Array.isArray(root.items) ? root.items : []
	) as Array<Record<string, unknown>>;
	return raw.map((item) => ({
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
		grant_type: item.grant_type != null ? String(item.grant_type).trim() || null : null,
		status: item.status != null ? String(item.status).trim() || null : null,
	}));
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
	const emptyEl = root.querySelector<HTMLElement>('[data-complementos-empty]');
	const gridEl = root.querySelector<HTMLElement>('[data-complementos-grid]');
	const bannerEl = root.querySelector<HTMLElement>('[data-complementos-banner]');
	const leadEl = root.querySelector<HTMLElement>('[data-complementos-lead]');

	let items: ModuleAddonItem[] = [];
	let billingLive = false;
	let busyCode: string | null = null;
	let loadRequestId = 0;

	const setError = (message: string) => {
		if (!errorEl) return;
		const msg = String(message || '').trim();
		errorEl.textContent = msg;
		errorEl.classList.toggle('hidden', !msg);
	};

	const setLoading = (loading: boolean) => {
		loadingEl?.classList.toggle('hidden', !loading);
	};

	const renderCard = (item: ModuleAddonItem) => {
		const active = item.is_active_for_org;
		const eligible = item.eligible;
		const muted = !eligible && !active;
		const price = formatGs(item.price_amount);
		const period = periodLabel(item.billing_period);
		const desc =
			ADDON_COPY[item.code.toUpperCase()] ||
			item.short_description ||
			'Módulo mensual para tu clínica.';
		const isBusy = busyCode === item.code;
		const activateLabel = billingLive ? 'Suscribirse' : 'Activar';
		const activatingLabel = billingLive ? 'Procesando…' : 'Activando…';

		let priceBlock = '';
		if (billingLive) {
			priceBlock = `
				<div class="complementos-card__price-row">
					<span class="complementos-card__price">${escapeHtml(price)}</span>
					<span class="complementos-card__period">${escapeHtml(period.trim() || '/ mes')}</span>
				</div>
			`;
		} else {
			priceBlock = `
				<div class="complementos-card__price-row">
					<span class="complementos-card__price is-struck">${escapeHtml(price)}</span>
					<span class="complementos-card__free">Gratis</span>
					<span class="complementos-card__period">Beta · 0 Gs / mes</span>
				</div>
			`;
		}

		let actions = '';
		if (active) {
			actions = `
				<div class="flex flex-wrap items-center gap-2">
					<span class="complementos-card__badge">
						<span class="material-symbols-rounded text-[0.95rem]" aria-hidden="true">check_circle</span>
						${billingLive ? 'Activo' : 'Activo · sin cargo'}
					</span>
				</div>
				<button
					type="button"
					class="complementos-btn complementos-btn--soft"
					data-addon-cancel
					data-addon-code="${escapeHtml(item.code)}"
					${isBusy ? 'disabled' : ''}
				>
					${isBusy ? 'Desactivando…' : 'Desactivar'}
				</button>
			`;
		} else if (eligible) {
			actions = `
				<button
					type="button"
					class="complementos-btn complementos-btn--primary"
					data-addon-activate
					data-addon-code="${escapeHtml(item.code)}"
					${isBusy ? 'disabled' : ''}
				>
					${isBusy ? activatingLabel : activateLabel}
				</button>
			`;
		} else {
			actions = `
				<p class="complementos-card__hint flex items-center gap-1.5">
					<span class="material-symbols-rounded text-[1.05rem]" aria-hidden="true">lock</span>
					Disponible para clínicas odontológicas.
				</p>
			`;
		}

		return `
			<article class="complementos-card${muted ? ' is-muted' : ''}" data-addon-card data-addon-code="${escapeHtml(item.code)}">
				${previewForAddon(item.code)}
				<div class="complementos-card__body">
					<div>
						<h2 class="complementos-card__title">${escapeHtml(item.name)}</h2>
						<p class="complementos-card__desc">${escapeHtml(desc)}</p>
					</div>
					${priceBlock}
					${actions}
				</div>
			</article>
		`;
	};

	const renderMeta = () => {
		bannerEl?.classList.toggle('is-hidden', billingLive);
		if (leadEl) {
			leadEl.textContent = billingLive
				? 'Módulos mensuales extras para tu clínica. Se facturan junto con tu suscripción.'
				: 'Módulos extras para tu clínica. Activálos cuando los necesites.';
		}
	};

	const render = () => {
		if (!gridEl || !emptyEl) return;
		renderMeta();
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

	const load = async () => {
		const requestId = ++loadRequestId;
		setError('');
		setLoading(true);
		emptyEl?.classList.add('hidden');
		gridEl?.classList.add('hidden');

		try {
			const res = await fetch('/api/addons', {
				headers: { Accept: 'application/json' },
			});

			if (requestId !== loadRequestId) return;

			if (res.status === 404) {
				items = [];
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
				items = [];
				setError(message);
				render();
				return;
			}

			const payload = await res.json();
			if (requestId !== loadRequestId) return;
			billingLive = parseBillingLive(payload);
			items = parseItems(payload).filter((item) => item.code);
			setError('');
			render();
		} catch {
			if (requestId !== loadRequestId) return;
			items = [];
			setError('No pudimos cargar los complementos. Revisá tu conexión e intentá de nuevo.');
			render();
		} finally {
			if (requestId === loadRequestId) setLoading(false);
		}
	};

	const postAddon = async (path: string, addonCode: string) => {
		const res = await fetch(path, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ addon_code: addonCode }),
		});
		if (!res.ok) {
			throw new Error(
				await readApiMessage(res, 'No se pudo completar la operación. Intentá de nuevo.')
			);
		}
		return res.json().catch(() => ({}));
	};

	const setBusy = (code: string | null) => {
		busyCode = code;
		render();
	};

	root.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		const activateBtn = target?.closest<HTMLButtonElement>('[data-addon-activate]');
		const cancelBtn = target?.closest<HTMLButtonElement>('[data-addon-cancel]');

		if (activateBtn) {
			const code = String(activateBtn.dataset.addonCode || '').trim();
			if (!code || busyCode) return;
			void (async () => {
				setBusy(code);
				try {
					await postAddon('/api/addons', code);
					invalidateSubscriptionCache();
					showFlashMessage({
						type: 'success',
						message: 'Complemento activado. Ya lo podés usar en el perfil del cliente.',
					});
					busyCode = null;
					await load();
				} catch (error) {
					busyCode = null;
					render();
					showFlashMessage({
						type: 'error',
						message:
							error instanceof Error
								? error.message
								: 'No se pudo activar el complemento.',
					});
				}
			})();
			return;
		}

		if (cancelBtn) {
			const code = String(cancelBtn.dataset.addonCode || '').trim();
			if (!code || busyCode) return;
			void (async () => {
				setBusy(code);
				try {
					await postAddon('/api/addons/cancel', code);
					invalidateSubscriptionCache();
					showFlashMessage({
						type: 'success',
						message: 'Complemento desactivado.',
					});
					busyCode = null;
					await load();
				} catch (error) {
					busyCode = null;
					render();
					showFlashMessage({
						type: 'error',
						message:
							error instanceof Error
								? error.message
								: 'No se pudo desactivar el complemento.',
					});
				}
			})();
		}
	});

	root.__complementosReload = () => {
		void load();
	};

	void load();
};
