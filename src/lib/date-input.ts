export const isoToDisplay = (iso: string) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
	if (!match) return '';
	return `${match[3]}/${match[2]}/${match[1]}`;
};

export const displayToIso = (display: string) => {
	const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(display || '').trim());
	if (!match) return '';
	const day = Number(match[1]);
	const month = Number(match[2]);
	const year = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return '';
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return '';
	}
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const maskDateDisplay = (raw: string) => {
	const digits = String(raw || '')
		.replace(/\D/g, '')
		.slice(0, 8);
	if (digits.length <= 2) return digits;
	if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
	return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const caretAfterDigits = (formatted: string, digitCount: number) => {
	if (digitCount <= 0) return 0;
	let seen = 0;
	for (let i = 0; i < formatted.length; i += 1) {
		if (/\d/.test(formatted[i]!)) {
			seen += 1;
			if (seen >= digitCount) return i + 1;
		}
	}
	return formatted.length;
};

export const parseIsoDate = (iso: string) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	return date;
};

export const toIsoDate = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

type BindDateTextInputOptions = {
	onChange?: () => void;
	onError?: (message: string) => void;
};

export const bindDateTextInput = (
	textEl: HTMLInputElement | null,
	nativeEl: HTMLInputElement | null,
	options: BindDateTextInputOptions = {}
) => {
	const clearError = () => options.onError?.('');

	textEl?.addEventListener('input', () => {
		const selection = textEl.selectionStart ?? textEl.value.length;
		const digitsBeforeCaret = textEl.value.slice(0, selection).replace(/\D/g, '').length;
		const next = maskDateDisplay(textEl.value);
		textEl.value = next;
		const nextCaret = caretAfterDigits(next, digitsBeforeCaret);
		textEl.setSelectionRange(nextCaret, nextCaret);
		textEl.classList.remove('is-invalid');
		clearError();
		if (next.length === 10) {
			const iso = displayToIso(next);
			if (iso && nativeEl) nativeEl.value = iso;
		} else if (nativeEl && next.length < 10) {
			nativeEl.value = '';
		}
		options.onChange?.();
	});
	textEl?.addEventListener('blur', () => {
		if (!textEl.value.trim()) {
			if (nativeEl) nativeEl.value = '';
			options.onChange?.();
			return;
		}
		const iso = displayToIso(textEl.value);
		if (!iso) {
			textEl.classList.add('is-invalid');
			return;
		}
		if (nativeEl) nativeEl.value = iso;
		textEl.value = isoToDisplay(iso);
		textEl.classList.remove('is-invalid');
		options.onChange?.();
	});
	nativeEl?.addEventListener('change', () => {
		if (textEl) textEl.value = isoToDisplay(nativeEl.value || '');
		textEl?.classList.remove('is-invalid');
		clearError();
		options.onChange?.();
	});
};
