const toText = (value: unknown) => String(value ?? '').trim();

export const formatPersonName = (value: unknown): string => {
	const text = toText(value);
	if (!text) return '';

	return text
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toLocaleUpperCase('es') + part.slice(1).toLocaleLowerCase('es'))
		.join(' ');
};
