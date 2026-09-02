import { showFlashMessage } from '../lib/flash';

const parsePositiveInt = (value: string) => {
	const id = Number(String(value || '').trim());
	return Number.isInteger(id) && id > 0 ? id : 0;
};

export const initOpsPage = () => {
	const root = document.querySelector<HTMLElement>('[data-ops-root]');
	if (!root || root.dataset.bound === 'true') return;
	root.dataset.bound = 'true';

	const disputeForm = root.querySelector<HTMLFormElement>('[data-ops-dispute-form]');
	const restoreForm = root.querySelector<HTMLFormElement>('[data-ops-restore-form]');
	const disputeStatus = root.querySelector<HTMLElement>('[data-ops-dispute-status]');
	const restoreStatus = root.querySelector<HTMLElement>('[data-ops-restore-status]');

	disputeForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const disputeId = parsePositiveInt(
			(form.elements.namedItem('dispute_id') as HTMLInputElement | null)?.value || ''
		);
		const resolution = String(
			(form.elements.namedItem('resolution_code') as HTMLSelectElement | null)?.value || ''
		)
			.trim()
			.toUpperCase();
		const notes = String(
			(form.elements.namedItem('notes') as HTMLTextAreaElement | null)?.value || ''
		).trim();

		if (!disputeId) {
			if (disputeStatus) disputeStatus.textContent = 'Ingresá un ID de disputa válido.';
			return;
		}

		const submit = form.querySelector<HTMLButtonElement>('[type="submit"]');
		if (submit) submit.disabled = true;
		if (disputeStatus) disputeStatus.textContent = 'Resolviendo…';

		try {
			const response = await fetch(`/api/ops/disputes/${disputeId}/resolve`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ resolution_code: resolution, notes: notes || undefined }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(String(data.message || 'No fue posible resolver la disputa.'));
			}
			if (disputeStatus) disputeStatus.textContent = '';
			showFlashMessage({
				type: 'success',
				message: String(data.message || 'Disputa resuelta.'),
				autoHideMs: 5000,
			});
			form.reset();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'No fue posible resolver la disputa.';
			if (disputeStatus) disputeStatus.textContent = message;
			showFlashMessage({ type: 'error', message, autoHideMs: 6000 });
		} finally {
			if (submit) submit.disabled = false;
		}
	});

	restoreForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const orgId = parsePositiveInt(
			(form.elements.namedItem('org_id') as HTMLInputElement | null)?.value || ''
		);
		const reason = String(
			(form.elements.namedItem('reason') as HTMLTextAreaElement | null)?.value || ''
		).trim();

		if (!orgId) {
			if (restoreStatus) restoreStatus.textContent = 'Ingresá un ID de organización válido.';
			return;
		}
		if (reason.length < 5) {
			if (restoreStatus) restoreStatus.textContent = 'Indica un motivo de al menos 5 caracteres.';
			return;
		}

		const submit = form.querySelector<HTMLButtonElement>('[type="submit"]');
		if (submit) submit.disabled = true;
		if (restoreStatus) restoreStatus.textContent = 'Restaurando…';

		try {
			const response = await fetch(`/api/ops/orgs/${orgId}/enforcement/restore`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(String(data.message || 'No fue posible restaurar las sanciones.'));
			}
			if (restoreStatus) restoreStatus.textContent = '';
			showFlashMessage({
				type: 'success',
				message: String(data.message || 'Sanciones restauradas.'),
				autoHideMs: 5000,
			});
			form.reset();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'No fue posible restaurar las sanciones.';
			if (restoreStatus) restoreStatus.textContent = message;
			showFlashMessage({ type: 'error', message, autoHideMs: 6000 });
		} finally {
			if (submit) submit.disabled = false;
		}
	});
};
