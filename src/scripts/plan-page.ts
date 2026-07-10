interface FlashApi {
	show: (opts: { message: string; type?: 'success' | 'error' | 'info' | 'warning'; autoHideMs?: number }) => void;
}

const getFlash = (): FlashApi | null => (window as unknown as { BookmateFlash?: FlashApi }).BookmateFlash ?? null;

const flash = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
	const api = getFlash();
	if (api) api.show({ message, type, autoHideMs: 5000 });
};

type PendingTarget =
	| { kind: 'PLAN'; code: string; name: string }
	| { kind: 'STORAGE_ADDON'; code: string; name: string };

const currency = new Intl.NumberFormat('es-PY');
const formatGs = (amount: number) => `${currency.format(Math.max(0, Math.round(amount)))} Gs`;

export function initPlanPage() {
	const root = document.querySelector<HTMLElement>('.plan-canvas');
	if (!root || root.dataset.planBound === '1') return;
	root.dataset.planBound = '1';

	const modal = document.querySelector<HTMLElement>('[data-pay-modal]');
	const modalSummary = document.querySelector<HTMLElement>('[data-pay-summary]');
	const modalLoading = document.querySelector<HTMLElement>('[data-pay-loading]');
	let pending: PendingTarget | null = null;

	const openModal = (target: PendingTarget, summary: string) => {
		pending = target;
		if (modalSummary) modalSummary.textContent = summary;
		modalLoading?.classList.add('hidden');
		modal?.classList.remove('hidden');
	};
	const closeModal = () => {
		pending = null;
		modal?.classList.add('hidden');
	};

	// --- Selección de plan ---
	document.querySelectorAll<HTMLButtonElement>('[data-plan-select]').forEach((btn) => {
		btn.addEventListener('click', async () => {
			const code = btn.dataset.planCode || '';
			const name = btn.dataset.planName || code;
			const price = Number(btn.dataset.planPrice || '0');
			const exempt = btn.dataset.billingExempt === '1';

			if (exempt) {
				// Founders / exentos: cambio inmediato sin pago.
				await changePlan(code, name, btn);
				return;
			}
			openModal(
				{ kind: 'PLAN', code, name },
				`Plan ${name} · ${formatGs(price)} / mes`
			);
		});
	});

	// --- Selección de add-on de storage ---
	document.querySelectorAll<HTMLButtonElement>('[data-addon-select]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const code = btn.dataset.addonCode || '';
			const name = btn.dataset.addonName || code;
			openModal({ kind: 'STORAGE_ADDON', code, name }, name);
		});
	});

	// --- Modal: forma de pago ---
	document.querySelectorAll<HTMLButtonElement>('[data-forma-pago]').forEach((btn) => {
		btn.addEventListener('click', async () => {
			if (!pending) return;
			const formaPago = Number(btn.dataset.formaPago || '9');
			modalLoading?.classList.remove('hidden');
			try {
				const body =
					pending.kind === 'PLAN'
						? { target_type: 'PLAN', plan_code: pending.code, forma_pago: formaPago }
						: { target_type: 'STORAGE_ADDON', addon_code: pending.code, forma_pago: formaPago };

				const res = await fetch('/api/subscription/checkout', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				const data = await res.json().catch(() => ({}));
				if (!res.ok || data?.status !== 'success' || !data?.data?.checkout_url) {
					throw new Error(data?.message || 'No fue posible iniciar el pago.');
				}
				// Redirige a Pagopar; al volver, la URL trae ?checkout=<hash>.
				window.location.href = data.data.checkout_url as string;
			} catch (error) {
				modalLoading?.classList.add('hidden');
				closeModal();
				flash(error instanceof Error ? error.message : 'No fue posible iniciar el pago.', 'error');
			}
		});
	});

	document.querySelector<HTMLButtonElement>('[data-pay-cancel]')?.addEventListener('click', closeModal);
	modal?.addEventListener('click', (event) => {
		if (event.target === modal) closeModal();
	});

	// --- Cambio de plan sin pago (founders/exentos) ---
	async function changePlan(code: string, name: string, btn: HTMLButtonElement) {
		const original = btn.textContent;
		btn.disabled = true;
		btn.textContent = 'Aplicando…';
		try {
			const res = await fetch('/api/subscription/change-plan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ plan_code: code }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.status !== 'success') {
				throw new Error(data?.message || 'No fue posible cambiar el plan.');
			}
			flash(`Tu plan cambió a ${name}.`, 'success');
			setTimeout(() => window.location.reload(), 900);
		} catch (error) {
			btn.disabled = false;
			btn.textContent = original;
			flash(error instanceof Error ? error.message : 'No fue posible cambiar el plan.', 'error');
		}
	}

	// --- Retorno desde Pagopar: ?checkout=<hash> ---
	void handleCheckoutReturn();
}

async function handleCheckoutReturn() {
	const params = new URLSearchParams(window.location.search);
	const hash = params.get('checkout');
	if (!hash) return;

	// Limpia la query para evitar re-procesar al refrescar.
	const cleanUrl = window.location.pathname;
	window.history.replaceState({}, '', cleanUrl);

	flash('Confirmando tu pago…', 'info');

	for (let attempt = 0; attempt < 6; attempt++) {
		try {
			const res = await fetch(`/api/subscription/invoice/${encodeURIComponent(hash)}`);
			const data = await res.json().catch(() => ({}));
			const status = data?.data?.status;
			if (res.ok && data?.status === 'success' && status === 'PAID') {
				flash('¡Pago confirmado! Tu plan quedó activo.', 'success');
				setTimeout(() => window.location.reload(), 1200);
				return;
			}
			if (status === 'FAILED') {
				flash('El pago no se completó. Podés intentarlo nuevamente.', 'error');
				return;
			}
		} catch {
			/* reintenta */
		}
		await new Promise((r) => setTimeout(r, 2500));
	}

	flash('Tu pago está siendo procesado. Se reflejará en unos minutos.', 'info');
}
