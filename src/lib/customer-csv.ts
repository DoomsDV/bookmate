import {
	composeCustomerFullName,
	validateCustomerContactInput,
	type CustomerContactFieldError,
	type ValidatedCustomerContact,
} from './customer-contact';

export const CUSTOMER_CSV_MAX_ROWS = 500;
export const CUSTOMER_CSV_MAX_BYTES = 512 * 1024;

export const CUSTOMER_CSV_TEMPLATE = [
	'nombre,telefono,ci,email',
	'María Fernández,0981 123 456,4567890,maria@correo.com',
	'',
].join('\r\n');

export type CustomerCsvRowStatus = 'ok' | 'error' | 'imported';

export type CustomerCsvRowResult = {
	row_number: number;
	status: CustomerCsvRowStatus;
	first_name: string;
	last_name: string;
	full_name: string;
	phone_number: string;
	document_number: string;
	email: string;
	id_customer?: number;
	errors: CustomerContactFieldError[];
};

export type CustomerCsvPreview = {
	total_rows: number;
	valid_rows: number;
	error_rows: number;
	rows: CustomerCsvRowResult[];
};

export type CustomerCsvPreparedRow = CustomerCsvRowResult & {
	value?: ValidatedCustomerContact;
};

const NAME_HEADERS = new Set([
	'name',
	'nombre',
	'full_name',
	'cliente',
	'nombre_completo',
]);
const FIRST_NAME_HEADERS = new Set(['first_name', 'nombre_pila']);
const LAST_NAME_HEADERS = new Set(['last_name', 'apellido']);
const PHONE_HEADERS = new Set([
	'phone',
	'telefono',
	'phone_number',
	'celular',
	'tel',
	'nro_telefono',
]);
const DOCUMENT_HEADERS = new Set([
	'ci',
	'document_number',
	'documento',
	'cedula',
	'nro_documento',
	'nro_ci',
	'cedula_de_identidad',
]);
const EMAIL_HEADERS = new Set(['email', 'correo', 'mail', 'correo_electronico']);

export class CustomerCsvError extends Error {
	status: number;

	constructor(message: string, status = 400) {
		super(message);
		this.name = 'CustomerCsvError';
		this.status = status;
	}
}

const normalizeHeader = (value: string) =>
	String(value || '')
		.replace(/^\uFEFF/, '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

const pickHeaderIndex = (headers: string[], aliases: Set<string>) => {
	for (let index = 0; index < headers.length; index += 1) {
		if (aliases.has(headers[index] || '')) return index;
	}
	return -1;
};

const cellAt = (row: string[], index: number) =>
	index >= 0 ? String(row[index] ?? '').trim() : '';

const detectDelimiter = (text: string): ',' | ';' => {
	let commas = 0;
	let semis = 0;
	let inQuotes = false;
	for (const char of text) {
		if (char === '"') {
			inQuotes = !inQuotes;
			continue;
		}
		if (inQuotes) continue;
		if (char === '\n') break;
		if (char === ',') commas += 1;
		if (char === ';') semis += 1;
	}
	return semis > commas ? ';' : ',';
};

export const parseCsvRecords = (text: string): string[][] => {
	const source = String(text || '')
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');
	const delimiter = detectDelimiter(source);
	const records: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;

	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		if (row.length === 1 && row[0] === '' && records.length === 0) {
			row = [];
			return;
		}
		records.push(row);
		row = [];
	};

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index] || '';
		if (inQuotes) {
			if (char === '"') {
				if (source[index + 1] === '"') {
					field += '"';
					index += 1;
				} else {
					inQuotes = false;
				}
				continue;
			}
			field += char;
			continue;
		}
		if (char === '"') {
			inQuotes = true;
			continue;
		}
		if (char === delimiter) {
			pushField();
			continue;
		}
		if (char === '\n') {
			pushField();
			pushRow();
			continue;
		}
		field += char;
	}

	if (inQuotes) {
		throw new CustomerCsvError('El CSV tiene comillas sin cerrar.');
	}

	if (field.length > 0 || row.length > 0) {
		pushField();
		pushRow();
	}

	return records.filter((record) => record.some((value) => String(value || '').trim() !== ''));
};

const mapRowInput = (
	headers: string[],
	record: string[]
): {
	first_name: string;
	last_name: string;
	full_name: string;
	phone_number: string;
	document_number: string;
	email: string;
} => {
	const firstName = cellAt(record, pickHeaderIndex(headers, FIRST_NAME_HEADERS));
	const lastName = cellAt(record, pickHeaderIndex(headers, LAST_NAME_HEADERS));
	const fullName = cellAt(record, pickHeaderIndex(headers, NAME_HEADERS));
	return {
		first_name: firstName,
		last_name: lastName,
		full_name: fullName,
		phone_number: cellAt(record, pickHeaderIndex(headers, PHONE_HEADERS)),
		document_number: cellAt(record, pickHeaderIndex(headers, DOCUMENT_HEADERS)),
		email: cellAt(record, pickHeaderIndex(headers, EMAIL_HEADERS)),
	};
};

