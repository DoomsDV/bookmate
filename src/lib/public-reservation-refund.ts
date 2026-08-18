import { parseApiDateTime } from './booking-datetime';

export type PublicReservationNoRefundReason = 'WITHIN_24H' | 'POLICY_STRICT';

export interface PublicReservationRefundPreviewHint {
	amount: number;
	policy_code?: string | null;
	no_refund_reason?: PublicReservationNoRefundReason | null;
}

export const inferNoRefundReason = (
	preview: PublicReservationRefundPreviewHint,
	startTime?: string | null
): PublicReservationNoRefundReason | null => {
	const fromApi = String(preview.no_refund_reason || '').trim().toUpperCase();
	if (fromApi === 'WITHIN_24H' || fromApi === 'POLICY_STRICT') {
		return fromApi as PublicReservationNoRefundReason;
	}
	if ((preview.amount || 0) > 0) return null;

	const start = startTime ? parseApiDateTime(startTime) : null;
	if (start) {
		const hoursUntil = (start.getTime() - Date.now()) / 3_600_000;
		if (hoursUntil <= 24) return 'WITHIN_24H';
	}

	if (String(preview.policy_code || '').trim().toUpperCase() === 'STRICT') {
		return 'POLICY_STRICT';
	}

	return null;
};

/** Texto explicativo para cancelación sin reembolso (modal de gestionar reserva). */
export const formatCustomerCancelNoRefundHint = (
	preview: PublicReservationRefundPreviewHint | null | undefined,
	options?: { depositAmount?: number; startTime?: string | null }
): string => {
	const deposit = Number(options?.depositAmount ?? 0);
	if (!preview || (preview.amount || 0) > 0 || deposit <= 0) return '';

	switch (inferNoRefundReason(preview, options?.startTime)) {
		case 'WITHIN_24H':
			return ' Como faltan menos de 24 horas para tu turno, según la política de seña, no corresponde reembolso.';
		case 'POLICY_STRICT':
			return ' Según la política Estricta de seña, no corresponde reembolso.';
		default:
			return ' Según la política de seña, no corresponde reembolso.';
	}
};
