export const PARAGUAY_MOBILE_PHONE_ERROR =
	'Ingresa un numero de Paraguay valido. Ej: 0981 123 456.';

export type ParaguayMobilePhoneParseResult =
	| {
			isValid: true;
			e164: string;
			national: string;
			pretty: string;
	  }
	| {
			isValid: false;
			e164: '';
			national: '';
			pretty: '';
	  };

const MOBILE_E164_REGEX = /^\+5959\d{8}$/;

const toDigitsOnly = (value: string) => String(value || '').replace(/\D/g, '');

const toPrettyNationalPhone = (nationalPhone: string) => {
	if (!/^09\d{8}$/.test(nationalPhone)) return nationalPhone;
	return `${nationalPhone.slice(0, 4)} ${nationalPhone.slice(4, 7)} ${nationalPhone.slice(7)}`;
};

export const parseParaguayMobilePhone = (rawValue: string): ParaguayMobilePhoneParseResult => {
	let digits = toDigitsOnly(rawValue);
	if (!digits) return { isValid: false, e164: '', national: '', pretty: '' };

	if (digits.startsWith('00595')) {
		digits = digits.slice(2);
	}
	if (digits.startsWith('5950')) {
		digits = `595${digits.slice(4)}`;
	}

	let e164 = '';
	if (/^5959\d{8}$/.test(digits)) {
		e164 = `+${digits}`;
	} else if (/^09\d{8}$/.test(digits)) {
		e164 = `+595${digits.slice(1)}`;
	} else if (/^9\d{8}$/.test(digits)) {
		e164 = `+595${digits}`;
	}

	if (!MOBILE_E164_REGEX.test(e164)) {
		return { isValid: false, e164: '', national: '', pretty: '' };
	}

	const national = `0${e164.slice(4)}`;
	return {
		isValid: true,
		e164,
		national,
		pretty: toPrettyNationalPhone(national),
	};
};

export const isParaguayMobilePhone = (rawValue: string) =>
	parseParaguayMobilePhone(rawValue).isValid;

export const formatParaguayMobilePhoneInput = (rawValue: string) => {
	let digits = toDigitsOnly(rawValue);
	if (digits.startsWith('00595')) digits = digits.slice(5);
	if (digits.startsWith('595')) digits = digits.slice(3);
	if (digits.startsWith('0')) digits = digits.slice(1);

	const local = digits.slice(0, 9);
	if (!local) return '';
	if (local.length <= 3) return local;
	if (local.length <= 6) return `${local.slice(0, 3)} ${local.slice(3)}`;
	return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`;
};

export const toParaguayMobileE164FromInput = (rawValue: string) => {
	const digits = toDigitsOnly(rawValue);
	const normalized = parseParaguayMobilePhone(digits);
	if (normalized.isValid) return normalized.e164;

	const local = formatParaguayMobilePhoneInput(rawValue).replace(/\D/g, '');
	return local ? `+595${local}` : '';
};
