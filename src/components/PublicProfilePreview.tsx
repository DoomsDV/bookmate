import { useEffect, useRef, useState } from 'preact/hooks';
import {
	PUBLIC_PROFILE_PREVIEW_EVENT,
	type PublicProfilePreviewState,
} from '../lib/public-profile-preview-events';
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from './hub-brand-icons';

type PreviewTab = 'overview' | 'galeria' | 'equipo' | 'sucursales';

type Props = {
	initial: PublicProfilePreviewState;
	/** phone = mockup con carcasa (desktop). live = pantalla completa sin marco. */
	variant?: 'phone' | 'live';
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

export default function PublicProfilePreview({ initial, variant = 'phone' }: Props) {
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
	const slug = String(state.profileSlug || '').trim();
	const handle = slug ? `@${slug}` : '';
	const shortTagline = hasDescription
		? description
				.split(/\n/)
				.map((line) => line.trim())
				.find(Boolean) || ''
		: '';
	const locationLabel = String(state.locationLabel || '').trim();
	const teamCount = Number(state.teamCount || 0);
	const servicesCount = state.serviceCategories?.length || 0;
	const hoursLiveStatus =
		state.businessHoursRows?.find((row) => row.liveStatus)?.liveStatus ?? null;
	const isLive = variant === 'live';

	const hubBody = (
		<>
			<header class="ppe-preview-topbar" aria-hidden="true">
				<span class="ppe-preview-topbar__brand">
					<img src="/icons/icon-64.png" alt="" width="22" height="22" />
					Hasel
				</span>
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
									width="72"
									height="72"
								/>
							) : (
								<div class="hub-hero__logo hub-hero__logo--placeholder" aria-hidden="true">
									{state.initials}
								</div>
							)}
							<div class="hub-hero__actions">
								{state.facebookUrl ? (
									<span class="hub-icon-btn" title="Facebook">
										<FacebookIcon class="hub-icon-btn__svg" />
									</span>
								) : null}
								{state.instagramUrl ? (
									<span class="hub-icon-btn" title="Instagram">
										<InstagramIcon class="hub-icon-btn__svg" />
									</span>
								) : null}
							</div>
						</div>
						<div class="hub-hero__meta">
							<h2 class="hub-hero__name">{state.organizationName}</h2>
							{handle ? <p class="hub-hero__handle">{handle}</p> : null}
							{shortTagline ? <p class="hub-hero__tagline">{shortTagline}</p> : null}
							{(locationLabel || teamCount > 0 || servicesCount > 0) ? (
								<ul class="hub-hero__facts">
									{locationLabel ? (
										<li>
											<span class="material-symbols-rounded" aria-hidden="true">
												location_on
											</span>
											{locationLabel}
										</li>
									) : null}
									{teamCount > 0 ? (
										<li>
											<span class="material-symbols-rounded" aria-hidden="true">
												group
											</span>
											{teamCount} profesional{teamCount === 1 ? '' : 'es'}
										</li>
									) : null}
									{servicesCount > 0 ? (
										<li>
											<span class="material-symbols-rounded" aria-hidden="true">
												category
											</span>
											{servicesCount} servicio{servicesCount === 1 ? '' : 's'}
										</li>
									) : null}
								</ul>
							) : null}
						</div>
						<div class="hub-hero__cta-row">
							{state.whatsappVisible ? (
								<span class="hub-btn hub-btn--outline hub-wa-link">
									<WhatsAppIcon class="hub-btn__brand-icon" />
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

				<div class="hub-section">
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
				</div>

				<div class="hub-section hub-panels">
					<section
						class={`hub-panel ${activeTab === 'overview' ? 'is-active' : ''}`}
						hidden={activeTab !== 'overview'}
					>
						<div class="hub-overview-stack">
							{state.businessHoursRows?.length ? (
								<div class="hub-pin-block hub-hours">
									<p class="hub-pin-block__label hub-hours__heading">
										<span class="hub-hours__heading-title">
											<span class="material-symbols-rounded" aria-hidden="true">
												schedule
											</span>
											Horario
										</span>
										{hoursLiveStatus ? (
											<span
												class={`hub-hours__live ${
													hoursLiveStatus === 'open' ? 'is-open' : 'is-closed'
												}`}
											>
												<span class="hub-hours__live-dot" aria-hidden="true" />
												{hoursLiveStatus === 'open'
													? 'Abierto ahora'
													: 'Cerrado ahora'}
											</span>
										) : null}
									</p>
									<ul class="hub-hours__list">
										{state.businessHoursRows.map((row) => (
											<li
												key={`${row.label}-${row.value}`}
												class={[
													row.closed ? 'is-closed' : '',
													row.isToday ? 'is-today' : '',
												]
													.filter(Boolean)
													.join(' ')}
											>
												<span class="hub-hours__day">{row.label}</span>
												<span class="hub-hours__value">
													{row.closed
														? 'Cerrado'
														: (row.slots || []).flatMap((slot, slotIndex) =>
																slotIndex > 0
																	? [
																			<span
																				class="hub-hours__sep"
																				aria-hidden="true"
																				key={`sep-${slotIndex}`}
																			>
																				|
																			</span>,
																			<span
																				class="hub-hours__slot"
																				key={`slot-${slotIndex}`}
																			>
																				{slot}
																			</span>,
																		]
																	: [
																			<span
																				class="hub-hours__slot"
																				key={`slot-${slotIndex}`}
																			>
																				{slot}
																			</span>,
																		]
															)}
												</span>
											</li>
										))}
									</ul>
								</div>
							) : null}
							{state.serviceCategories?.length ? (
								<div class="hub-pin-block">
									<p class="hub-pin-block__label">
										<span class="material-symbols-rounded" aria-hidden="true">
											keep
										</span>
										Servicios
									</p>
									<ul class="hub-categories__list">
										{state.serviceCategories.slice(0, 8).map((category) => (
											<li key={category}>
												<span class="hub-category-tag">{category}</span>
											</li>
										))}
									</ul>
								</div>
							) : (
								<p class="hub-empty">Todavía no hay servicios destacados.</p>
							)}
						</div>
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
		</>
	);

	if (isLive) {
		return (
			<div class="hub-root ppe-preview-hub ppe-preview-hub--live">{hubBody}</div>
		);
	}

	return (
		<div class="ppe-phone">
			<div class="ppe-phone__bezel">
				<span class="ppe-phone__island" aria-hidden="true" />
				<div class="ppe-phone__screen hub-root ppe-preview-hub">{hubBody}</div>
			</div>
		</div>
	);
}
