import { useEffect, useRef, useState } from 'preact/hooks';
import {
	PUBLIC_PROFILE_PREVIEW_EVENT,
	type PublicProfilePreviewState,
} from '../lib/public-profile-preview-events';

const EMPTY_ABOUT = 'Este negocio todavía no agregó una descripción.';

type PreviewTab = 'overview' | 'galeria' | 'equipo' | 'sucursales';

type Props = {
	initial: PublicProfilePreviewState;
};

const chunkArray = <T,>(items: T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
};

const galleryCount = (urls: unknown) =>
	Array.isArray(urls) ? urls.filter(Boolean).length : 0;

export default function PublicProfilePreview({ initial }: Props) {
	const [state, setState] = useState<PublicProfilePreviewState>(initial);
	const [activeTab, setActiveTab] = useState<PreviewTab>('overview');
	const galleryCountRef = useRef(galleryCount(initial.galleryUrls));

	useEffect(() => {
		const onUpdate = (event: Event) => {
			const detail = (event as CustomEvent<Partial<PublicProfilePreviewState>>).detail;
			if (!detail || typeof detail !== 'object') return;
			setState((prev) => ({ ...prev, ...detail }));
			if (Array.isArray(detail.galleryUrls)) {
				const nextCount = galleryCount(detail.galleryUrls);
				if (nextCount !== galleryCountRef.current) {
					galleryCountRef.current = nextCount;
					setActiveTab('galeria');
				}
			}
		};
		window.addEventListener(PUBLIC_PROFILE_PREVIEW_EVENT, onUpdate as EventListener);
		return () =>
			window.removeEventListener(PUBLIC_PROFILE_PREVIEW_EVENT, onUpdate as EventListener);
	}, []);

	const description = String(state.description || '').trim();
	const hasDescription = description.length > 0;
	const gallery = Array.isArray(state.galleryUrls) ? state.galleryUrls.filter(Boolean) : [];
	const galleryBlocks = chunkArray(gallery, 4);

	return (
		<div class="ppe-phone">
			<div class="ppe-phone__bezel">
				<span class="ppe-phone__island" aria-hidden="true" />
				<div class="ppe-phone__screen hub-root ppe-preview-hub">
					<header class="ppe-preview-topbar" aria-hidden="true">
						<span class="ppe-preview-topbar__brand">
							<img src="/icons/icon-64.png" alt="" width="22" height="22" />
							Hasel
						</span>
						<span class="ppe-preview-topbar__cta">Reservar</span>
					</header>

					<div class="hub-shell">
						<section class="hub-hero">
							<div
								class={`hub-hero__banner ${state.bannerUrl ? 'hub-hero__banner--photo' : ''}`}
								aria-hidden="true"
								style={
									state.bannerUrl
										? { backgroundImage: `url(${state.bannerUrl})` }
										: undefined
								}
							>
								{!state.bannerUrl ? <span class="hub-hero__orb hub-hero__orb--a" /> : null}
							</div>
							<div class="hub-hero__profile">
								<div class="hub-hero__avatar-row">
									{state.logoUrl ? (
										<img
											src={state.logoUrl}
											alt=""
											class="hub-hero__logo"
											width="64"
											height="64"
										/>
									) : (
										<div class="hub-hero__logo hub-hero__logo--placeholder" aria-hidden="true">
											{state.initials}
										</div>
									)}
									<div class="hub-hero__actions">
										{state.facebookUrl ? (
											<span class="hub-icon-btn" title="Facebook">
												<span class="material-symbols-rounded" aria-hidden="true">
													public
												</span>
											</span>
										) : null}
										{state.instagramUrl ? (
											<span class="hub-icon-btn" title="Instagram">
												<span class="material-symbols-rounded" aria-hidden="true">
													photo_camera
												</span>
											</span>
										) : null}
									</div>
								</div>
								<div class="hub-hero__meta">
									<h2 class="hub-hero__name">{state.organizationName}</h2>
									{hasDescription ? (
										<p class="hub-hero__tagline">{description}</p>
									) : null}
								</div>
								<div class="hub-hero__cta-row">
									{state.whatsappVisible ? (
										<span class="hub-btn hub-btn--outline hub-wa-link">
											<span class="material-symbols-rounded" aria-hidden="true">
												chat
											</span>
											WhatsApp
										</span>
									) : null}
									<span class="hub-btn hub-btn--filled">
										<span class="material-symbols-rounded" aria-hidden="true">
											event
										</span>
										Reservar
									</span>
								</div>
							</div>
						</section>

						<nav class="hub-tabs" aria-label="Vista previa de secciones">
							{(
								[
									['overview', 'Overview'],
									['galeria', 'Galería'],
									['equipo', 'Equipo'],
									['sucursales', 'Sucursales'],
								] as const
							).map(([id, label]) => (
								<button
									key={id}
									type="button"
									class={`hub-tab ${activeTab === id ? 'is-active' : ''}`}
									aria-selected={activeTab === id}
									onClick={() => setActiveTab(id)}
								>
									{label}
								</button>
							))}
						</nav>

						<div class="hub-panels">
							<section
								class={`hub-panel ${activeTab === 'overview' ? 'is-active' : ''}`}
								hidden={activeTab !== 'overview'}
							>
								<div class="hub-surface">
									<h3 class="hub-section-title">
										Sobre <span>{state.organizationName}</span>
									</h3>
									<p class={`hub-about-text ${hasDescription ? '' : 'hub-about-text--empty'}`}>
										{hasDescription ? description : EMPTY_ABOUT}
									</p>
								</div>
								{state.serviceCategories?.length ? (
									<div class="hub-surface hub-categories">
										<p class="hub-categories__label">Servicios</p>
										<ul class="hub-categories__list">
											{state.serviceCategories.slice(0, 8).map((category) => (
												<li key={category}>
													<span class="hub-category-tag">{category}</span>
												</li>
											))}
										</ul>
									</div>
								) : null}
							</section>

							<section
								class={`hub-panel ${activeTab === 'galeria' ? 'is-active' : ''}`}
								hidden={activeTab !== 'galeria'}
							>
								<h3 class="hub-section-title">Galería</h3>
								{galleryBlocks.length ? (
									<div class="hub-gallery-blocks" aria-label="Fotos del negocio">
										{galleryBlocks.map((block, blockIndex) => (
											<ul class="hub-gallery-block" key={`block-${blockIndex}`}>
												{block.map((url, imageIndex) => (
													<li key={`${url}-${imageIndex}`}>
														<img
															src={url}
															alt=""
															loading={blockIndex === 0 ? 'eager' : 'lazy'}
														/>
													</li>
												))}
											</ul>
										))}
									</div>
								) : (
									<p class="hub-empty">Todavía no hay fotos.</p>
								)}
							</section>

							<section
								class={`hub-panel ${activeTab === 'equipo' ? 'is-active' : ''}`}
								hidden={activeTab !== 'equipo'}
							>
								<h3 class="hub-section-title">Equipo</h3>
								<p class="hub-empty">Vista previa: el equipo se muestra en la página pública.</p>
							</section>

							<section
								class={`hub-panel ${activeTab === 'sucursales' ? 'is-active' : ''}`}
								hidden={activeTab !== 'sucursales'}
							>
								<h3 class="hub-section-title">Sucursales</h3>
								<p class="hub-empty">Vista previa: las sucursales se muestran en la página pública.</p>
							</section>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
