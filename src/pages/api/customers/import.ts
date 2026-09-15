import type { APIRoute } from 'astro';

import { CAPABILITIES } from '../../../config/capabilities';
import {
	CUSTOMER_CSV_MAX_BYTES,
	CustomerCsvError,
	prepareCustomerCsv,
	summarizeCustomerCsv,
} from '../../../lib/customer-csv';
import { createCustomerWithOrds, CustomersApiError } from '../../../lib/customers';
import { requireCapability } from '../../../lib/permissions';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

export const prerender = false;
export const maxDuration = 60;

const createCustomersError = (message: string, status = 400) =>
	new CustomersApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createCustomersError, 'No hay sesion valida para importar clientes.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is CustomersApiError => value instanceof CustomersApiError,
		createError: createCustomersError,
	});

const truthy = (value: unknown) => {
	const text = String(value ?? '')
		.trim()
		.toLowerCase();
	return text === '1' || text === 'true' || text === 'yes' || text === 'preview';
};

const readCsvText = async (request: Request) => {
	const contentType = request.headers.get('content-type') || '';

	if (contentType.includes('application/json')) {
		const body = (await request.json()) as { csv?: unknown; preview?: unknown };
		return {
			text: String(body.csv ?? ''),
			preview: truthy(body.preview),
		};
	}

	if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
		return {
			text: await request.text(),
			preview: truthy(new URL(request.url).searchParams.get('preview')),
		};
	}

	const formData = await request.formData();
	const file = formData.get('file') ?? formData.get('csv');
	let text = '';
	if (file instanceof File) {
		if (file.size > CUSTOMER_CSV_MAX_BYTES) {
			throw new CustomerCsvError(
				`El archivo no puede superar los ${Math.floor(CUSTOMER_CSV_MAX_BYTES / 1024)} KB.`
			);
		}
		text = await file.text();
	} else {
		text = String(file ?? formData.get('text') ?? '');
	}

	return {
		text,
		preview: truthy(formData.get('preview')) || truthy(new URL(request.url).searchParams.get('preview')),
	};
};

export const POST: APIRoute = async ({ locals, request }) => {
	try {
		const token = requireToken(locals.token);
		requireCapability(
			locals,
			CAPABILITIES.CUSTOMERS_CREATE,
			(message, status) => new CustomersApiError(message, status),
			'No tienes permisos para importar clientes.'
		);

		const { text, preview } = await readCsvText(request);
		if (!text.trim()) {
			throw new CustomerCsvError('Subi un archivo CSV con los clientes a importar.');
		}
		if (new TextEncoder().encode(text).length > CUSTOMER_CSV_MAX_BYTES) {
			throw new CustomerCsvError(
				`El archivo no puede superar los ${Math.floor(CUSTOMER_CSV_MAX_BYTES / 1024)} KB.`
			);
		}

		const prepared = prepareCustomerCsv(text);

		if (!preview) {
			for (const row of prepared) {
				if (row.status === 'error' || !row.value) continue;
				try {
					const created = await createCustomerWithOrds(token, row.value);
					row.status = 'imported';
					row.id_customer = Number(created.id_customer || 0) || undefined;
					delete row.value;
				} catch (error) {
					const message =
						error instanceof CustomersApiError
							? error.message
							: 'No fue posible crear el cliente.';
					const fieldErrors =
						error instanceof CustomersApiError && error.fieldErrors.length > 0
							? error.fieldErrors
							: [{ field: 'row', message }];
					row.status = 'error';
					row.errors = fieldErrors;
					delete row.value;
				}
			}
		}

		const summary = summarizeCustomerCsv(prepared);
		const imported = summary.rows.filter((row) => row.status === 'imported').length;

		return Response.json(
			{
				status: 'success',
				data: {
					preview,
					imported,
					skipped: summary.error_rows,
					...summary,
				},
			},
			{ status: 200 }
		);
	} catch (error) {
		if (error instanceof CustomerCsvError) {
			return toErrorResponse(
				new CustomersApiError(error.message, error.status),
				'No fue posible importar los clientes.'
			);
		}
		return toErrorResponse(error, 'No fue posible importar los clientes.');
	}
};
