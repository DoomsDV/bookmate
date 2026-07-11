/** Progreso de reserva pública en sessionStorage (sobrevive F5, no pestañas nuevas). */

export const PUBLIC_BOOKING_DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

export const SLOT_UNAVAILABLE_RESTORE_MESSAGE =
	'El horario que habías elegido ya no está disponible. Por favor, seleccioná uno nuevo.';

export type PublicBookingDraftStep = 1 | 2 | 3 | 4;

export type PublicBookingDraft = {
	v: 1;
	step: PublicBookingDraftStep;
	serviceId: number;
	orgId?: number | null;
	locationId?: number | null;
	date: string;
	time: string;
	phone: string;
	name: string;
	policyAccepted?: boolean;
	savedAt: number;
};

export const proBookingDraftKey = (orgSlug: string, proSlug: string) =>
	`hasel:pb:pro:${orgSlug || '_'}:${proSlug}`;

export const userBookingDraftKey = (publicSlug: string) => `hasel:pb:user:${publicSlug}`;

const isDraftStep = (value: unknown): value is PublicBookingDraftStep =>
	value === 1 || value === 2 || value === 3 || value === 4;

const parseDraft = (raw: string | null): PublicBookingDraft | null => {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<PublicBookingDraft>;
		if (parsed?.v !== 1) return null;
		if (!isDraftStep(parsed.step)) return null;
		const serviceId = Number(parsed.serviceId || 0);
		if (!Number.isInteger(serviceId) || serviceId < 0) return null;
		const savedAt = Number(parsed.savedAt || 0);
		if (!Number.isFinite(savedAt) || savedAt <= 0) return null;
		return {
			v: 1,
			step: parsed.step,
			serviceId,
			orgId: parsed.orgId == null ? null : Number(parsed.orgId) || null,
			locationId: parsed.locationId == null ? null : Number(parsed.locationId) || null,
			date: String(parsed.date || '').trim(),
			time: String(parsed.time || '').trim(),
			phone: String(parsed.phone || ''),
			name: String(parsed.name || ''),
			policyAccepted: Boolean(parsed.policyAccepted),
			savedAt,
		};
	} catch {
		return null;
	}
};

/** Fecha API YYYY-MM-DD estrictamente anterior a hoy local. */
export const isApiDateBeforeToday = (apiDate: string, todayApiDate: string) => {
	const date = String(apiDate || '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Boolean(date);
	return date < todayApiDate;
};

export const readPublicBookingDraft = (
	key: string,
	todayApiDate: string
): PublicBookingDraft | null => {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const draft = parseDraft(sessionStorage.getItem(key));
		if (!draft) return null;
		if (Date.now() - draft.savedAt > PUBLIC_BOOKING_DRAFT_TTL_MS) {
			sessionStorage.removeItem(key);
			return null;
		}
		if (draft.date && isApiDateBeforeToday(draft.date, todayApiDate)) {
			sessionStorage.removeItem(key);
			return null;
		}
		return draft;
	} catch {
		return null;
	}
};

export const writePublicBookingDraft = (key: string, draft: PublicBookingDraft) => {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(key, JSON.stringify({ ...draft, v: 1 as const, savedAt: Date.now() }));
	} catch {
		/* quota / private mode */
	}
};

export const clearPublicBookingDraft = (key: string) => {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.removeItem(key);
	} catch {
		/* ignore */
	}
};

export const createDraftPersister = (
	key: string,
	build: () => PublicBookingDraft | null,
	delayMs = 200
) => {
	let timer: number | null = null;

	const flush = () => {
		timer = null;
		const draft = build();
		if (!draft || draft.serviceId <= 0) {
			clearPublicBookingDraft(key);
			return;
		}
		writePublicBookingDraft(key, draft);
	};

	const schedule = () => {
		if (typeof window === 'undefined') return;
		if (timer != null) window.clearTimeout(timer);
		timer = window.setTimeout(flush, delayMs);
	};

	const clear = () => {
		if (timer != null && typeof window !== 'undefined') {
			window.clearTimeout(timer);
			timer = null;
		}
		clearPublicBookingDraft(key);
	};

	return { schedule, flush, clear };
};
