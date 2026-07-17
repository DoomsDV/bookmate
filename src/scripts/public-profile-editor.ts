import {
	ProfileImageCropper,
	isAcceptedProfileImage,
} from '../lib/profile-image-crop';
import { buildOrgHubUrl } from '../lib/public-profile-url';
import { isReservedOrgSlug } from '../lib/reserved-org-slugs';

type Bootstrap = {
	workspace: {
		profile_slug?: string;
		description?: string;
		public_whatsapp?: string;
		logo_url?: string;
		name?: string;
	};
	organizationName: string;
	siteOrigin: string;
	domainLabel: string;
	descMax?: number;
};

const EMPTY_ABOUT = 'Este negocio todavía no agregó una descripción.';

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
	const feedback = root.querySelector<HTMLElement>('[data-ppe-feedback]');
	const saveBtn = root.querySelector<HTMLButtonElement>('[data-ppe-save]');
	const openPublic = root.querySelector<HTMLAnchorElement>('[data-ppe-open-public]');
	const copyBtn = root.querySelector<HTMLButtonElement>('[data-ppe-copy-url]');
	const descMax = Number(bootstrap.descMax || 500);

	const logoInput = root.querySelector<HTMLInputElement>('[data-ppe-logo-input]');
	const logoDropzone = root.querySelector<HTMLElement>('[data-ppe-logo-dropzone]');
	const logoPreview = root.querySelector<HTMLImageElement>('[data-ppe-logo-preview]');
	const logoPlaceholder = root.querySelector<HTMLElement>('[data-ppe-logo-placeholder]');

	const previewLogo = root.querySelector<HTMLImageElement>('[data-ppe-preview-logo]');
	const previewLogoPh = root.querySelector<HTMLElement>('[data-ppe-preview-logo-ph]');
	const previewDesc = root.querySelector<HTMLElement>('[data-ppe-preview-desc]');
	const previewAbout = root.querySelector<HTMLElement>('[data-ppe-preview-about]');
	const previewWa = root.querySelector<HTMLElement>('[data-ppe-preview-wa]');

	const cropModal = root.querySelector<HTMLDialogElement>('[data-ppe-crop-modal]');
	const cropMount = root.querySelector<HTMLElement>('[data-ppe-crop-mount]');
	const cropConfirm = root.querySelector<HTMLButtonElement>('[data-ppe-crop-confirm]');

	let cropper: ProfileImageCropper | null = null;
	let pendingCropName = 'logo.jpg';
	let logoObjectUrl = '';
	let logoBase64 = '';
	let logoName = '';
	let logoMime = '';
	let currentLogoUrl = String(bootstrap.workspace?.logo_url || '').trim();
	let slugCheckTimer: number | null = null;
	let slugAvailable = true;
	let originalSlug = normalizeSlugInput(String(bootstrap.workspace?.profile_slug || ''));

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
		if (previewLogo) {
			if (url) {
				previewLogo.src = url;
				previewLogo.classList.remove('hidden');
			} else {
				previewLogo.classList.add('hidden');
			}
		}
		previewLogoPh?.classList.toggle('hidden', Boolean(url));
	};

	const syncPreview = () => {
		const rawDescription = String(descInput?.value || '');
		const description = rawDescription.trim();
		const hasDescription = rawDescription.length > 0;
		const showWa = Boolean(waToggle?.checked) && digitsOnly(waInput?.value || '').length >= 6;

		if (descCount) descCount.textContent = String(rawDescription.length);

		if (previewDesc) {
			previewDesc.textContent = description;
			previewDesc.classList.toggle('hidden', !hasDescription);
		}
		if (previewAbout) {
			if (hasDescription) {
				previewAbout.textContent = description || rawDescription;
				previewAbout.classList.remove('hub-about-text--empty');
			} else {
				previewAbout.textContent = EMPTY_ABOUT;
				previewAbout.classList.add('hub-about-text--empty');
			}
		}
		previewWa?.classList.toggle('hidden', !showWa);
		waField?.classList.toggle('hidden', !waToggle?.checked);

		const slug = normalizeSlugInput(slugInput?.value || '');
		if (openPublic) {
			const url = slug ? buildOrgHubUrl(bootstrap.siteOrigin, slug) : '#';
			openPublic.href = url;
			openPublic.classList.toggle('opacity-50', !slug);
		}
	};

	const setSlugStatus = (text: string, state: 'ok' | 'bad' | 'pending') => {
		if (!slugStatus) return;
		slugStatus.textContent = text;
		slugStatus.classList.remove('is-ok', 'is-bad', 'is-pending');
		slugStatus.classList.add(`is-${state}`);
		slugRow?.classList.toggle('is-ok', state === 'ok');
		slugRow?.classList.toggle('is-bad', state === 'bad');
		if (slugIcon) slugIcon.hidden = state !== 'ok';
		if (slugHint) {
			// Evita choque visual: con OK solo mostramos el check + mensaje corto.
			slugHint.hidden = state === 'ok';
		}
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
			if (available) {
				setSlugStatus('Disponible', 'ok');
			} else if (reason === 'reserved') {
				setSlugStatus('Ese enlace está reservado por el sistema.', 'bad');
			} else if (reason === 'taken') {
				setSlugStatus('Ese enlace ya está en uso. Probá otro.', 'bad');
			} else {
				setSlugStatus('Enlace no válido.', 'bad');
			}
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

	const openCrop = async (file: File) => {
		if (!cropModal || !cropMount) return;
		if (!isAcceptedProfileImage(file)) {
			showFeedback('Usá una imagen JPG o PNG.', 'error');
			return;
		}
		pendingCropName = file.name || 'logo.jpg';
		cropper?.destroy();
		cropper = new ProfileImageCropper(cropMount);
		await cropper.bindFile(file);
		if (!cropModal.open) cropModal.showModal();
	};

	const closeCrop = () => {
		cropper?.destroy();
		cropper = null;
		cropModal?.close();
	};

	const applyCroppedLogo = async () => {
		if (!cropper) return;
		try {
			const file = await cropper.exportJpeg(pendingCropName);
			logoBase64 = await fileToBase64(file);
			logoName = file.name;
			logoMime = file.type || 'image/jpeg';
			if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
			logoObjectUrl = URL.createObjectURL(file);
			setLogoPreview(logoObjectUrl);
			closeCrop();
			showFeedback('', 'success');
		} catch (error) {
			showFeedback(
				error instanceof Error ? error.message : 'No se pudo recortar el logo.',
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
		};
		if (logoBase64) {
			payload.logo_base64 = logoBase64;
			payload.logo_name = logoName || 'logo.jpg';
			payload.logo_mime = logoMime || 'image/jpeg';
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
				data?: { logo_url?: string; profile_slug?: string };
			};
			if (!response.ok || data.status !== 'success') {
				throw new Error(data.message || 'No fue posible guardar el perfil.');
			}

			originalSlug = normalizeSlugInput(String(data.data?.profile_slug || slug));
			if (slugInput) slugInput.value = originalSlug;
			logoBase64 = '';
			if (data.data?.logo_url) setLogoPreview(String(data.data.logo_url));
			showFeedback(data.message || 'Perfil público guardado.', 'success');
			await checkSlug();
			syncPreview();

			if (originalSlug && originalSlug !== bootstrap.workspace?.profile_slug) {
				// Actualizar cookie/org slug vía recarga suave no es crítico; el hub usa BD.
			}
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
	descInput?.addEventListener('keyup', syncPreview);
	waToggle?.addEventListener('change', syncPreview);
	waInput?.addEventListener('input', syncPreview);

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
		if (file) void openCrop(file);
		logoInput.value = '';
	});

	logoDropzone?.addEventListener('dragover', (event) => {
		event.preventDefault();
		logoDropzone.classList.add('is-dragging');
	});
	logoDropzone?.addEventListener('dragleave', () => {
		logoDropzone.classList.remove('is-dragging');
	});
	logoDropzone?.addEventListener('drop', (event) => {
		event.preventDefault();
		logoDropzone.classList.remove('is-dragging');
		const file = event.dataTransfer?.files?.[0];
		if (file) void openCrop(file);
	});

	root.querySelectorAll('[data-ppe-crop-close]').forEach((btn) => {
		btn.addEventListener('click', () => closeCrop());
	});
	cropConfirm?.addEventListener('click', () => {
		void applyCroppedLogo();
	});
	cropModal?.addEventListener('click', (event) => {
		if (event.target === cropModal) closeCrop();
	});

	syncPreview();
	void checkSlug();
};
