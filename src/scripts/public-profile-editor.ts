import {
	BUSINESS_HOURS_DAY_LABELS,
	BUSINESS_HOURS_MAX_INTERVALS,
	defaultOpenInterval,
	emptyBusinessHours,
	formatBusinessHoursForDisplay,
	parseBusinessHours,
	validateBusinessHours,
	type BusinessHours,
	type BusinessHoursDay,
} from '../lib/business-hours';
import { showFlashMessage } from '../lib/flash';
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
		business_hours?: BusinessHours | string | null;
		gallery_images?: GalleryItem[];
		name?: string;
	};
	organizationName: string;
	siteOrigin: string;
	domainLabel: string;
	descMax?: number;
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

/** Normaliza a HH:mm 24h (acepta H:mm, HH:mm y variantes con AM/PM). */
const normalizeHoursTimeInput = (value: string): string => {
	const raw = String(value || '').trim().toLowerCase().replace(/\./g, ':');
	if (!raw) return '';

	const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)$/i);
	if (ampm) {
		let hour = Number(ampm[1]);
		const minute = Number(ampm[2]);
		const isPm = /p/.test(ampm[3]);
		if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return raw;
		if (isPm && hour < 12) hour += 12;
		if (!isPm && hour === 12) hour = 0;
		if (hour > 23) return raw;
		return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
	}

	const match = raw.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return raw;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
		return raw;
	}
	return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const bindHoursTimeInput = (input: HTMLInputElement, value: string) => {
	input.type = 'text';
	input.inputMode = 'numeric';
	input.placeholder = '09:00';
	input.autocomplete = 'off';
	input.spellcheck = false;
	input.maxLength = 8;
	input.lang = 'es';
	input.setAttribute('pattern', '([01]\\d|2[0-3]):[0-5]\\d');
	input.setAttribute('title', 'Formato 24 h (HH:mm)');
	input.value = value;
};

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
	const hoursList = root.querySelector<HTMLElement>('[data-ppe-hours-list]');
	const saveBtn = root.querySelector<HTMLButtonElement>('[data-ppe-save]');
	const openPublic = root.querySelector<HTMLAnchorElement>('[data-ppe-open-public]');
	const copyBtn = root.querySelector<HTMLButtonElement>('[data-ppe-copy-url]');
	const descMax = Number(bootstrap.descMax || 500);
	let businessHours: BusinessHours = parseBusinessHours(bootstrap.workspace?.business_hours);
	/** Día 1–7 expandido para editar turnos; null = todos colapsados. */
	let expandedHoursDay: number | null = null;
	/** Metadatos del hub público (sucursales/equipo/categorías) cargados en cliente. */
	let previewHubMeta: {
		serviceCategories: string[];
		locationLabel: string;
		teamCount: number;
	} = {
		serviceCategories: [],
		locationLabel: '',
		teamCount: 0,
	};

	const logoInput = root.querySelector<HTMLInputElement>('[data-ppe-logo-input]');
	const logoDropzone = root.querySelector<HTMLElement>('[data-ppe-logo-dropzone]');
	const logoPreview = root.querySelector<HTMLImageElement>('[data-ppe-logo-preview]');
	const logoPlaceholder = root.querySelector<HTMLElement>('[data-ppe-logo-placeholder]');
	const logoChange = root.querySelector<HTMLElement>('[data-ppe-logo-change]');
	const logoClear = root.querySelector<HTMLButtonElement>('[data-ppe-logo-clear]');

	const bannerInput = root.querySelector<HTMLInputElement>('[data-ppe-banner-input]');
	const bannerDropzone = root.querySelector<HTMLElement>('[data-ppe-banner-dropzone]');
	const bannerPreview = root.querySelector<HTMLImageElement>('[data-ppe-banner-preview]');
	const bannerPlaceholder = root.querySelector<HTMLElement>('[data-ppe-banner-placeholder]');
	const bannerChange = root.querySelector<HTMLElement>('[data-ppe-banner-change]');
	const bannerClear = root.querySelector<HTMLButtonElement>('[data-ppe-banner-clear]');

	const galleryGrid = root.querySelector<HTMLElement>('[data-ppe-gallery-grid]');
	const galleryCount = root.querySelector<HTMLElement>('[data-ppe-gallery-count]');
	const galleryInput = root.querySelector<HTMLInputElement>('[data-ppe-gallery-input]');
	const galleryDropzone = root.querySelector<HTMLElement>('[data-ppe-gallery-add]');
	const galleryPreviewModal = root.querySelector<HTMLDialogElement>('[data-ppe-gallery-preview-modal]');
	const galleryPreviewList = root.querySelector<HTMLElement>('[data-ppe-gallery-preview-list]');
	const galleryPreviewSub = root.querySelector<HTMLElement>('[data-ppe-gallery-preview-sub]');
	const galleryPreviewConfirm = root.querySelector<HTMLButtonElement>('[data-ppe-gallery-preview-confirm]');
	const galleryPreviewConfirmLabel = root.querySelector<HTMLElement>(
		'[data-ppe-gallery-preview-confirm-label]'
	);
	const lightbox = root.querySelector<HTMLDialogElement>('[data-ppe-lightbox]');
	const lightboxImage = root.querySelector<HTMLImageElement>('[data-ppe-lightbox-image]');
	const lightboxCaption = root.querySelector<HTMLElement>('[data-ppe-lightbox-caption]');
	const lightboxPrev = root.querySelector<HTMLButtonElement>('[data-ppe-lightbox-prev]');
	const lightboxNext = root.querySelector<HTMLButtonElement>('[data-ppe-lightbox-next]');
	const tabButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-ppe-tab]'));
	const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-ppe-panel]'));

	const cropModal = root.querySelector<HTMLDialogElement>('[data-ppe-crop-modal]');
	const cropSheet = root.querySelector<HTMLElement>('[data-ppe-crop-sheet]');
	const cropMount = root.querySelector<HTMLElement>('[data-ppe-crop-mount]');
	const cropConfirm = root.querySelector<HTMLButtonElement>('[data-ppe-crop-confirm]');
	const cropTitle = root.querySelector<HTMLElement>('[data-ppe-crop-title]');
	const cropHint = root.querySelector<HTMLElement>('[data-ppe-crop-hint]');
	const cropCompressWrap = root.querySelector<HTMLElement>('[data-ppe-crop-compress-wrap]');
	const cropCompress = root.querySelector<HTMLInputElement>('[data-ppe-crop-compress]');
	const cropCompressHint = root.querySelector<HTMLElement>('[data-ppe-crop-compress-hint]');

	let cropper: ProfileImageCropper | null = null;
	let cropMode: ProfileCropMode = 'logo';
	let pendingCropName = 'logo.jpg';
	let bannerCompress = false;
	let logoObjectUrl = '';
	let logoBase64 = '';
	let logoName = '';
	let logoMime = '';
	let logoCleared = false;
	let bannerObjectUrl = '';
	let bannerBase64 = '';
	let bannerName = '';
	let bannerMime = '';
	let bannerCleared = false;
	let currentLogoUrl = String(bootstrap.workspace?.logo_url || '').trim();
	let currentBannerUrl = String(bootstrap.workspace?.banner_url || '').trim();
	let galleryItems: GalleryItem[] = Array.isArray(bootstrap.workspace?.gallery_images)
		? [...bootstrap.workspace.gallery_images]
		: [];
	type PendingGalleryFile = { id: string; file: File; url: string; compress: boolean };
	let pendingGalleryFiles: PendingGalleryFile[] = [];
	let galleryUploadBusy = false;
	let lightboxIndex = 0;
	let slugCheckTimer: number | null = null;
	let slugAvailable = true;
	let originalSlug = normalizeSlugInput(String(bootstrap.workspace?.profile_slug || ''));
	const initials = initialsFromName(bootstrap.organizationName);

	const showFeedback = (message: string, kind: 'success' | 'error') => {
		const text = String(message || '').trim();
		if (!text) return;
		showFlashMessage({ message: text, type: kind, autoHideMs: 4000 });
	};

	const syncSidebarLogo = (url: string) => {
		const cleanUrl = String(url || '').trim();
		document.querySelectorAll<HTMLElement>('[data-workspace-avatar]').forEach((avatar) => {
			avatar.classList.toggle('workspace-avatar--has-logo', Boolean(cleanUrl));
			avatar.classList.toggle('workspace-avatar--empty', !cleanUrl);

			let img = avatar.querySelector<HTMLImageElement>('img.workspace-logo-image');
			if (cleanUrl) {
				if (!img) {
					img = document.createElement('img');
					img.className = 'workspace-logo-image size-full object-cover';
					img.alt = '';
					img.loading = 'eager';
					img.onerror = () => {
						img?.classList.add('is-hidden');
						img?.removeAttribute('src');
					};
					avatar.appendChild(img);
				}
				img.classList.remove('is-hidden');
				if (img.src !== cleanUrl) img.src = cleanUrl;
			} else if (img) {
				img.removeAttribute('src');
				img.classList.add('is-hidden');
			}
		});
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
		logoChange?.classList.toggle('hidden', !url);
		logoClear?.classList.toggle('hidden', !url);
		logoDropzone?.classList.toggle('has-preview', Boolean(url));
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
		bannerChange?.classList.toggle('hidden', !url);
		bannerClear?.classList.toggle('hidden', !url);
		bannerDropzone?.classList.toggle('has-preview', Boolean(url));
	};

	const PPE_TAB_IDS = new Set(
		tabButtons.map((btn) => String(btn.dataset.ppeTab || '')).filter(Boolean)
	);

	const activateTab = (tabId: string) => {
		const nextId = PPE_TAB_IDS.has(tabId) ? tabId : 'general';
		for (const btn of tabButtons) {
			const active = btn.dataset.ppeTab === nextId;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-selected', active ? 'true' : 'false');
			btn.tabIndex = active ? 0 : -1;
		}
		for (const panel of panels) {
			panel.hidden = panel.dataset.ppePanel !== nextId;
		}
		// Solo en esta visita a la página (no localStorage): ayuda al CSS de pestañas.
		document.documentElement.setAttribute('data-ppe-tab-pref', nextId);
	};

	const restoreActiveTab = () => {
		// Al entrar / volver a perfil-publico siempre General.
		activateTab('general');
	};

	const syncLightbox = () => {
		const item = galleryItems[lightboxIndex];
		if (!item || !lightboxImage) return;
		lightboxImage.src = item.url;
		lightboxImage.alt = `Foto ${lightboxIndex + 1} de ${galleryItems.length}`;
		if (lightboxCaption) {
			lightboxCaption.textContent = `${lightboxIndex + 1} / ${galleryItems.length}`;
		}
		const atStart = lightboxIndex <= 0;
		const atEnd = lightboxIndex >= galleryItems.length - 1;
		if (lightboxPrev) {
			lightboxPrev.disabled = atStart;
			lightboxPrev.hidden = galleryItems.length <= 1;
		}
		if (lightboxNext) {
			lightboxNext.disabled = atEnd;
			lightboxNext.hidden = galleryItems.length <= 1;
		}
	};

	const openLightbox = (id: number) => {
		const index = galleryItems.findIndex((item) => item.id === id);
		if (index < 0 || !lightbox) return;
		lightboxIndex = index;
		syncLightbox();
		if (!lightbox.open) lightbox.showModal();
	};

	const closeLightbox = () => {
		lightbox?.close();
		if (lightboxImage) {
			lightboxImage.removeAttribute('src');
			lightboxImage.alt = '';
		}
	};

	const stepLightbox = (delta: -1 | 1) => {
		const next = lightboxIndex + delta;
		if (next < 0 || next >= galleryItems.length) return;
		lightboxIndex = next;
		syncLightbox();
	};

	const renderGalleryGrid = () => {
		if (!galleryGrid) return;
		galleryGrid.replaceChildren();
		for (const item of galleryItems) {
			const li = document.createElement('li');
			li.className = 'ppe-gallery-item';
			li.dataset.ppeGalleryItem = '';
			li.dataset.id = String(item.id);

			const openBtn = document.createElement('button');
			openBtn.type = 'button';
			openBtn.className = 'ppe-gallery-item__open';
			openBtn.dataset.ppeGalleryOpen = '';
			openBtn.dataset.id = String(item.id);
			openBtn.setAttribute('aria-label', 'Ver foto');

			const img = document.createElement('img');
			img.src = item.url;
			img.alt = '';
			openBtn.appendChild(img);

			const removeBtn = document.createElement('button');
			removeBtn.type = 'button';
			removeBtn.className = 'ppe-gallery-item__remove';
			removeBtn.dataset.ppeGalleryRemove = '';
			removeBtn.dataset.id = String(item.id);
			removeBtn.setAttribute('aria-label', 'Eliminar foto');
			const removeIcon = document.createElement('span');
			removeIcon.className = 'material-symbols-rounded';
			removeIcon.setAttribute('aria-hidden', 'true');
			removeIcon.textContent = 'delete';
			removeBtn.appendChild(removeIcon);

			li.append(openBtn, removeBtn);
			galleryGrid.appendChild(li);
		}
		if (galleryCount) galleryCount.textContent = `(${galleryItems.length})`;
		if (lightbox?.open) {
			if (!galleryItems.length) {
				closeLightbox();
			} else {
				lightboxIndex = Math.min(lightboxIndex, galleryItems.length - 1);
				syncLightbox();
			}
		}
	};

	const formatHoursDaySummary = (day: BusinessHoursDay): string => {
		if (day.closed || !day.intervals.length) return 'Cerrado';
		return day.intervals.map((interval) => `${interval.start}–${interval.end}`).join(' · ');
	};

	const renderBusinessHours = () => {
		if (!hoursList) return;
		hoursList.replaceChildren();

		if (
			expandedHoursDay != null &&
			(businessHours.days[expandedHoursDay - 1]?.closed ?? true)
		) {
			expandedHoursDay = null;
		}

		for (const day of businessHours.days) {
			const dayLabel = BUSINESS_HOURS_DAY_LABELS[day.day - 1] || `Día ${day.day}`;
			const isExpanded = !day.closed && expandedHoursDay === day.day;
			const li = document.createElement('li');
			li.className = day.closed
				? 'ppe-hours-day is-closed'
				: isExpanded
					? 'ppe-hours-day is-open is-expanded'
					: 'ppe-hours-day is-open is-collapsed';
			li.dataset.day = String(day.day);

			const head = document.createElement('div');
			head.className = 'ppe-hours-day__head';

			if (day.closed) {
				const name = document.createElement('span');
				name.className = 'ppe-hours-day__name';
				name.textContent = dayLabel;
				head.appendChild(name);
			} else {
				const leadBtn = document.createElement('button');
				leadBtn.type = 'button';
				leadBtn.className = 'ppe-hours-day__lead';
				leadBtn.setAttribute('data-ppe-hours-fold', String(day.day));
				leadBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
				leadBtn.setAttribute(
					'aria-label',
					isExpanded
						? `Ocultar horarios de ${dayLabel}`
						: `Editar horarios de ${dayLabel}`
				);
				const name = document.createElement('span');
				name.className = 'ppe-hours-day__name';
				name.textContent = dayLabel;
				const chevron = document.createElement('span');
				chevron.className = 'material-symbols-rounded ppe-hours-day__chevron';
				chevron.setAttribute('aria-hidden', 'true');
				chevron.textContent = isExpanded ? 'expand_less' : 'expand_more';
				leadBtn.append(name, chevron);
				head.appendChild(leadBtn);
			}

			const toggleWrap = document.createElement('label');
			toggleWrap.className = 'ppe-hours-toggle';
			const switchEl = document.createElement('span');
			switchEl.className = 'ppe-switch';
			const toggle = document.createElement('input');
			toggle.type = 'checkbox';
			toggle.checked = !day.closed;
			toggle.setAttribute('data-ppe-hours-open', String(day.day));
			toggle.setAttribute(
				'aria-label',
				`${dayLabel}: ${day.closed ? 'Cerrado' : 'Abierto'}`
			);
			const track = document.createElement('span');
			track.className = 'ppe-switch__track';
			track.setAttribute('aria-hidden', 'true');
			switchEl.append(toggle, track);
			const toggleText = document.createElement('span');
			toggleText.className = 'ppe-hours-toggle__label';
			toggleText.textContent = day.closed ? 'Cerrado' : 'Abierto';
			toggleWrap.append(switchEl, toggleText);
			head.appendChild(toggleWrap);
			li.appendChild(head);

			if (!day.closed && !isExpanded) {
				const summary = document.createElement('p');
				summary.className = 'ppe-hours-summary';
				summary.textContent = formatHoursDaySummary(day);
				li.appendChild(summary);
			}

			if (!day.closed && isExpanded) {
				const intervalsWrap = document.createElement('div');
				intervalsWrap.className = 'ppe-hours-intervals';

				day.intervals.forEach((interval, index) => {
					const row = document.createElement('div');
					row.className = 'ppe-hours-interval';

					const start = document.createElement('input');
					start.className = 'ppe-input ppe-hours-interval__time';
					bindHoursTimeInput(start, interval.start);
					start.setAttribute('data-ppe-hours-start', String(day.day));
					start.dataset.index = String(index);

					const sep = document.createElement('span');
					sep.className = 'ppe-hours-interval__sep';
					sep.textContent = 'a';

					const end = document.createElement('input');
					end.className = 'ppe-input ppe-hours-interval__time';
					bindHoursTimeInput(end, interval.end);
					end.setAttribute('data-ppe-hours-end', String(day.day));
					end.dataset.index = String(index);

					row.append(start, sep, end);

					if (day.intervals.length > 1) {
						const removeBtn = document.createElement('button');
						removeBtn.type = 'button';
						removeBtn.className = 'ppe-hours-remove';
						removeBtn.setAttribute('data-ppe-hours-remove', String(day.day));
						removeBtn.dataset.index = String(index);
						removeBtn.setAttribute('aria-label', 'Quitar turno');
						removeBtn.innerHTML =
							'<span class="material-symbols-rounded" aria-hidden="true">close</span>';
						row.appendChild(removeBtn);
					} else {
						const spacer = document.createElement('span');
						spacer.className = 'ppe-hours-remove-spacer';
						spacer.setAttribute('aria-hidden', 'true');
						row.appendChild(spacer);
					}

					intervalsWrap.appendChild(row);
				});

				if (day.intervals.length < BUSINESS_HOURS_MAX_INTERVALS) {
					const addBtn = document.createElement('button');
					addBtn.type = 'button';
					addBtn.className = 'ppe-hours-add';
					addBtn.setAttribute('data-ppe-hours-add', String(day.day));
					addBtn.innerHTML =
						'<span class="material-symbols-rounded" aria-hidden="true">add</span> Agregar turno';
					intervalsWrap.appendChild(addBtn);
				}

				li.appendChild(intervalsWrap);
			}

			hoursList.appendChild(li);
		}
	};

	const getDay = (dayNum: number): BusinessHoursDay =>
		businessHours.days[dayNum - 1] || emptyBusinessHours().days[dayNum - 1];

	const syncPreview = () => {
		const rawDescription = String(descInput?.value || '');
		const description = rawDescription.trim();
		const showWa = Boolean(waToggle?.checked) && digitsOnly(waInput?.value || '').length >= 6;

		if (descCount) descCount.textContent = String(rawDescription.length);
		waField?.classList.toggle('hidden', !waToggle?.checked);

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
			businessHoursRows: formatBusinessHoursForDisplay(businessHours),
			serviceCategories: previewHubMeta.serviceCategories,
			locationLabel: previewHubMeta.locationLabel,
			teamCount: previewHubMeta.teamCount,
		});
	};

	const enrichPreviewFromHub = async () => {
		const slug = normalizeSlugInput(
			slugInput?.value || bootstrap.workspace?.profile_slug || ''
		);
		if (!slug) return;
		try {
			const res = await fetch(`/api/public/org/${encodeURIComponent(slug)}`);
			const data = await res.json().catch(() => ({}));
			if (!res.ok || data?.status !== 'success' || !data?.data) return;
			const hub = data.data as {
				locations?: Array<{ name?: string; address?: string }>;
				professionals?: unknown[];
				service_categories?: string[];
			};
			const locs = Array.isArray(hub.locations) ? hub.locations : [];
			let locationLabel = '';
			if (locs.length === 1) {
				locationLabel = String(locs[0]?.name || locs[0]?.address || '').trim();
			} else if (locs.length > 1) {
				locationLabel = `${locs.length} sucursales`;
			}
			previewHubMeta = {
				serviceCategories: Array.isArray(hub.service_categories)
					? hub.service_categories.map((c) => String(c || '').trim()).filter(Boolean)
					: [],
				locationLabel,
				teamCount: Array.isArray(hub.professionals) ? hub.professionals.length : 0,
			};
			syncPreview();
		} catch {
			/* preview enrichment is best-effort */
		}
	};

	const clearBannerPreview = () => {
		if (bannerObjectUrl) {
			URL.revokeObjectURL(bannerObjectUrl);
			bannerObjectUrl = '';
		}
		bannerBase64 = '';
		bannerName = '';
		bannerMime = '';
		bannerCleared = true;
		if (bannerInput) bannerInput.value = '';
		setBannerPreview('');
		syncPreview();
	};

	const clearLogoPreview = () => {
		if (logoObjectUrl) {
			URL.revokeObjectURL(logoObjectUrl);
			logoObjectUrl = '';
		}
		logoBase64 = '';
		logoName = '';
		logoMime = '';
		logoCleared = true;
		if (logoInput) logoInput.value = '';
		setLogoPreview('');
		syncPreview();
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

	const syncCropCompressHint = () => {
		cropCompressHint?.toggleAttribute('hidden', Boolean(cropCompress?.checked));
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
		if (cropHint) {
			cropHint.textContent =
				mode === 'banner'
					? 'El marco es lo que se verá arriba del perfil (proporción 2:1). Arrastrá para mover y usá el control para acercar o alejar.'
					: 'Arrastrá la imagen para centrarla y usá el control para acercar o alejar.';
		}
		// La compresión server-side aplica al banner; el logo ya sale del recorte listo.
		cropCompressWrap?.toggleAttribute('hidden', mode !== 'banner');
		if (cropCompress && mode === 'banner') {
			cropCompress.checked = bannerCompress;
		}
		syncCropCompressHint();
		cropSheet?.classList.toggle('ppe-crop-modal__sheet--banner', mode === 'banner');
		cropSheet?.classList.toggle('ppe-crop-modal__sheet--logo', mode === 'logo');
		cropper?.destroy();
		cropper = null;

		// Abrir primero: Croppie necesita el ancho real del modal para no quedar en negro
		if (!cropModal.open) cropModal.showModal();
		cropper = new ProfileImageCropper(cropMount, 512, mode);
		try {
			await cropper.bindFile(file);
		} catch (error) {
			closeCrop();
			showFeedback(
				error instanceof Error ? error.message : 'No se pudo abrir el recorte.',
				'error'
			);
		}
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
			const compress = Boolean(cropCompress?.checked);
			if (cropMode === 'banner') {
				bannerCompress = compress;
				bannerBase64 = base64;
				bannerName = file.name;
				bannerMime = file.type || 'image/jpeg';
				bannerCleared = false;
				if (bannerObjectUrl) URL.revokeObjectURL(bannerObjectUrl);
				bannerObjectUrl = URL.createObjectURL(file);
				setBannerPreview(bannerObjectUrl);
			} else {
				logoBase64 = base64;
				logoName = file.name;
				logoMime = file.type || 'image/png';
				logoCleared = false;
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

	/** Snapshot del formulario para advertir al salir/refrescar sin guardar. */
	const getEditorSnapshot = () =>
		JSON.stringify({
			slug: normalizeSlugInput(slugInput?.value || ''),
			description: String(descInput?.value || '').trim(),
			whatsapp: buildWhatsappPayload(),
			waEnabled: Boolean(waToggle?.checked),
			facebook: String(facebookInput?.value || '').trim(),
			instagram: String(instagramInput?.value || '').trim(),
			hours: businessHours,
			logoPending: Boolean(logoBase64),
			logoCleared,
			bannerPending: Boolean(bannerBase64),
			bannerCleared,
			galleryPending: pendingGalleryFiles.length,
		});

	let savedEditorSnapshot = '';
	const captureSavedSnapshot = () => {
		savedEditorSnapshot = getEditorSnapshot();
	};
	const hasUnsavedChanges = () =>
		Boolean(savedEditorSnapshot) && getEditorSnapshot() !== savedEditorSnapshot;

	const UNSAVED_LEAVE_MESSAGE =
		'Tenés cambios sin guardar en el Perfil Público. Si salís o actualizás la página, se van a perder.';

	const onBeforeUnload = (event: BeforeUnloadEvent) => {
		if (!hasUnsavedChanges()) return;
		event.preventDefault();
		event.returnValue = UNSAVED_LEAVE_MESSAGE;
	};

	const onAstroBeforePreparation = (event: Event) => {
		if (!hasUnsavedChanges()) return;
		const ok = window.confirm(
			`${UNSAVED_LEAVE_MESSAGE}\n\n¿Querés salir de todos modos?`
		);
		if (!ok) {
			event.preventDefault();
		}
	};

	window.addEventListener('beforeunload', onBeforeUnload);
	document.addEventListener('astro:before-preparation', onAstroBeforePreparation);
	document.addEventListener(
		'astro:before-swap',
		() => {
			window.removeEventListener('beforeunload', onBeforeUnload);
			document.removeEventListener('astro:before-preparation', onAstroBeforePreparation);
		},
		{ once: true }
	);

	const clearPendingGalleryFiles = () => {
		for (const item of pendingGalleryFiles) {
			URL.revokeObjectURL(item.url);
		}
		pendingGalleryFiles = [];
	};

	const syncGalleryPreviewUi = () => {
		const count = pendingGalleryFiles.length;
		if (galleryPreviewSub) {
			galleryPreviewSub.textContent =
				count === 1
					? '1 foto lista para subir.'
					: `${count} fotos listas para subir.`;
		}
		if (galleryPreviewConfirmLabel) {
			galleryPreviewConfirmLabel.textContent = count === 1 ? 'Subir foto' : 'Subir fotos';
		}
		if (galleryPreviewConfirm) {
			galleryPreviewConfirm.disabled = count === 0 || galleryUploadBusy;
		}
	};

	const renderGalleryPreviewList = () => {
		if (!galleryPreviewList) return;
		galleryPreviewList.replaceChildren();
		for (const item of pendingGalleryFiles) {
			const li = document.createElement('li');
			li.className = 'ppe-gallery-preview-item';
			li.dataset.pendingId = item.id;

			const media = document.createElement('div');
			media.className = 'ppe-gallery-preview-item__media';

			const img = document.createElement('img');
			img.src = item.url;
			img.alt = item.file.name || 'Vista previa';

			const removeBtn = document.createElement('button');
			removeBtn.type = 'button';
			removeBtn.className = 'ppe-gallery-preview-item__remove';
			removeBtn.dataset.ppeGalleryPreviewRemove = item.id;
			removeBtn.setAttribute('aria-label', 'Quitar de la vista previa');
			const icon = document.createElement('span');
			icon.className = 'material-symbols-rounded';
			icon.setAttribute('aria-hidden', 'true');
			icon.textContent = 'delete';
			removeBtn.appendChild(icon);
			media.append(img, removeBtn);

			const compressLabel = document.createElement('label');
			compressLabel.className = 'ppe-gallery-preview-item__compress';
			const compressInput = document.createElement('input');
			compressInput.type = 'checkbox';
			compressInput.checked = item.compress;
			compressInput.dataset.ppeGalleryPreviewCompress = item.id;
			const compressText = document.createElement('span');
			compressText.textContent = 'Comprimir';
			compressLabel.append(compressInput, compressText);

			const compressHint = document.createElement('p');
			compressHint.className = 'ppe-gallery-preview-item__compress-hint';
			compressHint.hidden = item.compress;
			compressHint.textContent = 'Sin comprimir puede cargar más lento.';

			li.append(media, compressLabel, compressHint);
			galleryPreviewList.appendChild(li);
		}
		syncGalleryPreviewUi();
	};

	const closeGalleryPreview = () => {
		if (galleryUploadBusy) return;
		clearPendingGalleryFiles();
		renderGalleryPreviewList();
		galleryPreviewModal?.close();
	};

	const openGalleryPreview = (files: FileList | File[]) => {
		const list = Array.from(files);
		if (!list.length) return;

		const accepted: File[] = [];
		let rejectedType = false;
		for (const file of list) {
			if (!isAcceptedProfileImage(file)) {
				rejectedType = true;
				continue;
			}
			accepted.push(file);
		}

		if (!accepted.length) {
			showFeedback('Usá imágenes JPG o PNG en la galería.', 'error');
			return;
		}

		if (list.length > accepted.length && rejectedType) {
			showFeedback(
				`Solo se previsualizan ${accepted.length} foto(s) válidas (JPG/PNG).`,
				'error'
			);
		}

		clearPendingGalleryFiles();
		pendingGalleryFiles = accepted.map((file, index) => ({
			id: `${Date.now()}-${index}-${file.name}`,
			file,
			url: URL.createObjectURL(file),
			compress: false,
		}));
		renderGalleryPreviewList();
		if (galleryPreviewModal && !galleryPreviewModal.open) {
			galleryPreviewModal.showModal();
		}
	};

	const uploadGalleryFiles = async (items: PendingGalleryFile[]) => {
		if (!items.length) return;

		let uploaded = 0;
		for (const item of items) {
			if (!isAcceptedProfileImage(item.file)) {
				showFeedback('Usá imágenes JPG o PNG en la galería.', 'error');
				continue;
			}
			const formData = new FormData();
			formData.append('file', item.file);
			formData.append('compress', item.compress ? 'true' : 'false');
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
				uploaded += 1;
				renderGalleryGrid();
				syncPreview();
			} catch (error) {
				showFeedback(
					error instanceof Error ? error.message : 'No se pudo subir la foto.',
					'error'
				);
				break;
			}
		}
		if (uploaded > 0) {
			showFeedback(
				uploaded === 1
					? 'Foto agregada a la galería.'
					: `${uploaded} fotos agregadas a la galería.`,
				'success'
			);
		}
	};

	const confirmGalleryPreviewUpload = async () => {
		if (galleryUploadBusy || !pendingGalleryFiles.length) return;
		galleryUploadBusy = true;
		galleryPreviewConfirm?.classList.add('ppe-gallery-preview-modal__actions-busy');
		syncGalleryPreviewUi();
		const items = [...pendingGalleryFiles];
		try {
			await uploadGalleryFiles(items);
			clearPendingGalleryFiles();
			renderGalleryPreviewList();
			galleryPreviewModal?.close();
		} finally {
			galleryUploadBusy = false;
			galleryPreviewConfirm?.classList.remove('ppe-gallery-preview-modal__actions-busy');
			syncGalleryPreviewUi();
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

		const hoursCheck = validateBusinessHours(businessHours);
		if (!hoursCheck.ok) {
			showFeedback(hoursCheck.message, 'error');
			activateTab('horario');
			return;
		}

		const payload: Record<string, unknown> = {
			profile_slug: slug,
			description: String(descInput?.value || '').trim().slice(0, descMax),
			public_whatsapp: buildWhatsappPayload(),
			facebook_url: String(facebookInput?.value || '').trim(),
			instagram_url: String(instagramInput?.value || '').trim(),
			business_hours: businessHours,
			compress_banner: bannerCompress ? 'true' : 'false',
		};
		if (logoBase64) {
			payload.logo_base64 = logoBase64;
			payload.logo_name = logoName || 'logo.jpg';
			payload.logo_mime = logoMime || 'image/png';
		} else if (logoCleared) {
			payload.clear_logo = 1;
		}
		if (bannerBase64) {
			payload.banner_base64 = bannerBase64;
			payload.banner_name = bannerName || 'banner.jpg';
			payload.banner_mime = bannerMime || 'image/jpeg';
		} else if (bannerCleared) {
			payload.clear_banner = 1;
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
					business_hours?: BusinessHours | string | null;
					gallery_images?: GalleryItem[];
				};
			};
			if (!response.ok || data.status !== 'success') {
				throw new Error(data.message || 'No fue posible guardar el perfil.');
			}

			originalSlug = normalizeSlugInput(String(data.data?.profile_slug || slug));
			if (slugInput) slugInput.value = originalSlug;
			logoBase64 = '';
			logoCleared = false;
			bannerBase64 = '';
			bannerCleared = false;
			const savedLogoUrl = String(data.data?.logo_url || '').trim();
			setLogoPreview(savedLogoUrl);
			syncSidebarLogo(savedLogoUrl);
			setBannerPreview(String(data.data?.banner_url || '').trim());
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
			if (data.data && Object.prototype.hasOwnProperty.call(data.data, 'business_hours')) {
				businessHours = parseBusinessHours(data.data.business_hours);
				renderBusinessHours();
			}
			showFeedback(data.message || 'Perfil público guardado.', 'success');
			await checkSlug();
			syncPreview();
			captureSavedSnapshot();
		} catch (error) {
			showFeedback(
				error instanceof Error ? error.message : 'No fue posible guardar el perfil.',
				'error'
			);
		} finally {
			if (saveBtn) saveBtn.disabled = false;
		}
	});

	hoursList?.addEventListener('change', (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) return;

		const openToggle = target.closest<HTMLInputElement>('[data-ppe-hours-open]');
		if (openToggle) {
			const dayNum = Number(openToggle.getAttribute('data-ppe-hours-open') || 0);
			const day = getDay(dayNum);
			if (!dayNum) return;
			day.closed = !openToggle.checked;
			if (day.closed) {
				day.intervals = [];
				if (expandedHoursDay === dayNum) expandedHoursDay = null;
			} else {
				if (!day.intervals.length) day.intervals = [defaultOpenInterval()];
				expandedHoursDay = dayNum;
			}
			businessHours.days[dayNum - 1] = day;
			renderBusinessHours();
			syncPreview();
			return;
		}

		const startInput = target.closest<HTMLInputElement>('[data-ppe-hours-start]');
		if (startInput) {
			const dayNum = Number(startInput.getAttribute('data-ppe-hours-start') || 0);
			const index = Number(startInput.dataset.index || 0);
			const day = getDay(dayNum);
			if (day.intervals[index]) {
				const normalized = normalizeHoursTimeInput(startInput.value) || '09:00';
				startInput.value = normalized;
				day.intervals[index].start = normalized;
				businessHours.days[dayNum - 1] = day;
				syncPreview();
			}
			return;
		}

		const endInput = target.closest<HTMLInputElement>('[data-ppe-hours-end]');
		if (endInput) {
			const dayNum = Number(endInput.getAttribute('data-ppe-hours-end') || 0);
			const index = Number(endInput.dataset.index || 0);
			const day = getDay(dayNum);
			if (day.intervals[index]) {
				const normalized = normalizeHoursTimeInput(endInput.value) || '18:00';
				endInput.value = normalized;
				day.intervals[index].end = normalized;
				businessHours.days[dayNum - 1] = day;
				syncPreview();
			}
		}
	});

	hoursList?.addEventListener('blur', (event) => {
		const target = event.target as HTMLElement | null;
		const timeInput = target?.closest<HTMLInputElement>(
			'[data-ppe-hours-start], [data-ppe-hours-end]'
		);
		if (!timeInput) return;
		const normalized = normalizeHoursTimeInput(timeInput.value);
		if (normalized && normalized !== timeInput.value) {
			timeInput.value = normalized;
			timeInput.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}, true);

	hoursList?.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) return;

		const foldBtn = target.closest<HTMLElement>('[data-ppe-hours-fold]');
		if (foldBtn) {
			const dayNum = Number(foldBtn.getAttribute('data-ppe-hours-fold') || 0);
			if (!dayNum) return;
			expandedHoursDay = expandedHoursDay === dayNum ? null : dayNum;
			renderBusinessHours();
			return;
		}

		const addBtn = target.closest<HTMLElement>('[data-ppe-hours-add]');
		if (addBtn) {
			const dayNum = Number(addBtn.getAttribute('data-ppe-hours-add') || 0);
			const day = getDay(dayNum);
			if (day.closed || day.intervals.length >= BUSINESS_HOURS_MAX_INTERVALS) return;
			const last = day.intervals[day.intervals.length - 1];
			day.intervals.push(
				last
					? { start: last.end, end: '20:00' }
					: defaultOpenInterval()
			);
			businessHours.days[dayNum - 1] = day;
			expandedHoursDay = dayNum;
			renderBusinessHours();
			syncPreview();
			return;
		}

		const removeBtn = target.closest<HTMLElement>('[data-ppe-hours-remove]');
		if (removeBtn) {
			const dayNum = Number(removeBtn.getAttribute('data-ppe-hours-remove') || 0);
			const index = Number(removeBtn.dataset.index || 0);
			const day = getDay(dayNum);
			if (day.intervals.length <= 1) return;
			day.intervals.splice(index, 1);
			businessHours.days[dayNum - 1] = day;
			expandedHoursDay = dayNum;
			renderBusinessHours();
			syncPreview();
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
	cropCompress?.addEventListener('change', syncCropCompressHint);

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

	logoClear?.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		clearLogoPreview();
	});

	root.querySelectorAll<HTMLButtonElement>('[data-ppe-logo-bg]').forEach((btn) => {
		btn.addEventListener('click', (event) => {
			event.preventDefault();
			const mode = btn.dataset.ppeLogoBg === 'dark' ? 'dark' : 'light';
			logoDropzone?.setAttribute('data-ppe-logo-bg', mode);
			root.querySelectorAll<HTMLButtonElement>('[data-ppe-logo-bg]').forEach((item) => {
				const active = item.dataset.ppeLogoBg === mode;
				item.classList.toggle('is-active', active);
				item.setAttribute('aria-pressed', active ? 'true' : 'false');
			});
		});
	});

	bannerInput?.addEventListener('change', () => {
		const file = bannerInput.files?.[0];
		if (file) void openCrop(file, 'banner');
		bannerInput.value = '';
	});

	bannerClear?.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		clearBannerPreview();
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

	galleryDropzone?.addEventListener('dragover', (event) => {
		event.preventDefault();
		galleryDropzone.classList.add('is-dragging');
	});
	galleryDropzone?.addEventListener('dragleave', () => {
		galleryDropzone.classList.remove('is-dragging');
	});
	galleryDropzone?.addEventListener('drop', (event) => {
		event.preventDefault();
		galleryDropzone.classList.remove('is-dragging');
		const files = event.dataTransfer?.files;
		if (files?.length) openGalleryPreview(files);
	});

	galleryInput?.addEventListener('change', () => {
		if (galleryInput.files?.length) openGalleryPreview(galleryInput.files);
		galleryInput.value = '';
	});

	galleryPreviewList?.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		const removeBtn = target?.closest<HTMLElement>('[data-ppe-gallery-preview-remove]');
		if (!removeBtn || galleryUploadBusy) return;
		const id = String(removeBtn.dataset.ppeGalleryPreviewRemove || '');
		const index = pendingGalleryFiles.findIndex((item) => item.id === id);
		if (index < 0) return;
		URL.revokeObjectURL(pendingGalleryFiles[index].url);
		pendingGalleryFiles.splice(index, 1);
		renderGalleryPreviewList();
		if (!pendingGalleryFiles.length) closeGalleryPreview();
	});

	galleryPreviewList?.addEventListener('change', (event) => {
		const target = event.target as HTMLElement | null;
		const compressInput = target?.closest<HTMLInputElement>(
			'[data-ppe-gallery-preview-compress]'
		);
		if (!compressInput || galleryUploadBusy) return;
		const id = String(compressInput.dataset.ppeGalleryPreviewCompress || '');
		const item = pendingGalleryFiles.find((entry) => entry.id === id);
		if (!item) return;
		item.compress = compressInput.checked;
		const card = compressInput.closest<HTMLElement>('.ppe-gallery-preview-item');
		const hint = card?.querySelector<HTMLElement>('.ppe-gallery-preview-item__compress-hint');
		if (hint) hint.hidden = item.compress;
	});

	root.querySelectorAll('[data-ppe-gallery-preview-close]').forEach((btn) => {
		btn.addEventListener('click', () => closeGalleryPreview());
	});
	galleryPreviewConfirm?.addEventListener('click', () => {
		void confirmGalleryPreviewUpload();
	});
	galleryPreviewModal?.addEventListener('click', (event) => {
		if (event.target === galleryPreviewModal) closeGalleryPreview();
	});
	galleryPreviewModal?.addEventListener('cancel', (event) => {
		if (galleryUploadBusy) {
			event.preventDefault();
			return;
		}
		clearPendingGalleryFiles();
		renderGalleryPreviewList();
	});

	const previewModal = root.querySelector<HTMLDialogElement>('[data-ppe-preview-modal]');
	const openPreviewButtons = Array.from(
		root.querySelectorAll<HTMLButtonElement>('[data-ppe-open-preview]')
	);
	const closePreviewButtons = Array.from(
		root.querySelectorAll<HTMLButtonElement>('[data-ppe-close-preview]')
	);

	const openPreviewModal = () => {
		if (!previewModal || previewModal.open) return;
		previewModal.showModal();
		document.documentElement.classList.add('ppe-preview-open');
	};

	const closePreviewModal = () => {
		if (!previewModal?.open) return;
		previewModal.close();
	};

	openPreviewButtons.forEach((btn) => {
		btn.addEventListener('click', () => openPreviewModal());
	});
	closePreviewButtons.forEach((btn) => {
		btn.addEventListener('click', () => closePreviewModal());
	});
	previewModal?.addEventListener('close', () => {
		document.documentElement.classList.remove('ppe-preview-open');
	});
	previewModal?.addEventListener('cancel', () => {
		document.documentElement.classList.remove('ppe-preview-open');
	});

	tabButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			const tabId = String(btn.dataset.ppeTab || 'general');
			activateTab(tabId);
		});
	});

	root.querySelector<HTMLElement>('.ppe-tabs')?.addEventListener('keydown', (event) => {
		const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
		if (!keys.includes(event.key)) return;
		const current = tabButtons.findIndex((btn) => btn.classList.contains('is-active'));
		if (current < 0) return;
		event.preventDefault();
		let next = current;
		if (event.key === 'ArrowLeft') next = (current - 1 + tabButtons.length) % tabButtons.length;
		if (event.key === 'ArrowRight') next = (current + 1) % tabButtons.length;
		if (event.key === 'Home') next = 0;
		if (event.key === 'End') next = tabButtons.length - 1;
		const target = tabButtons[next];
		if (!target) return;
		activateTab(String(target.dataset.ppeTab || 'general'));
		target.focus();
	});

	galleryGrid?.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		const removeBtn = target?.closest<HTMLElement>('[data-ppe-gallery-remove]');
		if (removeBtn) {
			const id = Number(removeBtn.dataset.id || 0);
			if (id > 0) void removeGalleryItem(id);
			return;
		}
		const openBtn = target?.closest<HTMLElement>('[data-ppe-gallery-open]');
		if (openBtn) {
			const id = Number(openBtn.dataset.id || 0);
			if (id > 0) openLightbox(id);
		}
	});

	root.querySelectorAll('[data-ppe-lightbox-close]').forEach((btn) => {
		btn.addEventListener('click', () => closeLightbox());
	});
	lightboxPrev?.addEventListener('click', () => stepLightbox(-1));
	lightboxNext?.addEventListener('click', () => stepLightbox(1));
	lightbox?.addEventListener('click', (event) => {
		if (event.target === lightbox) closeLightbox();
	});
	lightbox?.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			stepLightbox(-1);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			stepLightbox(1);
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
	renderBusinessHours();
	restoreActiveTab();
	syncPreview();
	captureSavedSnapshot();
	void checkSlug();
	void enrichPreviewFromHub();
};
