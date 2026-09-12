import { PARAGUAY_MOBILE_PHONE_ERROR, parseParaguayMobilePhone } from './paraguay-phone';
import { PARAGUAY_CI_ERROR, parseParaguayCi } from './paraguay-ci';

export const CUSTOMER_EMAIL_ERROR = 'Ingresá un correo válido. Ej: nombre@correo.com';

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export type CustomerEmailParseResult =
	| { isValid: true; email: string }
	| { isValid: false; email: '' };

export const parseCustomerEmail = (rawValue: string): CustomerEmailParseResult => {
	const email = String(rawValue || '')
		.replace(/\s+/g, '')
		.toLowerCase();
	if (!email) return { isValid: true, email: '' };
	if (email.length < 6 || email.length > 150 || !EMAIL_RE.test(email)) {
		return { isValid: false, email: '' };
	}
	return { isValid: true, email };
};

export const composeCustomerFullName = (firstName: string, lastName: string) =>
	`${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();

export const splitCustomerFullName = (fullName: string) => {
	const trimmed = String(fullName || '').trim();
	if (!trimmed) return { first_name: '', last_name: '' };
	const space = trimmed.indexOf(' ');
	if (space < 0) return { first_name: trimmed, last_name: '' };
	return {
		first_name: trimmed.slice(0, space).trim(),
		last_name: trimmed.slice(space + 1).trim(),
	};
};

export type CustomerContactFieldError = { field: string; message: string };

export type ValidatedCustomerContact = {
	first_name: string;
	last_name: string;
	phone_number: string;
	document_number: string | null;
	email: string | null;
};

export const validateCustomerContactInput = (input: {
	first_name?: unknown;
	last_name?: unknown;
	full_name?: unknown;
	phone_number?: unknown;
	document_number?: unknown;
	email?: unknown;
}): { ok: true; value: ValidatedCustomerContact } | { ok: false; errors: CustomerContactFieldError[] } => {
	const errors: CustomerContactFieldError[] = [];
	let firstName = String(input.first_name ?? '').trim();
	let lastName = String(input.last_name ?? '').trim();
	const fullName = String(input.full_name ?? '').trim();

	if (!firstName && !lastName && fullName) {
		const split = splitCustomerFullName(fullName);
		firstName = split.first_name;
		lastName = split.last_name;
	}

	if (!firstName) {
		errors.push({ field: 'first_name', message: 'El nombre es obligatorio.' });
	} else if (firstName.length > 80) {
		errors.push({ field: 'first_name', message: 'El nombre no puede superar los 80 caracteres.' });
	}

	if (!lastName) {
		errors.push({ field: 'last_name', message: 'El apellido es obligatorio.' });
	} else if (lastName.length > 80) {
		errors.push({ field: 'last_name', message: 'El apellido no puede superar los 80 caracteres.' });
	}

	const phoneRaw = String(input.phone_number ?? '').trim();
	const parsedPhone = parseParaguayMobilePhone(phoneRaw);
	if (!parsedPhone.isValid) {
		errors.push({
			field: 'phone_number',
			message: phoneRaw ? PARAGUAY_MOBILE_PHONE_ERROR : 'El telefono es obligatorio.',
		});
	}

	const documentRaw = String(input.document_number ?? '').trim();
	let documentNumber: string | null = null;
	if (documentRaw) {
		const parsedCi = parseParaguayCi(documentRaw);
		if (!parsedCi.isValid) {
			errors.push({ field: 'document_number', message: PARAGUAY_CI_ERROR });
		} else {
			documentNumber = parsedCi.digits;
		}
	}

	const emailRaw = String(input.email ?? '').trim();
	let email: string | null = null;
	if (emailRaw) {
		const parsedEmail = parseCustomerEmail(emailRaw);
		if (!parsedEmail.isValid) {
			errors.push({ field: 'email', message: CUSTOMER_EMAIL_ERROR });
		} else {
			email = parsedEmail.email || null;
		}
	}

	if (errors.length > 0 || !parsedPhone.isValid) {
		return { ok: false, errors };
	}

	return {
		ok: true,
		value: {
			first_name: firstName,
			last_name: lastName,
			phone_number: parsedPhone.e164,
			document_number: documentNumber,
			email,
		},
	};
};
