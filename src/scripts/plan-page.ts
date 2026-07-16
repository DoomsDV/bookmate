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

const CARD_STATUS_PREFIX = 'add_new_card';

export function initPlanPage() {
	const root = document.querySelector<HTMLElement>('.plan-canvas');
	if (!root) return;

	// Si esta página se cargó DENTRO del iframe de catastro (Pagopar redirige al
	// return_url tras agregar la tarjeta), avisamos al parent y cortamos.
	if (handleIframeCardReturn()) return;

	if (root.dataset.planBound === '1') return;
	root.dataset.planBound = '1';

	let hasCard = root.dataset.hasCard === '1';

	// ---- Pestañas Plan | Facturación ----
	const setTab = (tab: string) => {
		const key = tab === 'billing' ? 'billing' : 'plan';
		document.querySelectorAll<HTMLButtonElement>('[data-plan-tab]').forEach((btn) => {
			const active = btn.dataset.planTab === key;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-selected', active ? 'true' : 'false');
		});
		document.querySelectorAll<HTMLElement>('[data-plan-panel]').forEach((panel) => {
			const show = panel.dataset.planPanel === key;
			panel.classList.toggle('hidden', !show);
		});
		const url = new URL(window.location.href);
		if (key === 'plan') url.searchParams.delete('tab');
		else url.searchParams.set('tab', key);
		window.history.replaceState({}, '', url.toString());
	};
	document.querySelectorAll<HTMLButtonElement>('[data-plan-tab]').forEach((btn) => {
		btn.addEventListener('click', () => setTab(btn.dataset.planTab || 'plan'));
	});
	const initialTab = new URLSearchParams(window.location.search).get('tab');
	if (initialTab === 'billing') setTab('billing');

	// ---- Modal de confirmación de cobro ----
	const payModal = document.querySelector<HTMLElement>('[data-pay-modal]');
	const modalTitle = document.querySelector<HTMLElement>('[data-pay-title]');
	const modalReceipt = document.querySelector<HTMLElement>('[data-pay-receipt]');
	const modalTodayLabel = document.querySelector<HTMLElement>('[data-pay-today-label]');
	const modalTodayAmount = document.querySelector<HTMLElement>('[data-pay-today-amount]');
	const modalTodayNote = document.querySelector<HTMLElement>('[data-pay-today-note]');
	const modalFuture = document.querySelector<HTMLElement>('[data-pay-future]');
	const modalFutureNote = document.querySelector<HTMLElement>('[data-pay-future-note]');
	const modalSummary = document.querySelector<HTMLElement>('[data-pay-summary]');
	const modalDetail = document.querySelector<HTMLElement>('[data-pay-detail]');
	const modalLoading = document.querySelector<HTMLElement>('[data-pay-loading]');
	const hasCardBlock = document.querySelector<HTMLElement>('[data-pay-has-card]');
	const needCardBlock = document.querySelector<HTMLElement>('[data-pay-need-card]');
	const payCardLabel = document.querySelector<HTMLElement>('[data-pay-card-label]');
	const payCardHint = document.querySelector<HTMLElement>('[data-pay-card-hint]');
	const confirmPayBtn = document.querySelector<HTMLButtonElement>('[data-confirm-pay]');
	let pending: PendingTarget | null = null;

	type ConfirmReceipt = {
		title: string;
		todayAmount: number | null;
		todayLabel?: string;
		todayNote?: string;
		futureNote?: string;
		confirmLabel?: string;
	};

	const openConfirm = (target: PendingTarget, receipt: ConfirmReceipt) => {
		pending = target;
		if (modalTitle) modalTitle.textContent = receipt.title;

		const hasToday = receipt.todayAmount !== null && receipt.todayAmount !== undefined;
		modalReceipt?.classList.toggle('hidden', !hasToday);
		modalSummary?.classList.add('hidden');
		modalDetail?.classList.add('hidden');

		if (hasToday) {
			if (modalTodayLabel) {
				modalTodayLabel.textContent = receipt.todayLabel || 'A pagar hoy';
			}
			if (modalTodayAmount) {
				modalTodayAmount.textContent =
					receipt.todayAmount! > 0 ? formatGs(receipt.todayAmount!) : 'Sin cobro hoy';
			}
			const todayNote = (receipt.todayNote || '').trim();
			if (modalTodayNote) {
				modalTodayNote.textContent = todayNote;
				modalTodayNote.classList.toggle('hidden', !todayNote);
			}
			const futureNote = (receipt.futureNote || '').trim();
			if (modalFuture && modalFutureNote) {
				modalFutureNote.textContent = futureNote;
				modalFuture.classList.toggle('hidden', !futureNote);
			}
		}

		if (confirmPayBtn) {
			if (receipt.confirmLabel) {
				confirmPayBtn.textContent = receipt.confirmLabel;
			} else if (hasToday && receipt.todayAmount! > 0) {
				confirmPayBtn.textContent = `Pagar ${formatGs(receipt.todayAmount!)}`;
			} else if (hasToday && receipt.todayAmount === 0) {
				confirmPayBtn.textContent = 'Activar sin cobro';
			} else {
				confirmPayBtn.textContent = 'Pagar y activar';
			}
		}

		if (payCardLabel) {
			payCardLabel.textContent = root.dataset.defaultCardLabel || 'Tarjeta registrada';
		}
		if (payCardHint) {
			payCardHint.textContent =
				root.dataset.defaultCardHint || 'Se debitará automáticamente cada mes.';
		}
		modalLoading?.classList.add('hidden');
		hasCardBlock?.classList.toggle('hidden', !hasCard);
		needCardBlock?.classList.toggle('hidden', hasCard);
		payModal?.classList.remove('hidden');
	};
	const closeConfirm = () => {
		pending = null;
		payModal?.classList.add('hidden');
	};

	// ---- Modal del iframe uPay ----
	const cardModal = document.querySelector<HTMLElement>('[data-card-modal]');
	const cardIframe = document.querySelector<HTMLIFrameElement>('[data-card-iframe]');
	const cardLoading = document.querySelector<HTMLElement>('[data-card-loading]');
	const openCardModal = (url: string) => {
		if (cardIframe) {
			cardIframe.classList.add('hidden');
			cardLoading?.classList.remove('hidden');
			cardIframe.onload = () => {
				cardLoading?.classList.add('hidden');
				cardIframe.classList.remove('hidden');
			};
			cardIframe.src = url;
		}
		cardModal?.classList.remove('hidden');
	};
	const closeCardModal = () => {
		cardModal?.classList.add('hidden');
		if (cardIframe) cardIframe.src = 'about:blank';
	};

	// ---- Registrar tarjeta (catastro uPay) ----
	async function addCard() {
		flash('Preparando el formulario seguro…', 'info');
		try {
			const res = await fetch('/api/subscription/card/add', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.status !== 'success' || !data?.data?.iframe_url) {
				throw new Error(data?.message || 'No fue posible iniciar el registro de la tarjeta.');
			}
			openCardModal(data.data.iframe_url as string);
		} catch (error) {
			flash(error instanceof Error ? error.message : 'No fue posible registrar la tarjeta.', 'error');
		}
	}

	async function confirmCard() {
		flash('Verificando la tarjeta…', 'info');
		try {
			const res = await fetch('/api/subscription/card/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.status !== 'success') {
				throw new Error(data?.message || 'No fue posible confirmar la tarjeta.');
			}
			const cards = Array.isArray(data?.data?.cards) ? data.data.cards : [];
			hasCard = cards.length > 0;
			if (hasCard) {
				flash('Tarjeta registrada correctamente.', 'success');
				setTimeout(() => window.location.reload(), 900);
			} else {
				flash('No se pudo registrar la tarjeta. Intentá nuevamente.', 'error');
			}
		} catch (error) {
			flash(error instanceof Error ? error.message : 'No fue posible confirmar la tarjeta.', 'error');
		}
	}

	async function deleteCard(cardId: string, btn: HTMLButtonElement) {
		if (!cardId) return;
		const confirmMessage =
			'Vas a eliminar esta tarjeta. Si es la predeterminada, el cobro automático dejará de funcionar hasta que registres otra.';
		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'error',
					title: 'Eliminar tarjeta',
					message: confirmMessage,
					confirmText: 'Eliminar',
					cancelText: 'Cancelar',
				})
			: window.confirm(confirmMessage);
		if (!confirmed) return;

		btn.disabled = true;
		try {
			const res = await fetch(`/api/subscription/card/${encodeURIComponent(cardId)}`, { method: 'DELETE' });
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.status !== 'success') {
				throw new Error(data?.message || 'No fue posible eliminar la tarjeta.');
			}
			flash('Tarjeta eliminada.', 'success');
			setTimeout(() => window.location.reload(), 700);
		} catch (error) {
			btn.disabled = false;
			flash(error instanceof Error ? error.message : 'No fue posible eliminar la tarjeta.', 'error');
		}
	}

	// ---- Activar suscripción (cobro recurrente con la tarjeta default) ----
	async function activate(target: PendingTarget) {
		modalLoading?.classList.remove('hidden');
		try {
			const body =
				target.kind === 'PLAN'
					? { target_type: 'PLAN', plan_code: target.code }
					: { target_type: 'STORAGE_ADDON', addon_code: target.code };
			const res = await fetch('/api/subscription/activate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.status !== 'success') {
				throw new Error(data?.message || 'No fue posible procesar el cobro.');
			}
			closeConfirm();
			const hash = String(data?.data?.hash || '');
			const needsPoll = data?.data?.requires_polling !== 0 && Boolean(hash);
			if (needsPoll) {
				flash('Cobro iniciado. Confirmando el pago…', 'info');
				await pollInvoice(hash);
			} else {
				flash(
					typeof data?.message === 'string' && data.message.trim()
						? data.message
						: 'Listo. Se sumará al cargo de la próxima renovación.',
					'success'
				);
				setTimeout(() => window.location.reload(), 1200);
			}
		} catch (error) {
			modalLoading?.classList.add('hidden');
			closeConfirm();
			flash(error instanceof Error ? error.message : 'No fue posible procesar el cobro.', 'error');
		}
	}

	const formatDateEs = (iso: string) => {
		if (!iso) return 'el fin del periodo';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return 'el fin del periodo';
		return d.toLocaleDateString('es-PY', { day: 'numeric', month: 'long', year: 'numeric' });
	};

	// --- Selección de plan ---
	document.querySelectorAll<HTMLButtonElement>('[data-plan-select]').forEach((btn) => {
		btn.addEventListener('click', async () => {
			const code = btn.dataset.planCode || '';
			const name = btn.dataset.planName || code;
			const price = Number(btn.dataset.planPrice || '0');
			const monthlyTotal = Number(btn.dataset.planMonthlyTotal || String(price));
			const exempt = btn.dataset.billingExempt === '1';
			const action = btn.dataset.planAction || 'activate';
			const periodEnd = btn.dataset.periodEnd || '';

			if (exempt || action === 'immediate') {
				await changePlan(code, name, btn);
				return;
			}

			if (action === 'schedule') {
				const confirmed = window.BookmateAlert?.confirm
					? await window.BookmateAlert.confirm({
							type: 'info',
							title: `Pasar a ${name}`,
							message: `Seguirás con tu plan actual hasta el ${formatDateEs(periodEnd)}. Ese día pasás a ${name} y se cobra ${formatGs(price)} / mes. No se genera saldo a favor por el plan (disfrutás el mes ya pagado).`,
							confirmText: 'Programar cambio',
							cancelText: 'Cancelar',
						})
					: window.confirm(`Programar cambio a ${name} el ${formatDateEs(periodEnd)}?`);
				if (!confirmed) return;
				await changePlan(code, name, btn, true);
				return;
			}

			openConfirm(
				{ kind: 'PLAN', code, name },
				{
					title: `Plan ${name}`,
					todayAmount: price,
					todayLabel: 'A pagar hoy',
					todayNote: 'Cargo del primer mes con tu tarjeta predeterminada.',
					futureNote:
						monthlyTotal > price
							? `En cada renovación: un solo cargo de ${formatGs(monthlyTotal)} (plan + almacenamiento).`
							: `Luego se renueva automáticamente a ${formatGs(price)} / mes.`,
					confirmLabel: price > 0 ? `Pagar ${formatGs(price)}` : 'Activar',
				}
			);
		});
	});

	document.querySelectorAll<HTMLButtonElement>('[data-keep-plan]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const code = btn.dataset.planCode || '';
			const name = btn.dataset.planName || code;
			void changePlan(code, name, btn, false);
		});
	});

	// --- Selección de add-on de storage ---
	document.querySelectorAll<HTMLButtonElement>('[data-addon-select]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const code = btn.dataset.addonCode || '';
			const name = btn.dataset.addonName || code;
			const monthly = Number(btn.dataset.addonPrice || '0');
			const prorate = Number(btn.dataset.addonProrate || '0');
			const days = Number(btn.dataset.addonDays || '0');
			const isProrated = days > 0 && prorate > 0;
			const todayAmount = days <= 0 ? 0 : isProrated ? prorate : monthly;
			const dayLabel = days === 1 ? 'día restante' : 'días restantes';

			openConfirm(
				{ kind: 'STORAGE_ADDON', code, name },
				{
					title: name,
					todayAmount,
					todayLabel: 'A pagar hoy',
					todayNote:
						days <= 0
							? 'Entra en el cargo de la próxima renovación.'
							: isProrated && prorate < monthly
								? `Prorrateo por los ${days} ${dayLabel} de tu ciclo`
								: 'Cargo del mes completo hasta la renovación.',
					futureNote: `A partir de tu próxima renovación, se sumarán ${formatGs(monthly)} / mes a tu plan actual.`,
					confirmLabel:
						todayAmount > 0 ? `Pagar ${formatGs(todayAmount)}` : 'Activar sin cobro',
				}
			);
		});
	});

	document.querySelectorAll<HTMLButtonElement>('[data-addon-cancel]').forEach((btn) => {
		btn.addEventListener('click', () => void cancelAddon(btn));
	});

	// --- Método de pago ---
	document.querySelectorAll<HTMLButtonElement>('[data-add-card]').forEach((btn) => {
		btn.addEventListener('click', () => void addCard());
	});
	document.querySelectorAll<HTMLButtonElement>('[data-card-delete]').forEach((btn) => {
		btn.addEventListener('click', () => void deleteCard(btn.dataset.cardId || '', btn));
	});

	// --- Modal de confirmación ---
	document.querySelector<HTMLButtonElement>('[data-confirm-pay]')?.addEventListener('click', () => {
		if (pending) void activate(pending);
	});
	document.querySelector<HTMLButtonElement>('[data-add-card-cta]')?.addEventListener('click', () => {
		closeConfirm();
		void addCard();
	});
	document.querySelector<HTMLButtonElement>('[data-pay-cancel]')?.addEventListener('click', closeConfirm);
	payModal?.addEventListener('click', (event) => {
		if (event.target === payModal) closeConfirm();
	});

	// --- Modal del iframe ---
	document.querySelector<HTMLButtonElement>('[data-card-close]')?.addEventListener('click', closeCardModal);
	cardModal?.addEventListener('click', (event) => {
		if (event.target === cardModal) closeCardModal();
	});

	// --- Mensajes del iframe (retorno del catastro) ---
	window.addEventListener('message', (event: MessageEvent) => {
		const payload = event.data;
		if (!payload || typeof payload !== 'object' || payload.type !== 'hasel-card-status') return;
		closeCardModal();
		const status = String(payload.status || '');
		if (status === 'add_new_card_success') {
			void confirmCard();
		} else {
			// Igual llamamos confirm (Pagopar lo exige) para dejar el estado consistente.
			void confirmCard();
			flash('No se pudo registrar la tarjeta. Verificá los datos e intentá de nuevo.', 'error');
		}
	});

	async function changePlan(
		code: string,
		name: string,
		btn: HTMLButtonElement,
		scheduled = false
	) {
		const original = btn.textContent;
		btn.disabled = true;
		btn.textContent = scheduled ? 'Programando…' : 'Aplicando…';
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
			const msg =
				(typeof data?.message === 'string' && data.message.trim()) ||
				(data?.data?.scheduled
					? `Cambio a ${data?.data?.pending_plan_code || name} programado.`
					: `Tu plan cambió a ${name}.`);
			flash(msg, 'success');
			setTimeout(() => window.location.reload(), 900);
		} catch (error) {
			btn.disabled = false;
			btn.textContent = original;
			flash(error instanceof Error ? error.message : 'No fue posible cambiar el plan.', 'error');
		}
	}

	async function cancelAddon(btn: HTMLButtonElement) {
		const code = btn.dataset.addonCode || '';
		const name = btn.dataset.addonName || code;
		const credit = Number(btn.dataset.addonCredit || '0');
		const message =
			credit > 0
				? `Al cancelar ${name} se acreditarán ${formatGs(credit)} a favor por el tiempo no utilizado. El espacio deja de estar disponible de inmediato.`
				: `Vas a cancelar ${name}. El espacio deja de estar disponible de inmediato.`;
		const confirmed = window.BookmateAlert?.confirm
			? await window.BookmateAlert.confirm({
					type: 'warning',
					title: 'Cancelar almacenamiento',
					message,
					confirmText: 'Cancelar paquete',
					cancelText: 'Volver',
				})
			: window.confirm(message);
		if (!confirmed) return;

		const original = btn.textContent;
		btn.disabled = true;
		btn.textContent = 'Cancelando…';
		try {
			const res = await fetch('/api/subscription/addon/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ addon_code: code }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.status !== 'success') {
				throw new Error(data?.message || 'No fue posible cancelar el almacenamiento.');
			}
			const granted = Number(data?.data?.credit_granted || 0);
			flash(
				granted > 0
					? `Cancelado. Se acreditaron ${formatGs(granted)} a favor.`
					: 'Almacenamiento cancelado.',
				'success'
			);
			setTimeout(() => window.location.reload(), 900);
		} catch (error) {
			btn.disabled = false;
			btn.textContent = original;
			flash(error instanceof Error ? error.message : 'No fue posible cancelar.', 'error');
		}
	}

	// --- Retorno desde checkout legacy (?checkout=<hash>) ---
	void handleCheckoutReturn();
}

