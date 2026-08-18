import { parseParaguayMobilePhone } from './paraguay-phone';

export type SipapAliasKind = 'phone' | 'email' | 'ci' | 'ruc';

export type SipapAliasParseResult =
	| { isValid: true; kind: SipapAliasKind; normalized: string }
	| { isValid: false; kind: null; normalized: ''; message: string };

export const SIPAP_ALIAS_ERROR =
	'Ingresá un alias SIPAP válido: celular paraguayo, CI, RUC o email.';

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const toDigits = (value: string) => String(value || '').replace(/\D/g, '');

/**
 * Limpia lo que el usuario pegó o tipeó: espacios, puntos, guiones, paréntesis, etc.
 * Email: solo quita espacios. Número: deja dígitos.
 */
export const sanitizeSipapAliasInput = (rawValue: string): string => {
	const value = String(rawValue || '');
	if (value.includes('@')) {
		return value.replace(/\s+/g, '').toLowerCase();
	}
	return toDigits(value);
};

/** Dígito verificador de RUC paraguayo (módulo 11, pesos cíclicos 2–11, SET). */
export const paraguayRucCheckDigit = (baseDigits: string): number | null => {
	if (!/^\d{5,8}$/.test(baseDigits)) return null;
	let sum = 0;
	let weight = 2;
	for (let i = baseDigits.length - 1; i >= 0; i -= 1) {
		sum += Number(baseDigits[i]) * weight;
		weight = weight >= 11 ? 2 : weight + 1;
	}
	const remainder = sum % 11;
	return remainder > 1 ? 11 - remainder : 0;
};

const parseParaguayRuc = (digits: string): string | null => {
	if (digits.length < 6 || digits.length > 9) return null;
	const base = digits.slice(0, -1);
	const dv = Number(digits.slice(-1));
	const expected = paraguayRucCheckDigit(base);
	return expected === dv ? `${base}-${dv}` : null;
};

const parseParaguayCi = (digits: string): string | null => {
	if (!/^\d{5,8}$/.test(digits)) return null;
	if (/^0+$/.test(digits)) return null;
	return digits;
};

const parseEmail = (raw: string): string | null => {
	const email = sanitizeSipapAliasInput(raw);
	if (email.length < 6 || email.length > 100) return null;
	if (!EMAIL_RE.test(email)) return null;
	return email;
};

export const parseSipapAlias = (rawValue: string): SipapAliasParseResult => {
	const raw = String(rawValue || '').trim();
	if (!raw) {
		return { isValid: false, kind: null, normalized: '', message: SIPAP_ALIAS_ERROR };
	}

	if (raw.includes('@')) {
		const email = parseEmail(raw);
		if (email) return { isValid: true, kind: 'email', normalized: email };
		return {
			isValid: false,
			kind: null,
			normalized: '',
			message: 'Ingresá un email válido. Ej: nombre@correo.com',
		};
	}

	const digits = toDigits(raw);
	if (!digits) {
		return { isValid: false, kind: null, normalized: '', message: SIPAP_ALIAS_ERROR };
	}

	const phone = parseParaguayMobilePhone(digits);
	if (phone.isValid) {
		return { isValid: true, kind: 'phone', normalized: phone.national };
	}

	const localDigits = digits.startsWith('595') ? digits.slice(3) : digits;
	const looksLikePhone = /^09\d{0,8}$/.test(digits) || /^9\d{8}$/.test(localDigits);
	if (looksLikePhone) {
		return {
			isValid: false,
			kind: null,
			normalized: '',
			message: 'Ingresá un celular paraguayo válido. Ej: 0981 123 456',
		};
	}

	const ruc = parseParaguayRuc(digits);
	if (ruc) return { isValid: true, kind: 'ruc', normalized: ruc };

	if (digits.length >= 9) {
		return {
			isValid: false,
			kind: null,
			normalized: '',
			message: 'Ingresá un RUC paraguayo válido. Ej: 80012345-6',
		};
	}

	const ci = parseParaguayCi(digits);
	if (ci) return { isValid: true, kind: 'ci', normalized: ci };

	return { isValid: false, kind: null, normalized: '', message: SIPAP_ALIAS_ERROR };
};

export const isValidSipapAlias = (rawValue: string) => parseSipapAlias(rawValue).isValid;
