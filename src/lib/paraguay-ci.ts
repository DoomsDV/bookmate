export const PARAGUAY_CI_ERROR = 'Ingresá una CI paraguaya válida. Ej: 4567890.';

export type ParaguayCiParseResult =
	| { isValid: true; digits: string }
	| { isValid: false; digits: '' };

const toDigitsOnly = (value: string) => String(value || '').replace(/\D/g, '');

export const parseParaguayCi = (rawValue: string): ParaguayCiParseResult => {
	const digits = toDigitsOnly(rawValue);
	if (!/^\d{5,8}$/.test(digits) || /^0+$/.test(digits)) {
		return { isValid: false, digits: '' };
	}
	return { isValid: true, digits };
};

export const isParaguayCi = (rawValue: string) => parseParaguayCi(rawValue).isValid;