/**
 * Si la página se abrió dentro del iframe de catastro, Pagopar la redirige a
 * return_url?status=add_new_card_success|fail. Detectamos eso y avisamos al parent.
 * Devuelve true si estábamos dentro del iframe (para cortar el resto del init).
 */
function handleIframeCardReturn(): boolean {
	const params = new URLSearchParams(window.location.search);
	const status = params.get('status');
	if (!status || !status.startsWith(CARD_STATUS_PREFIX)) return false;

	if (window.top !== window.self) {
		try {
			window.parent.postMessage({ type: 'hasel-card-status', status }, window.location.origin);
		} catch {
			/* noop */
		}
		return true;
	}

	// Fallback: la redirección ocurrió a nivel top (no iframe).
	const cleanUrl = window.location.pathname;
	window.history.replaceState({}, '', cleanUrl);
	if (status === 'add_new_card_success') {
		flash('Verificando la tarjeta…', 'info');
		void fetch('/api/subscription/card/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		})
			.then((r) => r.json().catch(() => ({})))
			.then((data) => {
				if (data?.status === 'success' && Array.isArray(data?.data?.cards) && data.data.cards.length > 0) {
					flash('Tarjeta registrada correctamente.', 'success');
					setTimeout(() => window.location.reload(), 900);
				} else {
					flash('No se pudo registrar la tarjeta. Intentá nuevamente.', 'error');
				}
			})
			.catch(() => flash('No fue posible confirmar la tarjeta.', 'error'));
	} else {
		flash('No se pudo registrar la tarjeta. Intentá nuevamente.', 'error');
	}
	return false;
}

async function pollInvoice(hash: string) {
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

async function handleCheckoutReturn() {
	const params = new URLSearchParams(window.location.search);
	const hash = params.get('checkout');
	if (!hash) return;
	const cleanUrl = window.location.pathname;
	window.history.replaceState({}, '', cleanUrl);
	flash('Confirmando tu pago…', 'info');
	await pollInvoice(hash);
}
