import type { CobroItem, CobrosStatusFilter } from './cobros';

/**
 * Qué cuenta el “1” del badge (menú / pending-count).
 *
 * ORDS `pr_pending_count` (sin cambiar la fórmula): citas distintas (app_id)
 * que caen en CUALQUIERA de estos tres conjuntos:
 *  1. Comprobante SIPAP por revisar: receipt_url, payment_status=PENDING,
 *     ocr_status en PENDING|MISMATCH|MANUAL_REVIEW|FAILED, y no es un
 *     rechazo de staff (reviewed_at + MISMATCH).
 *  2. Reembolso PENDING (appointment.refund_status = PENDING).
 *  3. Disputa activa (OPENED o PROOF_RECEIVED).
 *
 * No cuenta: esperando comprobante (sin receipt), aprobados, vencidos,
 * reembolso SENT/AWAITING_ALIAS/WAIVED, ni disputas ya cerradas.
 */
export const COBROS_BADGE_DISPUTE_STATUSES = new Set(['OPENED', 'PROOF_RECEIVED']);

const STATUS_FILTERS: CobrosStatusFilter[] = ['all', 'pending', 'approved', 'refunded', 'expired'];

export const isCobrosBadgePending = (
	item: Pick<CobroItem, 'ui_status' | 'refund_dispute_status'>
): boolean => {
	const ui = String(item.ui_status || '').trim();
	if (ui === 'pending' || ui === 'refund_pending' || ui === 'refund_dispute') return true;
	const dispute = String(item.refund_dispute_status || '').trim().toUpperCase();
	return COBROS_BADGE_DISPUTE_STATUSES.has(dispute);
};

export const resolveCobrosEntryStatus = (options: {
	statusFromUrl?: string | null;
	pendingCount: number | null;
}): CobrosStatusFilter => {
	const raw = String(options.statusFromUrl || '')
		.trim()
		.toLowerCase();
	if (STATUS_FILTERS.includes(raw as CobrosStatusFilter)) {
		return raw as CobrosStatusFilter;
	}
	if ((options.pendingCount ?? 0) > 0) return 'pending';
	return 'all';
};

const cobroSortTs = (item: CobroItem) => {
	const raw = String(item.start_time || item.created_at || '').trim();
	if (!raw) return 0;
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? parsed : 0;
};

export const sortCobroItems = (
	items: CobroItem[],
	sortBy: 'date' | 'price',
	sortDir: 'asc' | 'desc'
): CobroItem[] => {
	const dir = sortDir === 'asc' ? 1 : -1;
	return [...items].sort((a, b) => {
		if (sortBy === 'price') {
			const diff = (Number(a.amount) || 0) - (Number(b.amount) || 0);
			if (diff !== 0) return diff * dir;
		} else {
			const diff = cobroSortTs(a) - cobroSortTs(b);
			if (diff !== 0) return diff * dir;
		}
		return (b.id_transaction || 0) - (a.id_transaction || 0);
	});
};

export const mergeBadgePendingCobros = (
	reviewItems: CobroItem[],
	extraItems: CobroItem[]
): CobroItem[] => {
	const byId = new Map<number, CobroItem>();
	for (const item of reviewItems) {
		if (item.id_transaction > 0) byId.set(item.id_transaction, item);
	}
	for (const item of extraItems) {
		if (item.id_transaction <= 0 || byId.has(item.id_transaction)) continue;
		if (isCobrosBadgePending(item)) byId.set(item.id_transaction, item);
	}
	return [...byId.values()];
};

export const paginateCobroItems = (items: CobroItem[], page: number, limit: number) => {
	const safePage = Math.max(1, Math.floor(page) || 1);
	const safeLimit = Math.max(1, Math.floor(limit) || 9);
	const start = (safePage - 1) * safeLimit;
	return {
		items: items.slice(start, start + safeLimit),
		total: items.length,
		page: safePage,
		limit: safeLimit,
	};
};

export const EMPTY_PENDING_TITLE = 'No hay cobros pendientes';
export const EMPTY_PENDING_COPY =
	'Cuando haya una seña para revisar, un reembolso por enviar o una disputa abierta, aparece acá. Ese es el número del menú.';
export const EMPTY_DEFAULT_TITLE = 'No hay cobros';
export const EMPTY_DEFAULT_COPY =
	'Cuando un cliente pague la seña por SIPAP y suba el comprobante, el cobro aparece acá para validarlo. Configurá alias y política en Ajustes → Pagos.';