const flattenErrors = (errors: CustomerContactFieldError[]) => {
	const seen = new Set<string>();
	return errors.filter((error) => {
		const key = `${error.field}:${error.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const markIntraFileDuplicates = (rows: CustomerCsvPreparedRow[]) => {
	const phones = new Map<string, number>();
	const documents = new Map<string, number>();
	const emails = new Map<string, number>();

	const addDuplicate = (
		row: CustomerCsvPreparedRow,
		field: string,
		message: string
	) => {
		row.status = 'error';
		row.errors = flattenErrors([...row.errors, { field, message }]);
		delete row.value;
	};

	for (const row of rows) {
		if (!row.value) continue;
		const phone = row.value.phone_number;
		const document = row.value.document_number || '';
		const email = row.value.email || '';

		const phoneFirst = phones.get(phone);
		if (phoneFirst) {
			addDuplicate(
				row,
				'phone_number',
				`Este telefono esta duplicado en la fila ${phoneFirst}.`
			);
		} else {
			phones.set(phone, row.row_number);
		}

		if (document) {
			const documentFirst = documents.get(document);
			if (documentFirst) {
				addDuplicate(
					row,
					'document_number',
					`Esta CI esta duplicada en la fila ${documentFirst}.`
				);
			} else {
				documents.set(document, row.row_number);
			}
		}

		if (email) {
			const emailFirst = emails.get(email);
			if (emailFirst) {
				addDuplicate(row, 'email', `Este correo esta duplicado en la fila ${emailFirst}.`);
			} else {
				emails.set(email, row.row_number);
			}
		}
	}
};

export const prepareCustomerCsv = (text: string): CustomerCsvPreparedRow[] => {
	const records = parseCsvRecords(text);
	if (records.length === 0) {
		throw new CustomerCsvError('El CSV esta vacio.');
	}

	const headers = (records[0] || []).map(normalizeHeader);
	const hasName =
		pickHeaderIndex(headers, NAME_HEADERS) >= 0 ||
		pickHeaderIndex(headers, FIRST_NAME_HEADERS) >= 0;
	const hasPhone = pickHeaderIndex(headers, PHONE_HEADERS) >= 0;
	if (!hasName || !hasPhone) {
		throw new CustomerCsvError(
			'El CSV debe tener columnas de nombre y telefono. Tambien acepta CI y email. Ej: nombre,telefono,ci,email'
		);
	}

	const dataRecords = records.slice(1);
	if (dataRecords.length === 0) {
		throw new CustomerCsvError('El CSV no tiene filas de clientes.');
	}
	if (dataRecords.length > CUSTOMER_CSV_MAX_ROWS) {
		throw new CustomerCsvError(
			`El CSV no puede tener mas de ${CUSTOMER_CSV_MAX_ROWS} filas.`
		);
	}

	const rows: CustomerCsvPreparedRow[] = dataRecords.map((record, index) => {
		const rowNumber = index + 2;
		const input = mapRowInput(headers, record);
		const validated = validateCustomerContactInput(input);
		const displayName =
			composeCustomerFullName(input.first_name, input.last_name) || input.full_name;
		if (!validated.ok) {
			const errors = validated.errors.map((error) => {
				if (
					error.field === 'last_name' &&
					!input.last_name &&
					input.full_name &&
					!input.full_name.includes(' ')
				) {
					return {
						field: error.field,
						message:
							'Falta el apellido. Usa "Nombre Apellido" o las columnas first_name y last_name.',
					};
				}
				return error;
			});
			return {
				row_number: rowNumber,
				status: 'error',
				first_name: input.first_name,
				last_name: input.last_name,
				full_name: displayName,
				phone_number: input.phone_number,
				document_number: input.document_number,
				email: input.email,
				errors,
			};
		}

		return {
			row_number: rowNumber,
			status: 'ok',
			first_name: validated.value.first_name,
			last_name: validated.value.last_name,
			full_name: composeCustomerFullName(
				validated.value.first_name,
				validated.value.last_name
			),
			phone_number: validated.value.phone_number,
			document_number: validated.value.document_number || '',
			email: validated.value.email || '',
			errors: [],
			value: validated.value,
		};
	});

	markIntraFileDuplicates(rows);
	return rows;
};

export const summarizeCustomerCsv = (
	rows: CustomerCsvPreparedRow[]
): CustomerCsvPreview => {
	const publicRows: CustomerCsvRowResult[] = rows.map((row) => ({
		row_number: row.row_number,
		status: row.status,
		first_name: row.first_name,
		last_name: row.last_name,
		full_name: row.full_name,
		phone_number: row.phone_number,
		document_number: row.document_number,
		email: row.email,
		...(row.id_customer ? { id_customer: row.id_customer } : {}),
		errors: row.errors,
	}));

	return {
		total_rows: publicRows.length,
		valid_rows: publicRows.filter((row) => row.status !== 'error').length,
		error_rows: publicRows.filter((row) => row.status === 'error').length,
		rows: publicRows,
	};
};

export const previewCustomerCsv = (text: string): CustomerCsvPreview =>
	summarizeCustomerCsv(prepareCustomerCsv(text));
