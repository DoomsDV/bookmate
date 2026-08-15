export type AttachmentListItemData = {
	file_name: string;
	mime_type: string;
	size_bytes: number;
	url: string;
};

export const ATTACHMENT_LIST_CLASS = 'm-0 grid list-none gap-2 p-0';

export function getAttachmentIcon(mimeType: string) {
	const type = String(mimeType || '').toLowerCase();
	if (type.startsWith('image/')) return 'image';
	if (type === 'application/pdf') return 'picture_as_pdf';
	if (type.startsWith('video/')) return 'movie';
	if (type.startsWith('audio/')) return 'audio_file';
	return 'description';
}

export function formatFileSize(bytes: number) {
	const value = Number(bytes) || 0;
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const shortenAttachmentName = (name: string) => {
	const trimmed = String(name || '').trim();
	const dot = trimmed.lastIndexOf('.');
	const ext = dot > 0 ? trimmed.slice(dot + 1) : '';
	const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
	if (base.length <= 8) return trimmed;
	return ext ? `${base.slice(0, 8)}…${ext}` : `${base.slice(0, 8)}…`;
};

export function createAttachmentListItem(
	attachment: AttachmentListItemData,
	options?: { onDelete?: () => void; onPreview?: () => void; variant?: 'row' | 'chip' }
) {
	const isChip = options?.variant === 'chip';
	const item = document.createElement('li');
	item.className = isChip
		? 'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-(--shell-border) bg-(--surface-bright) px-2.5 py-1'
		: 'flex items-center gap-3 rounded-xl border border-(--shell-border) bg-(--surface) px-3 py-2';

	const icon = document.createElement('span');
	icon.className = isChip
		? 'material-symbols-rounded shrink-0 text-[1rem] text-(--on-surface-variant)'
		: 'material-symbols-rounded shrink-0 text-[1.2rem] text-(--on-surface-variant)';
	icon.setAttribute('aria-hidden', 'true');
	icon.textContent = getAttachmentIcon(attachment.mime_type);
	item.appendChild(icon);

	const link = document.createElement('a');
	link.href = attachment.url;
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	link.className = isChip
		? 'w-fit text-[0.74rem] font-semibold text-(--on-surface) hover:text-(--primary)'
		: 'min-w-0 flex-1 truncate text-[0.88rem] font-semibold text-(--on-surface) hover:text-(--primary) hover:underline';
	link.textContent = isChip ? shortenAttachmentName(attachment.file_name) : attachment.file_name;
	link.title = attachment.file_name;
	item.appendChild(link);

	if (!isChip) {
		const size = document.createElement('span');
		size.className = 'shrink-0 text-[0.76rem] font-medium text-(--on-surface-variant)';
		size.textContent = formatFileSize(attachment.size_bytes);
		item.appendChild(size);
	}

	if (options?.onPreview) {
		item.classList.add('cursor-pointer');
		if (!isChip) {
			const previewButton = document.createElement('button');
			previewButton.type = 'button';
			previewButton.className = 'attachment-preview-btn';
			previewButton.title = 'Ver archivo';
			previewButton.setAttribute('aria-label', `Ver ${attachment.file_name}`);
			previewButton.innerHTML =
				'<span class="material-symbols-rounded text-[1.15rem]" aria-hidden="true">visibility</span>';
			previewButton.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				options.onPreview?.();
			});
			item.appendChild(previewButton);
		}

		const openPreview = (event: MouseEvent) => {
			if ((event.target as HTMLElement | null)?.closest('[data-attachment-delete]')) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			event.preventDefault();
			options.onPreview?.();
		};
		item.addEventListener('click', openPreview);
	}

	if (options?.onDelete) {
		const removeButton = document.createElement('button');
		removeButton.type = 'button';
		removeButton.setAttribute('data-attachment-delete', '');
		removeButton.className =
			'shrink-0 inline-flex size-7 items-center justify-center rounded-full text-(--on-surface-variant) transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50';
		removeButton.setAttribute('aria-label', `Eliminar ${attachment.file_name}`);
		removeButton.innerHTML =
			'<span class="material-symbols-rounded text-[1.05rem]" aria-hidden="true">delete</span>';
		removeButton.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			options.onDelete?.();
		});
		item.appendChild(removeButton);
	}

	return item;
}
