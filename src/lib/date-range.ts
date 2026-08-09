export type PanelDatePreset = 'none' | 'this_month' | 'last_month' | 'custom';

export type DateRange = {
	from: Date | null;
	to: Date | null;
};

const startOfDay = (date: Date) => {
	const next = new Date(date);
	next.setHours(0, 0, 0, 0);
	return next;
};

const endOfDay = (date: Date) => {
	const next = new Date(date);
	next.setHours(23, 59, 59, 999);
	return next;
};

const parseIsoDateStart = (iso: string) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	return startOfDay(date);
};

const parseIsoDateEnd = (iso: string) => {
	const parsed = parseIsoDateStart(iso);
	return parsed ? endOfDay(parsed) : null;
};

/** Replica la lógica de pr_resolve_date_range (Cobros) con preset `none` adicional. */
export const resolveDateRange = (
	preset: PanelDatePreset,
	dateFrom?: string,
	dateTo?: string,
	now: Date = new Date()
): DateRange => {
	if (preset === 'none') {
		return { from: null, to: null };
	}

	const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));

	if (preset === 'last_month') {
		const from = startOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1));
		const to = endOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth(), 0));
		return { from, to };
	}

	if (preset === 'custom') {
		const from = dateFrom ? parseIsoDateStart(dateFrom) : monthStart;
		const to = dateTo ? parseIsoDateEnd(dateTo) : now;
		return { from: from ?? monthStart, to: to ?? now };
	}

	// this_month
	return { from: monthStart, to: now };
};

export const isTimestampInRange = (timestamp: string, range: DateRange) => {
	if (!range.from && !range.to) return true;
	const value = new Date(timestamp);
	if (Number.isNaN(value.getTime())) return false;
	if (range.from && value < range.from) return false;
	if (range.to && value > range.to) return false;
	return true;
};
