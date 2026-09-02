const norm = (value: unknown) => String(value || '').trim().toUpperCase();

export const DISPUTE_AWAITING_PROOF = new Set(['OPENED', 'OPEN']);
export const DISPUTE_PROOF_PROCESSING = new Set(['PROOF_RECEIVED', 'EVIDENCE_PROCESSING']);
export const DISPUTE_UNDER_REVIEW = new Set(['UNDER_REVIEW', 'CUSTOMER_FOLLOW_UP', 'EVIDENCE_ACCEPTED']);
export const DISPUTE_STAFF_UPLOAD = new Set([
	'OPENED',
	'OPEN',
	'PROOF_RECEIVED',
	'EVIDENCE_PROCESSING',
	'UNDER_REVIEW',
]);
export const DISPUTE_SETTLED = new Set(['REFUND_SETTLED']);
export const DISPUTE_TIMED_OUT = new Set(['TIMED_OUT', 'EXPIRED_STRIKE']);
export const DISPUTE_OPS_RESOLVED = new Set(['RESOLVED_BY_OPS']);
export const DISPUTE_DISMISSED = new Set(['DISMISSED']);

export const normalizeDisputeStatus = (value: unknown) => {
	const status = norm(value);
	if (status === 'OPEN' || status === 'EVIDENCE_PROCESSING') return 'OPENED';
	if (status === 'EVIDENCE_ACCEPTED' || status === 'CUSTOMER_FOLLOW_UP') return 'UNDER_REVIEW';
	if (status === 'EXPIRED_STRIKE') return 'TIMED_OUT';
	return status;
};

export const isDisputeAwaitingProof = (value: unknown) => DISPUTE_AWAITING_PROOF.has(norm(value));

export const isDisputeProofProcessing = (value: unknown) => DISPUTE_PROOF_PROCESSING.has(norm(value));

export const isDisputeUnderReview = (value: unknown) => DISPUTE_UNDER_REVIEW.has(norm(value));

export const isDisputeStaffUploadOpen = (value: unknown) => DISPUTE_STAFF_UPLOAD.has(norm(value));

export const cobrosDisputeNote = (status: string) => {
	const value = norm(status);
	if (DISPUTE_AWAITING_PROOF.has(value)) {
		return 'El cliente abrió una disputa. Adjuntá la prueba de transferencia antes del vencimiento. Subir una prueba no acredita el envío.';
	}
	if (value === 'PROOF_RECEIVED' || value === 'EVIDENCE_PROCESSING') {
		return 'Comprobante recibido. El OCR no acredita la transferencia; el caso queda en revisión.';
	}
	if (DISPUTE_UNDER_REVIEW.has(value)) {
		return 'En revisión. El OCR no liquida el caso: el cliente puede confirmar que recibió el dinero, o Operaciones Hasel lo cierra.';
	}
	if (DISPUTE_SETTLED.has(value)) {
		return 'El cliente confirmó que recibió el reembolso. El caso está liquidado.';
	}
	if (DISPUTE_TIMED_OUT.has(value)) {
		return 'La disputa venció sin prueba a tiempo y se registró un strike.';
	}
	if (DISPUTE_OPS_RESOLVED.has(value)) {
		return 'Operaciones Hasel resolvió el caso.';
	}
	if (DISPUTE_DISMISSED.has(value)) {
		return 'El caso fue desestimado.';
	}
	return '';
};

export const cobrosDisputeChipLabel = (status: string) => {
	const value = normalizeDisputeStatus(status);
	if (value === 'OPENED') return 'En disputa';
	if (value === 'PROOF_RECEIVED') return 'Prueba en lectura';
	if (value === 'UNDER_REVIEW') return 'En revisión';
	if (value === 'REFUND_SETTLED') return 'Reembolso confirmado';
	if (value === 'TIMED_OUT') return 'Disputa vencida';
	if (value === 'RESOLVED_BY_OPS') return 'Resuelto por Hasel';
	if (value === 'DISMISSED') return 'Desestimado';
	return '';
};
