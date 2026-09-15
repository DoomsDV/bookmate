export type CustomerArchiveFlag = {
	is_active: 0 | 1;
};

export type CustomersArchiveListResult<T extends CustomerArchiveFlag> = {
	data: T[];
	meta: {
		current_page: number;
		per_page: number;
		total_records: number;
		total_pages: number;
	};
};

export const customerMatchesArchiveFilter = (
	customer: CustomerArchiveFlag,
	archived: boolean
) => (archived ? customer.is_active === 0 : customer.is_active === 1);

export const applyCustomerArchiveFilter = <T extends CustomerArchiveFlag>(
	customers: T[],
	archived: boolean
): T[] => customers.filter((customer) => customerMatchesArchiveFilter(customer, archived));

export const applyArchiveFilterToListResult = <T extends CustomerArchiveFlag>(
	result: CustomersArchiveListResult<T>,
	archived: boolean
): CustomersArchiveListResult<T> => {
	const data = applyCustomerArchiveFilter(result.data, archived);
	if (data.length === result.data.length) return result;

	// ORDS devolvió mezcla (handler viejo). Si la página 1 trae el padron entero, el
	// contador puede corregirse; si no, no inventamos total_pages.
	const fullUnfilteredPage =
		result.meta.current_page === 1 &&
		result.meta.total_records <= result.meta.per_page &&
		result.data.length === result.meta.total_records;

	if (!fullUnfilteredPage) {
		return { ...result, data };
	}

	return {
		data,
		meta: {
			...result.meta,
			total_records: data.length,
			total_pages: data.length === 0 ? 0 : 1,
		},
	};
};
