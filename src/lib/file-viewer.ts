export type FileViewerOpenOptions = {
	url: string;
	name?: string;
	mimeType?: string;
};

export type FileViewerHandle = {
	open: (options: FileViewerOpenOptions) => void;
	close: () => void;
};

export function isPdfFile(url: string, mimeType?: string) {
	const mime = String(mimeType || '').toLowerCase();
	if (mime === 'application/pdf') return true;
	if (mime.startsWith('image/')) return false;
	return /\.pdf($|\?)/i.test(String(url || ''));
}

export function bindFileViewer(root: ParentNode, signal?: AbortSignal): FileViewerHandle | null {
	const viewer = root.querySelector<HTMLDialogElement>('[data-file-viewer]');
	if (!viewer) return null;

	const img = viewer.querySelector<HTMLImageElement>('[data-file-viewer-img]');
	const frame = viewer.querySelector<HTMLIFrameElement>('[data-file-viewer-frame]');
	const nameEl = viewer.querySelector<HTMLElement>('[data-file-viewer-name]');
	const openLink = viewer.querySelector<HTMLAnchorElement>('[data-file-viewer-open]');
	const listenerOpts = signal ? { signal } : undefined;

	const close = () => {
		if (!viewer.open) return;
		viewer.close();
		if (frame) frame.src = 'about:blank';
		if (img) {
			img.removeAttribute('src');
			img.alt = '';
		}
		if (openLink) openLink.href = '#';
	};

	const open = (options: FileViewerOpenOptions) => {
		const url = String(options.url || '').trim();
		if (!url) return;
		const name = String(options.name || '').trim() || 'Archivo';
		const isPdf = isPdfFile(url, options.mimeType);
		if (nameEl) nameEl.textContent = name;
		if (openLink) openLink.href = url;
		if (img) {
			img.alt = name;
			img.classList.toggle('hidden', isPdf);
			if (isPdf) img.removeAttribute('src');
			else img.src = url;
		}
		if (frame) {
			frame.classList.toggle('hidden', !isPdf);
			frame.src = isPdf ? url : 'about:blank';
		}
		if (!viewer.open) viewer.showModal();
	};

	viewer.querySelector('[data-file-viewer-close]')?.addEventListener('click', close, listenerOpts);
	viewer.addEventListener(
		'click',
		(event) => {
			if (event.target === viewer) close();
		},
		listenerOpts
	);
	viewer.addEventListener(
		'cancel',
		(event) => {
			event.preventDefault();
			close();
		},
		listenerOpts
	);

	return { open, close };
}
