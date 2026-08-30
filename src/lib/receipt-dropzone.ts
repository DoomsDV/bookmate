import {
	RECEIPT_MAX_BYTES,
	classifyReceiptFile,
	receiptFileSignature,
} from './receipt-file';

export type ReceiptDropzoneApi = {
	reset: () => void;
	getFile: () => File | null;
	setLocked: (locked: boolean) => void;
	hasFile: () => boolean;
};

type BindReceiptDropzoneOptions = {
	dropzone: string;
	input: string;
	empty?: string;
	preview?: string;
	previewImage?: string;
	previewPdf?: string;
	previewName?: string;
	clear?: string;
	signal?: AbortSignal;
	isLocked?: () => boolean;
	onChange?: (file: File | null) => void;
	onInvalid?: (message: string) => void;
};

const previewUrls = new WeakMap<Element, string>();

const revokePreview = (root: ParentNode) => {
	if (!(root instanceof Element)) return;
	const url = previewUrls.get(root);
	if (!url) return;
	URL.revokeObjectURL(url);
	previewUrls.delete(root);
};

export const bindReceiptDropzone = (
	root: ParentNode,
	options: BindReceiptDropzoneOptions
): ReceiptDropzoneApi | null => {
	const dropzone = root.querySelector<HTMLElement>(options.dropzone);
	const fileInput = root.querySelector<HTMLInputElement>(options.input);
	if (!dropzone || !fileInput) return null;

	const empty = options.empty ? root.querySelector<HTMLElement>(options.empty) : null;
	const preview = options.preview ? root.querySelector<HTMLElement>(options.preview) : null;
	const image = options.previewImage
		? root.querySelector<HTMLImageElement>(options.previewImage)
		: null;
	const pdf = options.previewPdf ? root.querySelector<HTMLElement>(options.previewPdf) : null;
	const name = options.previewName ? root.querySelector<HTMLElement>(options.previewName) : null;
	const clearBtn = options.clear ? root.querySelector<HTMLButtonElement>(options.clear) : null;
	const listenerOpts = options.signal ? { signal: options.signal } : undefined;

	const lockedByCaller = () => Boolean(options.isLocked?.());

	const reset = () => {
		revokePreview(root);
		fileInput.value = '';
		dropzone.classList.remove('has-preview', 'is-dragging');
		dropzone.parentElement?.classList.remove('has-preview');
		empty?.classList.remove('hidden');
		preview?.classList.add('hidden');
		clearBtn?.classList.add('hidden');
		image?.classList.add('hidden');
		if (image) image.removeAttribute('src');
		pdf?.classList.add('hidden');
		if (name) name.textContent = '';
		options.onChange?.(null);
	};

	const showPreview = (file: File, kind: 'image' | 'pdf') => {
		revokePreview(root);
		dropzone.classList.add('has-preview');
		dropzone.parentElement?.classList.add('has-preview');
		empty?.classList.add('hidden');
		preview?.classList.remove('hidden');
		clearBtn?.classList.remove('hidden');
		if (kind === 'image' && image && root instanceof Element) {
			const url = URL.createObjectURL(file);
			previewUrls.set(root, url);
			image.src = url;
			image.classList.remove('hidden');
			pdf?.classList.add('hidden');
			return;
		}
		image?.classList.add('hidden');
		if (image) image.removeAttribute('src');
		pdf?.classList.remove('hidden');
		if (name) name.textContent = file.name || 'comprobante.pdf';
	};

	const assignFile = (file: File) => {
		const kind = classifyReceiptFile(file);
		if (!kind) {
			reset();
			options.onInvalid?.('Formato no válido. Subí una imagen (JPG/PNG) o un PDF.');
			return false;
		}
		if (file.size > RECEIPT_MAX_BYTES) {
			reset();
			options.onInvalid?.('El archivo supera 8 MB.');
			return false;
		}
		const transfer = new DataTransfer();
		transfer.items.add(file);
		fileInput.files = transfer.files;
		showPreview(file, kind);
		options.onChange?.(file);
		return true;
	};

	const setLocked = (locked: boolean) => {
		dropzone.classList.toggle('is-locked', locked);
		dropzone.setAttribute('aria-disabled', locked ? 'true' : 'false');
		fileInput.disabled = locked;
		if (clearBtn) clearBtn.disabled = locked;
	};

	fileInput.addEventListener(
		'change',
		() => {
			if (lockedByCaller() || fileInput.disabled) return;
			const file = fileInput.files?.[0];
			if (!file) {
				reset();
				return;
			}
			assignFile(file);
		},
		listenerOpts
	);

	clearBtn?.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			if (clearBtn.disabled || lockedByCaller()) return;
			reset();
		},
		listenerOpts
	);

	const setDragging = (dragging: boolean) => {
		dropzone.classList.toggle('is-dragging', dragging);
	};

	dropzone.addEventListener(
		'dragenter',
		(event) => {
			event.preventDefault();
			if (dropzone.classList.contains('is-locked') || lockedByCaller()) return;
			setDragging(true);
		},
		listenerOpts
	);
	dropzone.addEventListener(
		'dragover',
		(event) => {
			event.preventDefault();
			if (dropzone.classList.contains('is-locked') || lockedByCaller()) return;
			setDragging(true);
		},
		listenerOpts
	);
	dropzone.addEventListener(
		'dragleave',
		(event) => {
			const related = event.relatedTarget;
			if (related instanceof Node && dropzone.contains(related)) return;
			setDragging(false);
		},
		listenerOpts
	);
	dropzone.addEventListener(
		'drop',
		(event) => {
			event.preventDefault();
			setDragging(false);
			if (dropzone.classList.contains('is-locked') || lockedByCaller() || fileInput.disabled) {
				return;
			}
			const file = event.dataTransfer?.files?.[0];
			if (!file) return;
			assignFile(file);
		},
		listenerOpts
	);
	dropzone.addEventListener(
		'click',
		(event) => {
			if (dropzone.classList.contains('is-locked') || fileInput.disabled || lockedByCaller()) {
				event.preventDefault();
			}
		},
		listenerOpts
	);

	options.signal?.addEventListener('abort', () => revokePreview(root));

	return {
		reset,
		getFile: () => fileInput.files?.[0] || null,
		setLocked,
		hasFile: () => Boolean(fileInput.files?.[0]),
	};
};

export { receiptFileSignature };
