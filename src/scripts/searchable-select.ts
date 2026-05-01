import TomSelect from 'tom-select';

export type SearchableSelectInstance = TomSelect;

const instances = new WeakMap<HTMLSelectElement, TomSelect>();

type SearchableSelectOptions = {
	placeholder?: string;
	maxOptions?: number;
	closeAfterSelect?: boolean;
};

export const getSearchableSelect = (select: HTMLSelectElement | null | undefined) =>
	select ? instances.get(select) ?? null : null;

export const ensureSearchableSelect = (
	select: HTMLSelectElement | null | undefined,
	options: SearchableSelectOptions = {}
) => {
	if (!select) return null;

	const current = instances.get(select);
	if (current) return current;

	select.className = 'bookmate-searchable-select';

	const instance = new TomSelect(select, {
		allowEmptyOption: true,
		create: false,
		persist: false,
		plugins: ['dropdown_input'],
		maxOptions: options.maxOptions ?? 200,
		closeAfterSelect: options.closeAfterSelect ?? true,
		placeholder: options.placeholder,
		controlInput: '<input type="text" autocomplete="off" />',
	});

	instances.set(select, instance);
	if (select.disabled) instance.disable();
	return instance;
};

export const syncSearchableSelect = (select: HTMLSelectElement | null | undefined) => {
	if (!select) return;
	const instance = instances.get(select);
	if (!instance) return;

	const value = select.value;
	instance.sync();
	instance.refreshOptions(false);
	instance.setValue(value, true);
	if (select.disabled) instance.disable();
	else instance.enable();
};

export const setSearchableSelectValue = (
	select: HTMLSelectElement | null | undefined,
	value: string | number | null | undefined,
	silent = true
) => {
	if (!select) return;
	const nextValue = value === null || value === undefined ? '' : String(value);
	select.value = nextValue;
	const instance = instances.get(select);
	if (instance) instance.setValue(nextValue, silent);
};

export const setSearchableSelectDisabled = (
	select: HTMLSelectElement | null | undefined,
	disabled: boolean
) => {
	if (!select) return;
	select.disabled = disabled;
	const instance = instances.get(select);
	if (!instance) return;
	if (disabled) instance.disable();
	else instance.enable();
};

export const destroySearchableSelect = (select: HTMLSelectElement | null | undefined) => {
	if (!select) return;
	const instance = instances.get(select);
	if (!instance) return;
	instance.destroy();
	instances.delete(select);
};
