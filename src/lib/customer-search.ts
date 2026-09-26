/**
 * Búsqueda de clientes del modal de cita.
 *
 * El modal precarga los clientes más recientes (CUSTOMER_PRELOAD_LIMIT) y filtra en el
 * navegador mientras se escribe. Si la organización tiene más clientes que los precargados,
 * también consulta al servidor (`/api/customers?search=`), que busca en todos por nombre,
 * teléfono, documento y email; así se puede elegir a cualquier cliente, no solo a los primeros.
 */

export type SearchableCustomer = {
	id_customer: number;
	full_name: string;
	phone_number: string;
};

/** Clientes que se precargan al enfocar el campo (los más recientes). */
export const CUSTOMER_PRELOAD_LIMIT = 50;
/** Resultados visibles en el desplegable. */
export const CUSTOMER_RESULTS_LIMIT = 8;
/** Caracteres mínimos para consultar al servidor. */
export const CUSTOMER_SERVER_SEARCH_MIN_CHARS = 2;
/** Espera tras la última tecla antes de consultar al servidor. */
export const CUSTOMER_SERVER_SEARCH_DEBOUNCE_MS = 250;

/** Minúsculas y sin acentos, igual que la búsqueda del servidor. */
export const normalizeCustomerQuery = (value: string): string =>
	String(value || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toLowerCase();

export const filterCustomersLocally = <T extends SearchableCustomer>(
	customers: readonly T[],
	query: string,
	limit = CUSTOMER_RESULTS_LIMIT
): T[] => {
	const normalized = normalizeCustomerQuery(query);
	const matches = normalized
		? customers.filter((customer) =>
				normalizeCustomerQuery(`${customer.full_name} ${customer.phone_number}`).includes(normalized)
			)
		: customers;
	return matches.slice(0, limit);
};

/** La precarga trae todos los clientes cuando devuelve menos que el límite pedido. */
export const isCustomerPreloadComplete = (loadedCount: number, limit = CUSTOMER_PRELOAD_LIMIT): boolean =>
	loadedCount < limit;

export const shouldSearchCustomersOnServer = (query: string, preloadComplete: boolean): boolean =>
	!preloadComplete && normalizeCustomerQuery(query).length >= CUSTOMER_SERVER_SEARCH_MIN_CHARS;

/** Identifica una búsqueda: el mismo texto con otro profesional es otra búsqueda. */
export const customerSearchKey = (professionalId: number, query: string): string =>
	`${professionalId}|${normalizeCustomerQuery(query)}`;
