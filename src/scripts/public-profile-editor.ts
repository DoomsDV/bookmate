import {
	ProfileImageCropper,
	isAcceptedProfileImage,
	type ProfileCropMode,
} from '../lib/profile-image-crop';
import { emitPublicProfilePreviewUpdate } from '../lib/public-profile-preview-events';
import { buildOrgHubUrl } from '../lib/public-profile-url';
import { isReservedOrgSlug } from '../lib/reserved-org-slugs';

type GalleryItem = { id: number; url: string; sort_order?: number };

type Bootstrap = {
	workspace: {
		profile_slug?: string;
		description?: string;
		public_whatsapp?: string;
		logo_url?: string;
		banner_url?: string;
		facebook_url?: string;
		instagram_url?: string;
		gallery_images?: GalleryItem[];
		name?: string;
	};
	organizationName: string;
	siteOrigin: string;
	domainLabel: string;
	descMax?: number;
	galleryMax?: number;
};

const fileToBase64 = (file: File) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = String(reader.result || '');
			const comma = result.indexOf(',');
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
		reader.readAsDataURL(file);
	});

const normalizeSlugInput = (value: string) =>
	String(value || '')
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const digitsOnly = (value: string) => String(value || '').replace(/\D/g, '');

const initialsFromName = (name: string) => {
	const parts = String(name || '')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!parts.length) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

