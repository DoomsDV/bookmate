import { useEffect, useState } from 'preact/hooks';
import {
	PUBLIC_PROFILE_PREVIEW_EVENT,
	type PublicProfilePreviewState,
} from '../lib/public-profile-preview-events';

const EMPTY_ABOUT = 'Este negocio todavía no agregó una descripción.';

type Props = {
	initial: PublicProfilePreviewState;
};

export default function PublicProfilePreview({ initial }: Props) {
	const [state, setState] = useState<PublicProfilePreviewState>(initial);

	useEffect(() => {
		const onUpdate = (event: Event) => {
			const detail = (event as CustomEvent<Partial<PublicProfilePreviewState>>).detail;
			if (!detail || typeof detail !== 'object') return;
			setState((prev) => ({ ...prev, ...detail }));
		};
		window.addEventListener(PUBLIC_PROFILE_PREVIEW_EVENT, onUpdate as EventListener);
		return () =>
			window.removeEventListener(PUBLIC_PROFILE_PREVIEW_EVENT, onUpdate as EventListener);
	}, []);

	const description = String(state.description || '').trim();
	const hasDescription = description.length > 0;
	const gallery = Array.isArray(state.galleryUrls) ? state.galleryUrls.filter(Boolean) : [];

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
						<div class="hub-hero__card">
							<div class="hub-hero__card-top">
								<div class="hub-hero__identity">
									{state.logoUrl ? (
										<img
											src={state.logoUrl}
											alt=""
											class="hub-hero__logo"
											width="48"
											height="48"
										/>
									) : (
										<div class="hub-hero__logo hub-hero__logo--placeholder" aria-hidden="true">
											{state.initials}
										</div>
									)}
									<div class="min-w-0">
										<h2 class="hub-hero__name">{state.organizationName}</h2>
										{hasDescription ? (
											<p class="hub-hero__tagline">{description}</p>
										) : null}
									</div>
								</div>
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
							{state.whatsappVisible ? (
								<span class="hub-wa-link hub-wa-link--block">
									<span class="material-symbols-rounded text-[1rem]" aria-hidden="true">
										chat
									</span>
									WhatsApp
								</span>
							) : null}
						</div>
					</section>

					<nav class="hub-tabs" aria-hidden="true">
						<span class="hub-tab is-active">Overview</span>
						<span class="hub-tab">Equipo</span>
						<span class="hub-tab">Sucursales</span>
					</nav>

					<div class="hub-panels">
						<section class="hub-panel is-active">
							{gallery.length ? (
								<div class="hub-gallery">
									<p class="hub-categories__label">Galería</p>
									<ul class="hub-gallery__grid">
										{gallery.slice(0, 6).map((url, index) => (
											<li key={`${url}-${index}`}>
												<img src={url} alt="" loading={index < 4 ? 'eager' : 'lazy'} />
											</li>
										))}
									</ul>
									{gallery.length > 6 ? (
										<p class="ppe-field__hint">+{gallery.length - 6} más</p>
									) : null}
								</div>
							) : null}

							<h3 class="hub-section-title">
								Sobre <span>{state.organizationName}</span>
							</h3>
							<p class={`hub-about-text ${hasDescription ? '' : 'hub-about-text--empty'}`}>
								{hasDescription ? description : EMPTY_ABOUT}
							</p>
							{state.serviceCategories?.length ? (
								<div class="hub-categories">
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
					</div>
				</div>
			</div>
		</div>
	);
}
