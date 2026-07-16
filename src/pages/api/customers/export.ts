import type { APIRoute } from 'astro';

import { ROLES } from '../../../config/roles';
import { CustomersApiError, listCustomersWithOrds } from '../../../lib/customers';
import {
	ORG_ACCESS_INACTIVE_CODE,
	ORG_ACCESS_INACTIVE_MESSAGE,
} from '../../../lib/panel-access';
import { listProfessionalsLovWithOrds } from '../../../lib/schedules';
import { parseTokenClaims } from '../../../lib/token-claims';
import {
	requireToken as requireApiToken,
	toErrorResponse as toApiErrorResponse,
} from '../../../utils/api-helpers';

const createCustomersError = (message: string, status = 400) =>
	new CustomersApiError(message, status);

const requireToken = (token: string | undefined) =>
	requireApiToken(token, createCustomersError, 'No hay sesion valida para exportar clientes.');

const toErrorResponse = (error: unknown, fallbackMessage: string) =>
	toApiErrorResponse(error, fallbackMessage, {
		isKnownError: (value): value is CustomersApiError => value instanceof CustomersApiError,
		createError: createCustomersError,
	});

const csvEscape = (value: string) => {
	const text = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	if (/[",\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
};

const getCurrentProfessionalId = async (token: string) => {
	const professionals = await listProfessionalsLovWithOrds(token, { onlyMe: true });
	return Number(professionals[0]?.id_professional || 0);
};

export const GET: APIRoute = async ({ locals }) => {
	try {
		const token = requireToken(locals.token);
		const claims = parseTokenClaims(token);
		const roleId = Number(locals.roleId ?? claims.role_id ?? 0);

		let professionalId: number | undefined;
		if (roleId === ROLES.PROFESIONAL) {
			const currentProfessionalId = await getCurrentProfessionalId(token);
			if (currentProfessionalId <= 0) {
				throw new CustomersApiError(ORG_ACCESS_INACTIVE_MESSAGE, 401, {
					code: ORG_ACCESS_INACTIVE_CODE,
				});
			}
			professionalId = currentProfessionalId;
		}

		const pageSize = 200;
		let page = 1;
		let totalPages = 1;
		const rows: Array<{ id: number; full_name: string; phone_number: string; created_at: string }> =
			[];

		while (page <= totalPages && page <= 50) {
			const result = await listCustomersWithOrds(token, {
				page,
				limit: pageSize,
				pro_id: professionalId,
			});
			totalPages = Math.max(1, Number(result.meta.total_pages || 1));
			for (const customer of result.data) {
				rows.push({
					id: Number(customer.id_customer || 0),
					full_name: String(customer.full_name || ''),
					phone_number: String(customer.phone_number || ''),
					created_at: String(customer.created_at || ''),
				});
			}
			page += 1;
		}

		const header = ['id_customer', 'full_name', 'phone_number', 'created_at'];
		const lines = [
			header.join(','),
			...rows.map((row) =>
				[
					csvEscape(String(row.id)),
					csvEscape(row.full_name),
					csvEscape(row.phone_number),
					csvEscape(row.created_at),
				].join(',')
			),
		];
		const bom = '\uFEFF';
		const body = bom + lines.join('\r\n') + '\r\n';
		const stamp = new Date().toISOString().slice(0, 10);

		return new Response(body, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="hasel-clientes-${stamp}.csv"`,
				'Cache-Control': 'no-store',
			},
		});
	} catch (error) {
		return toErrorResponse(error, 'No fue posible exportar los clientes.');
	}
};