export const initializePublicProfileEditor = (root: HTMLElement) => {
	if (root.dataset.ppeBound === '1') return;
	root.dataset.ppeBound = '1';

	let bootstrap: Bootstrap;
	try {
		bootstrap = JSON.parse(String(root.dataset.ppeBootstrap || '{}')) as Bootstrap;
	} catch {
		return;
	}

	const form = root.querySelector<HTMLFormElement>('[data-ppe-form]');
	const slugInput = root.querySelector<HTMLInputElement>('[data-ppe-slug]');
	const slugRow = root.querySelector<HTMLElement>('[data-ppe-slug-row]');
	const slugStatus = root.querySelector<HTMLElement>('[data-ppe-slug-status]');
	const slugIcon = root.querySelector<HTMLElement>('[data-ppe-slug-icon]');
	const slugHint = root.querySelector<HTMLElement>('[data-ppe-slug-hint]');
	const descInput = root.querySelector<HTMLTextAreaElement>('[data-ppe-description]');
	const descCount = root.querySelector<HTMLElement>('[data-ppe-desc-count]');
	const waToggle = root.querySelector<HTMLInputElement>('[data-ppe-wa-toggle]');
	const waField = root.querySelector<HTMLElement>('[data-ppe-wa-field]');
	const waInput = root.querySelector<HTMLInputElement>('[data-ppe-whatsapp]');
	const facebookInput = root.querySelector<HTMLInputElement>('[data-ppe-facebook]');
	const instagramInput = root.querySelector<HTMLInputElement>('[data-ppe-instagram]');
	const feedback = root.querySelector<HTMLElement>('[data-ppe-feedback]');
	const saveBtn = root.querySelector<HTMLButtonElement>('[data-ppe-save]');
	const openPublic = root.querySelector<HTMLAnchorElement>('[data-ppe-open-public]');
	const copyBtn = root.querySelector<HTMLButtonElement>('[data-ppe-copy-url]');
	const descMax = Number(bootstrap.descMax || 500);
	const galleryMax = Number(bootstrap.galleryMax || 30);

	const logoInput = root.querySelector<HTMLInputElement>('[data-ppe-logo-input]');
	const logoDropzone = root.querySelector<HTMLElement>('[data-ppe-logo-dropzone]');
	const logoPreview = root.querySelector<HTMLImageElement>('[data-ppe-logo-preview]');
	const logoPlaceholder = root.querySelector<HTMLElement>('[data-ppe-logo-placeholder]');

	const bannerInput = root.querySelector<HTMLInputElement>('[data-ppe-banner-input]');
	const bannerDropzone = root.querySelector<HTMLElement>('[data-ppe-banner-dropzone]');
	const bannerPreview = root.querySelector<HTMLImageElement>('[data-ppe-banner-preview]');
	const bannerPlaceholder = root.querySelector<HTMLElement>('[data-ppe-banner-placeholder]');
	const bannerCompress = root.querySelector<HTMLInputElement>('[data-ppe-banner-compress]');
	const bannerCompressHint = root.querySelector<HTMLElement>('[data-ppe-banner-compress-hint]');

	const galleryGrid = root.querySelector<HTMLElement>('[data-ppe-gallery-grid]');
	const galleryCount = root.querySelector<HTMLElement>('[data-ppe-gallery-count]');
	const galleryInput = root.querySelector<HTMLInputElement>('[data-ppe-gallery-input]');
	const galleryCompress = root.querySelector<HTMLInputElement>('[data-ppe-gallery-compress]');
	const galleryCompressHint = root.querySelector<HTMLElement>('[data-ppe-gallery-compress-hint]');

	const cropModal = root.querySelector<HTMLDialogElement>('[data-ppe-crop-modal]');
	const cropMount = root.querySelector<HTMLElement>('[data-ppe-crop-mount]');
	const cropConfirm = root.querySelector<HTMLButtonElement>('[data-ppe-crop-confirm]');
	const cropTitle = root.querySelector<HTMLElement>('[data-ppe-crop-title]');

	let cropper: ProfileImageCropper | null = null;
	let cropMode: ProfileCropMode = 'logo';
	let pendingCropName = 'logo.jpg';
	let logoObjectUrl = '';
	let logoBase64 = '';
	let logoName = '';
	let logoMime = '';
	let bannerObjectUrl = '';
	let bannerBase64 = '';
	let bannerName = '';
	let bannerMime = '';
	let currentLogoUrl = String(bootstrap.workspace?.logo_url || '').trim();
	let currentBannerUrl = String(bootstrap.workspace?.banner_url || '').trim();
	let galleryItems: GalleryItem[] = Array.isArray(bootstrap.workspace?.gallery_images)
		? [...bootstrap.workspace.gallery_images]
		: [];
	let slugCheckTimer: number | null = null;
	let slugAvailable = true;
	let originalSlug = normalizeSlugInput(String(bootstrap.workspace?.profile_slug || ''));
	const initials = initialsFromName(bootstrap.organizationName);

	const showFeedback = (message: string, kind: 'success' | 'error') => {
		if (!feedback) return;
		feedback.hidden = !message;
		feedback.textContent = message;
		feedback.classList.toggle('is-success', kind === 'success');
		feedback.classList.toggle('is-error', kind === 'error');
	};

	const setLogoPreview = (url: string) => {
		currentLogoUrl = url;
		if (logoPreview) {
			if (url) {
				logoPreview.src = url;
				logoPreview.classList.remove('hidden');
			} else {
				logoPreview.removeAttribute('src');
				logoPreview.classList.add('hidden');
			}
		}
		logoPlaceholder?.classList.toggle('hidden', Boolean(url));
	};

	const setBannerPreview = (url: string) => {
		currentBannerUrl = url;
		if (bannerPreview) {
			if (url) {
				bannerPreview.src = url;
				bannerPreview.classList.remove('hidden');
			} else {
				bannerPreview.removeAttribute('src');
				bannerPreview.classList.add('hidden');
			}
		}
		bannerPlaceholder?.classList.toggle('hidden', Boolean(url));
	};

	const renderGalleryGrid = () => {
		if (!galleryGrid) return;
		galleryGrid.replaceChildren();
		for (const item of galleryItems) {
			const li = document.createElement('li');
			li.className = 'ppe-gallery-item';
			li.dataset.ppeGalleryItem = '';
			li.dataset.id = String(item.id);

			const img = document.createElement('img');
			img.src = item.url;
			img.alt = '';

			const actions = document.createElement('div');
			actions.className = 'ppe-gallery-item__actions';

			const makeAction = (label: string, iconName: string, attr: string) => {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'ppe-gallery-item__action';
				btn.dataset[attr] = '';
				btn.dataset.id = String(item.id);
				btn.setAttribute('aria-label', label);
				const icon = document.createElement('span');
				icon.className = 'material-symbols-rounded';
				icon.setAttribute('aria-hidden', 'true');
				icon.textContent = iconName;
				btn.appendChild(icon);
				return btn;
			};

			actions.append(
				makeAction('Mover izquierda', 'chevron_left', 'ppeGalleryLeft'),
				makeAction('Mover derecha', 'chevron_right', 'ppeGalleryRight'),
				makeAction('Eliminar foto', 'close', 'ppeGalleryRemove')
			);

			li.append(img, actions);
			galleryGrid.appendChild(li);
		}
		if (galleryCount) galleryCount.textContent = `(${galleryItems.length}/${galleryMax})`;
	};

	const syncPreview = () => {
		const rawDescription = String(descInput?.value || '');
		const description = rawDescription.trim();
		const showWa = Boolean(waToggle?.checked) && digitsOnly(waInput?.value || '').length >= 6;

		if (descCount) descCount.textContent = String(rawDescription.length);
		waField?.classList.toggle('hidden', !waToggle?.checked);
		bannerCompressHint?.toggleAttribute('hidden', Boolean(bannerCompress?.checked));
		galleryCompressHint?.toggleAttribute('hidden', Boolean(galleryCompress?.checked));

		const slug = normalizeSlugInput(slugInput?.value || '');
		if (openPublic) {
			const url = slug ? buildOrgHubUrl(bootstrap.siteOrigin, slug) : '#';
			openPublic.href = url;
			openPublic.classList.toggle('opacity-50', !slug);
		}

		emitPublicProfilePreviewUpdate({
			organizationName: bootstrap.organizationName,
			initials,
			description,
			logoUrl: currentLogoUrl,
			bannerUrl: currentBannerUrl,
			whatsappVisible: showWa,
			facebookUrl: String(facebookInput?.value || '').trim(),
			instagramUrl: String(instagramInput?.value || '').trim(),
			galleryUrls: galleryItems.map((item) => item.url),
			profileSlug: slug,
		});
	};

	const setSlugStatus = (text: string, state: 'ok' | 'bad' | 'pending') => {
		if (!slugStatus) return;
		slugStatus.textContent = text;
		slugStatus.classList.remove('is-ok', 'is-bad', 'is-pending');
		slugStatus.classList.add(`is-${state}`);
		slugRow?.classList.toggle('is-ok', state === 'ok');
		slugRow?.classList.toggle('is-bad', state === 'bad');
		if (slugIcon) slugIcon.hidden = state !== 'ok';
		if (slugHint) slugHint.hidden = state === 'ok';
	};

	const checkSlug = async () => {
		const slug = normalizeSlugInput(slugInput?.value || '');
		if (slugInput && slugInput.value !== slug) slugInput.value = slug;

		if (!slug) {
			slugAvailable = false;
			setSlugStatus('Ingresá un enlace para tu negocio.', 'bad');
			return;
		}
		if (isReservedOrgSlug(slug)) {
			slugAvailable = false;
			setSlugStatus('Ese enlace está reservado por el sistema.', 'bad');
			return;
		}
		if (slug === originalSlug) {
			slugAvailable = true;
			setSlugStatus('Disponible', 'ok');
			return;
		}

		setSlugStatus('Validando…', 'pending');
		try {
			const response = await fetch(
				`/api/workspace/slug-available?slug=${encodeURIComponent(slug)}`,
				{ headers: { Accept: 'application/json' } }
			);
			const data = (await response.json()) as {
				status?: string;
				data?: { available?: boolean; reason?: string };
				message?: string;
			};
			if (!response.ok || data.status !== 'success') {
				slugAvailable = false;
				setSlugStatus(data.message || 'No se pudo validar el enlace.', 'bad');
				return;
			}
			const available = Boolean(data.data?.available);
			const reason = String(data.data?.reason || '');
			slugAvailable = available;
			if (available) setSlugStatus('Disponible', 'ok');
			else if (reason === 'reserved') setSlugStatus('Ese enlace está reservado por el sistema.', 'bad');
			else if (reason === 'taken') setSlugStatus('Ese enlace ya está en uso. Probá otro.', 'bad');
			else setSlugStatus('Enlace no válido.', 'bad');
		} catch {
			slugAvailable = false;
			setSlugStatus('No se pudo validar el enlace.', 'bad');
		}
	};

	const scheduleSlugCheck = () => {
		if (slugCheckTimer) window.clearTimeout(slugCheckTimer);
		slugCheckTimer = window.setTimeout(() => {
			void checkSlug();
		}, 400);
	};

	const openCrop = async (file: File, mode: ProfileCropMode) => {
		if (!cropModal || !cropMount) return;
		if (!isAcceptedProfileImage(file)) {
			showFeedback('Usá una imagen JPG o PNG.', 'error');
			return;
		}
		cropMode = mode;
		pendingCropName = file.name || (mode === 'banner' ? 'banner.jpg' : 'logo.jpg');
		if (cropTitle) cropTitle.textContent = mode === 'banner' ? 'Recortar banner' : 'Recortar logo';
		cropper?.destroy();
		cropper = new ProfileImageCropper(cropMount, 512, mode);
		await cropper.bindFile(file);
		if (!cropModal.open) cropModal.showModal();
	};

	const closeCrop = () => {
		cropper?.destroy();
		cropper = null;
		cropModal?.close();
	};

	const applyCropped = async () => {
		if (!cropper) return;
		try {
			const file = await cropper.exportJpeg(pendingCropName);
			const base64 = await fileToBase64(file);
			if (cropMode === 'banner') {
				bannerBase64 = base64;
				bannerName = file.name;
				bannerMime = file.type || 'image/jpeg';
				if (bannerObjectUrl) URL.revokeObjectURL(bannerObjectUrl);
				bannerObjectUrl = URL.createObjectURL(file);
				setBannerPreview(bannerObjectUrl);
			} else {
				logoBase64 = base64;
				logoName = file.name;
				logoMime = file.type || 'image/jpeg';
				if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
				logoObjectUrl = URL.createObjectURL(file);
				setLogoPreview(logoObjectUrl);
			}
			closeCrop();
			showFeedback('', 'success');
			syncPreview();
		} catch (error) {
			showFeedback(
				error instanceof Error ? error.message : 'No se pudo recortar la imagen.',
				'error'
			);
		}
	};

	const buildWhatsappPayload = () => {
		if (!waToggle?.checked) return '';
		const local = digitsOnly(waInput?.value || '');
		if (!local) return '';
		const normalized = local.startsWith('595') ? local : `595${local.replace(/^0+/, '')}`;
		return `+${normalized}`;
	};

	const uploadGalleryFiles = async (files: FileList | File[]) => {
		const list = Array.from(files);
		if (!list.length) return;
		if (galleryItems.length >= galleryMax) {
			showFeedback(`La galería admite un máximo de ${galleryMax} fotos.`, 'error');
			return;
		}

		for (const file of list) {
			if (galleryItems.length >= galleryMax) break;
			if (!isAcceptedProfileImage(file)) {
				showFeedback('Usá imágenes JPG o PNG en la galería.', 'error');
				continue;
			}
			const formData = new FormData();
			formData.append('file', file);
			formData.append('compress', galleryCompress?.checked === false ? 'false' : 'true');
			try {
				const response = await fetch('/api/workspace/gallery', {
					method: 'POST',
					body: formData,
					headers: { Accept: 'application/json' },
				});
				const data = (await response.json()) as {
					status?: string;
					message?: string;
					data?: { gallery_images?: GalleryItem[] };
				};
				if (!response.ok || data.status !== 'success') {
					throw new Error(data.message || 'No se pudo subir la foto.');
				}
				galleryItems = Array.isArray(data.data?.gallery_images)
					? data.data.gallery_images
					: galleryItems;
				renderGalleryGrid();
				syncPreview();
				showFeedback(data.message || 'Foto agregada a la galería.', 'success');
			} catch (error) {
				showFeedback(
					error instanceof Error ? error.message : 'No se pudo subir la foto.',
					'error'
				);
				break;
			}
		}
	};

	const removeGalleryItem = async (id: number) => {
		try {
			const response = await fetch(`/api/workspace/gallery/${id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' },
			});
			const data = (await response.json()) as {
				status?: string;
				message?: string;
				data?: { gallery_images?: GalleryItem[] };
			};
			if (!response.ok || data.status !== 'success') {
				throw new Error(data.message || 'No se pudo eliminar la foto.');
			}
			galleryItems = Array.isArray(data.data?.gallery_images) ? data.data.gallery_images : [];
			renderGalleryGrid();
			syncPreview();
			showFeedback(data.message || 'Foto eliminada.', 'success');
		} catch (error) {
			showFeedback(
				error instanceof Error ? error.message : 'No se pudo eliminar la foto.',
				'error'
			);
		}
	};

	form?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const slug = normalizeSlugInput(slugInput?.value || '');
		if (!slug || !slugAvailable) {
			showFeedback('Revisá el enlace público antes de guardar.', 'error');
			await checkSlug();
			return;
		}

		const payload: Record<string, string> = {
			profile_slug: slug,
			description: String(descInput?.value || '').trim().slice(0, descMax),
			public_whatsapp: buildWhatsappPayload(),
			facebook_url: String(facebookInput?.value || '').trim(),
			instagram_url: String(instagramInput?.value || '').trim(),
			compress_banner: bannerCompress?.checked === false ? 'false' : 'true',
		};
		if (logoBase64) {
			payload.logo_base64 = logoBase64;
			payload.logo_name = logoName || 'logo.jpg';
			payload.logo_mime = logoMime || 'image/jpeg';
		}
		if (bannerBase64) {
			payload.banner_base64 = bannerBase64;
			payload.banner_name = bannerName || 'banner.jpg';
			payload.banner_mime = bannerMime || 'image/jpeg';
		}

		if (saveBtn) saveBtn.disabled = true;
		showFeedback('', 'success');
		try {
			const response = await fetch('/api/workspace', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(payload),
			});
			const data = (await response.json()) as {
				status?: string;
				message?: string;
				data?: {
					logo_url?: string;
					banner_url?: string;
					profile_slug?: string;
					facebook_url?: string;
					instagram_url?: string;
					gallery_images?: GalleryItem[];
				};
			};
			if (!response.ok || data.status !== 'success') {
				throw new Error(data.message || 'No fue posible guardar el perfil.');
			}

			originalSlug = normalizeSlugInput(String(data.data?.profile_slug || slug));
			if (slugInput) slugInput.value = originalSlug;
			logoBase64 = '';
			bannerBase64 = '';
			if (data.data?.logo_url) setLogoPreview(String(data.data.logo_url));
			if (data.data?.banner_url) setBannerPreview(String(data.data.banner_url));
			if (Array.isArray(data.data?.gallery_images)) {
				galleryItems = data.data.gallery_images;
				renderGalleryGrid();
			}
			if (facebookInput && data.data?.facebook_url !== undefined) {
				facebookInput.value = String(data.data.facebook_url || '');
			}
			if (instagramInput && data.data?.instagram_url !== undefined) {
				instagramInput.value = String(data.data.instagram_url || '');
			}
			showFeedback(data.message || 'Perfil público guardado.', 'success');
			await checkSlug();
			syncPreview();
		} catch (error) {
			showFeedback(
				error instanceof Error ? error.message : 'No fue posible guardar el perfil.',
				'error'
			);
		} finally {
			if (saveBtn) saveBtn.disabled = false;
		}
	});

	slugInput?.addEventListener('input', () => {
		scheduleSlugCheck();
		syncPreview();
	});
	descInput?.addEventListener('input', syncPreview);
	waToggle?.addEventListener('change', syncPreview);
	waInput?.addEventListener('input', syncPreview);
	facebookInput?.addEventListener('input', syncPreview);
	instagramInput?.addEventListener('input', syncPreview);
	bannerCompress?.addEventListener('change', syncPreview);
	galleryCompress?.addEventListener('change', syncPreview);

	copyBtn?.addEventListener('click', async () => {
		const slug = normalizeSlugInput(slugInput?.value || '');
		const url = slug ? buildOrgHubUrl(bootstrap.siteOrigin, slug) : '';
		if (!url) {
			showFeedback('Definí un enlace antes de copiar.', 'error');
			return;
		}
		try {
			await navigator.clipboard.writeText(url);
			showFeedback('Enlace copiado al portapapeles.', 'success');
		} catch {
			showFeedback('No se pudo copiar el enlace.', 'error');
		}
	});

	logoInput?.addEventListener('change', () => {
		const file = logoInput.files?.[0];
		if (file) void openCrop(file, 'logo');
		logoInput.value = '';
	});

	bannerInput?.addEventListener('change', () => {
		const file = bannerInput.files?.[0];
		if (file) void openCrop(file, 'banner');
		bannerInput.value = '';
	});

	const bindDropzone = (
		zone: HTMLElement | null,
		onFile: (file: File) => void
	) => {
		zone?.addEventListener('dragover', (event) => {
			event.preventDefault();
			zone.classList.add('is-dragging');
		});
		zone?.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
		zone?.addEventListener('drop', (event) => {
			event.preventDefault();
			zone.classList.remove('is-dragging');
			const file = event.dataTransfer?.files?.[0];
			if (file) onFile(file);
		});
	};

	bindDropzone(logoDropzone, (file) => void openCrop(file, 'logo'));
	bindDropzone(bannerDropzone, (file) => void openCrop(file, 'banner'));

	galleryInput?.addEventListener('change', () => {
		if (galleryInput.files?.length) void uploadGalleryFiles(galleryInput.files);
		galleryInput.value = '';
	});

	const reorderGallery = async (id: number, direction: -1 | 1) => {
		const index = galleryItems.findIndex((item) => item.id === id);
		const next = index + direction;
		if (index < 0 || next < 0 || next >= galleryItems.length) return;
		const copy = [...galleryItems];
		const [moved] = copy.splice(index, 1);
		copy.splice(next, 0, moved);
		const ids = copy.map((item) => item.id);
		try {
			const response = await fetch('/api/workspace/gallery', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify({ ids }),
			});
			const data = (await response.json()) as {
				status?: string;
				message?: string;
				data?: { gallery_images?: GalleryItem[] };
			};
			if (!response.ok || data.status !== 'success') {
				throw new Error(data.message || 'No se pudo reordenar la galería.');
			}
			galleryItems = Array.isArray(data.data?.gallery_images) ? data.data.gallery_images : copy;
			renderGalleryGrid();
			syncPreview();
		} catch (error) {
			showFeedback(
				error instanceof Error ? error.message : 'No se pudo reordenar la galería.',
				'error'
			);
		}
	};

	galleryGrid?.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		const removeBtn = target?.closest<HTMLElement>('[data-ppe-gallery-remove]');
		if (removeBtn) {
			const id = Number(removeBtn.dataset.id || 0);
			if (id > 0) void removeGalleryItem(id);
			return;
		}
		const leftBtn = target?.closest<HTMLElement>('[data-ppe-gallery-left]');
		if (leftBtn) {
			const id = Number(leftBtn.dataset.id || 0);
			if (id > 0) void reorderGallery(id, -1);
			return;
		}
		const rightBtn = target?.closest<HTMLElement>('[data-ppe-gallery-right]');
		if (rightBtn) {
			const id = Number(rightBtn.dataset.id || 0);
			if (id > 0) void reorderGallery(id, 1);
		}
	});

	root.querySelectorAll('[data-ppe-crop-close]').forEach((btn) => {
		btn.addEventListener('click', () => closeCrop());
	});
	cropConfirm?.addEventListener('click', () => {
		void applyCropped();
	});
	cropModal?.addEventListener('click', (event) => {
		if (event.target === cropModal) closeCrop();
	});

	renderGalleryGrid();
	syncPreview();
	void checkSlug();
};
