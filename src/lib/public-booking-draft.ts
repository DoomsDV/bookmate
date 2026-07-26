/** Progreso de reserva pública en sessionStorage (sobrevive F5, no pestañas nuevas). */

export const PUBLIC_BOOKING_DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

export const SLOT_UNAVAILABLE_RESTORE_MESSAGE =
	'El horario que habías elegido ya no está disponible. Por favor, seleccioná uno nuevo.';

export type PublicBookingDraftStep = 1 | 2 | 3 | 4 | 5;

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

/**
 * Persistencia de la seña (hold SIPAP) en localStorage. A diferencia del draft de
 * pasos 1-5 (sessionStorage), el hold ya existe en el servidor (cita PENDIENTE con
 * public_manage_token), así que debe sobrevivir un F5 y hasta el cierre del navegador
 * dentro de la ventana de pago, para que el cliente pueda volver a subir el comprobante.
 */

export type SipapHoldContext = {
	serviceId: number;
	serviceName?: string;
	professionalName?: string;
	depositAmount?: number;
	date?: string;
	time?: string;
	locationId?: number | null;
};

export type PublicBookingHold = {
	v: 1;
	/** Respuesta del hold ya "unwrapped" (payment_reference, public_manage_token, sipap, etc.). */
	hold: Record<string, unknown>;
	context: SipapHoldContext;
	/** Epoch ms de payment_expires_at (ventana del hold en el backend). */
	expiresAt: number;
	savedAt: number;
};

export const proBookingHoldKey = (orgSlug: string, proSlug: string) =>
	`hasel:pb:hold:pro:${orgSlug || '_'}:${proSlug}`;

export const userBookingHoldKey = (publicSlug: string) => `hasel:pb:hold:user:${publicSlug}`;

/** Fallback si el hold no trajo payment_expires_at legible. */
const HOLD_FALLBACK_TTL_MS = 60 * 60 * 1000;

const resolveHoldExpiry = (hold: Record<string, unknown>, savedAt: number): number => {
	const raw = hold?.['payment_expires_at'];
	const parsed = raw ? Date.parse(String(raw)) : Number.NaN;
	return Number.isFinite(parsed) ? parsed : savedAt + HOLD_FALLBACK_TTL_MS;
};

export const writeSipapHold = (
	key: string,
	hold: Record<string, unknown>,
	context: SipapHoldContext
) => {
	if (typeof localStorage === 'undefined') return;
	try {
		const savedAt = Date.now();
		const payload: PublicBookingHold = {
			v: 1,
			hold,
			context,
			expiresAt: resolveHoldExpiry(hold, savedAt),
			savedAt,
		};
		localStorage.setItem(key, JSON.stringify(payload));
	} catch {
		/* quota / private mode */
	}
};

export const readSipapHold = (key: string): PublicBookingHold | null => {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<PublicBookingHold>;
		if (parsed?.v !== 1 || !parsed.hold || typeof parsed.hold !== 'object') {
			localStorage.removeItem(key);
			return null;
		}
		const hold = parsed.hold as Record<string, unknown>;
		const token = String(hold['public_manage_token'] || '').trim();
		if (!token) {
			localStorage.removeItem(key);
			return null;
		}
		const expiresAt = Number(parsed.expiresAt || 0);
		if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
			localStorage.removeItem(key);
			return null;
		}
		return {
			v: 1,
			hold,
			context: (parsed.context || {}) as SipapHoldContext,
			expiresAt,
			savedAt: Number(parsed.savedAt || Date.now()),
		};
	} catch {
		return null;
	}
};

export const clearSipapHold = (key: string) => {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(key);
	} catch {
		/* ignore */
	}
};

const isDraftStep = (value: unknown): value is PublicBookingDraftStep =>
	value === 1 || value === 2 || value === 3 || value === 4 || value === 5;

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

	/** Evita perder el paso al recargar antes de que corra el debounce. */
	if (typeof window !== 'undefined') {
		window.addEventListener('pagehide', flush);
		window.addEventListener('beforeunload', flush);
	}

	return { schedule, flush, clear };
};
