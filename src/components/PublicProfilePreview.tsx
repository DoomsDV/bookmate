import { useEffect, useRef, useState } from 'react';
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
	const professionals = Array.isArray(state.professionals) ? state.professionals : [];
	const locations = Array.isArray(state.locations) ? state.locations : [];
	const teamCount = Number(state.teamCount || professionals.length || 0);
	const servicesCount = state.serviceCategories?.length || 0;
	const hoursLiveStatus =
		state.businessHoursRows?.find((row) => row.liveStatus)?.liveStatus ?? null;
	const isLive = variant === 'live';

	const hubBody = (
		<>
			<header className="ppe-preview-topbar" aria-hidden="true">
				<span className="ppe-preview-topbar__brand">
					<img src="/icons/icon-64.png" alt="" width="22" height="22" />
					Hasel
				</span>
				<span className="ppe-preview-topbar__theme">
					<span className="material-symbols-rounded">light_mode</span>
				</span>
			</header>

			<div className="hub-shell">
				<section className="hub-hero">
					<div
						className={`hub-hero__banner ${state.bannerUrl ? 'hub-hero__banner--photo' : ''}`}
						aria-hidden="true"
						style={
							state.bannerUrl
								? { backgroundImage: `url(${state.bannerUrl})` }
								: undefined
						}
					>
						{!state.bannerUrl ? <span className="hub-hero__orb hub-hero__orb--a" /> : null}
					</div>
					<div className="hub-hero__profile">
						<div className="hub-hero__avatar-row">
							{state.logoUrl ? (
								<img
									src={state.logoUrl}
									alt=""
									className="hub-hero__logo"
									width="72"
									height="72"
								/>
							) : (
								<div className="hub-hero__logo hub-hero__logo--placeholder" aria-hidden="true">
									{state.initials}
								</div>
							)}
							<div className="hub-hero__actions">
								{state.facebookUrl ? (
									<span className="hub-icon-btn" title="Facebook">
										<FacebookIcon className="hub-icon-btn__svg" />
									</span>
								) : null}
								{state.instagramUrl ? (
									<span className="hub-icon-btn" title="Instagram">
										<InstagramIcon className="hub-icon-btn__svg" />
									</span>
								) : null}
								<span className="hub-icon-btn" title="Compartir">
									<span className="material-symbols-rounded" aria-hidden="true">
										ios_share
									</span>
								</span>
							</div>
						</div>
						<div className="hub-hero__meta">
							<h2 className="hub-hero__name">{state.organizationName}</h2>
							{handle ? <p className="hub-hero__handle">{handle}</p> : null}
							{shortTagline ? <p className="hub-hero__tagline">{shortTagline}</p> : null}
							{(locationLabel || teamCount > 0 || servicesCount > 0) ? (
								<ul className="hub-hero__facts">
									{locationLabel ? (
										<li>
											<span className="material-symbols-rounded" aria-hidden="true">
												location_on
											</span>
											{locationLabel}
										</li>
									) : null}
									{teamCount > 0 ? (
										<li>
											<span className="material-symbols-rounded" aria-hidden="true">
												group
											</span>
											{teamCount} profesional{teamCount === 1 ? '' : 'es'}
										</li>
									) : null}
									{servicesCount > 0 ? (
										<li>
											<span className="material-symbols-rounded" aria-hidden="true">
												category
											</span>
											{servicesCount} servicio{servicesCount === 1 ? '' : 's'}
										</li>
									) : null}
								</ul>
							) : null}
						</div>
						<div className="hub-hero__cta-row">
							{state.whatsappVisible ? (
								<span className="hub-btn hub-btn--outline hub-wa-link">
									<WhatsAppIcon className="hub-btn__brand-icon" />
									WhatsApp
								</span>
							) : null}
							<span className="hub-btn hub-btn--filled">
								<span className="material-symbols-rounded" aria-hidden="true">
									event
								</span>
								Reservar
							</span>
						</div>
					</div>
				</section>

				<div className="hub-section">
					<nav className="hub-tabs" aria-label="Vista previa de secciones">
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
								className={`hub-tab ${activeTab === id ? 'is-active' : ''}`}
								aria-selected={activeTab === id}
								onClick={() => setActiveTab(id)}
							>
								{label}
							</button>
						))}
					</nav>
				</div>

				<div className="hub-section hub-panels">
					<section
						className={`hub-panel ${activeTab === 'overview' ? 'is-active' : ''}`}
						hidden={activeTab !== 'overview'}
					>
						<div className="hub-overview-stack">
							{state.businessHoursRows?.length ? (
								<div className="hub-pin-block hub-hours">
									<p className="hub-pin-block__label hub-hours__heading">
										<span className="hub-hours__heading-title">
											<span className="material-symbols-rounded" aria-hidden="true">
												schedule
											</span>
											Horario
										</span>
										{hoursLiveStatus ? (
											<span
												className={`hub-hours__live ${
													hoursLiveStatus === 'open' ? 'is-open' : 'is-closed'
												}`}
											>
												<span className="hub-hours__live-dot" aria-hidden="true" />
												{hoursLiveStatus === 'open'
													? 'Abierto ahora'
													: 'Cerrado ahora'}
											</span>
										) : null}
									</p>
									<ul className="hub-hours__list">
										{state.businessHoursRows.map((row) => (
											<li
												key={`${row.label}-${row.value}`}
												className={[
													row.closed ? 'is-closed' : '',
													row.isToday ? 'is-today' : '',
												]
													.filter(Boolean)
													.join(' ')}
											>
												<span className="hub-hours__day">{row.label}</span>
												<span className="hub-hours__value">
													{row.closed
														? 'Cerrado'
														: (row.slots || []).flatMap((slot, slotIndex) =>
																slotIndex > 0
																	? [
																			<span
																				className="hub-hours__sep"
																				aria-hidden="true"
																				key={`sep-${slotIndex}`}
																			>
																				|
																			</span>,
																			<span
																				className="hub-hours__slot"
																				key={`slot-${slotIndex}`}
																			>
																				{slot}
																			</span>,
																		]
																	: [
																			<span
																				className="hub-hours__slot"
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
								<div className="hub-pin-block">
									<p className="hub-pin-block__label">
										<span className="material-symbols-rounded" aria-hidden="true">
											keep
										</span>
										Servicios
									</p>
									<ul className="hub-categories__list">
										{state.serviceCategories.slice(0, 8).map((category) => (
											<li key={category}>
												<span className="hub-category-tag">{category}</span>
											</li>
										))}
									</ul>
								</div>
							) : (
								<p className="hub-empty">Todavía no hay servicios destacados.</p>
							)}
						</div>
					</section>

					<section
						className={`hub-panel ${activeTab === 'galeria' ? 'is-active' : ''}`}
						hidden={activeTab !== 'galeria'}
					>
						<h3 className="hub-section-title">Galería</h3>
						{galleryBlocks.length ? (
							<div className="hub-gallery-blocks" aria-label="Fotos del negocio">
								{galleryBlocks.map((block, blockIndex) => (
									<ul className="hub-gallery-block" key={`block-${blockIndex}`}>
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
							<p className="hub-empty">Todavía no hay fotos.</p>
						)}
					</section>

					<section
						className={`hub-panel ${activeTab === 'equipo' ? 'is-active' : ''}`}
						hidden={activeTab !== 'equipo'}
					>
						<h3 className="hub-section-title">Equipo</h3>
						{professionals.length ? (
							<div className="hub-team-grid" aria-label="Profesionales">
								{professionals.map((pro) => (
									<div className="hub-pro-card" key={pro.id}>
										<div className="hub-pro-card__top">
											<span className="hub-pro-card__status">
												<span className="hub-pro-card__status-dot" aria-hidden="true" />
												Agenda abierta
											</span>
										</div>
										<div className="hub-pro-card__main">
											<div
												className={`hub-pro-card__avatar${pro.imageUrl ? '' : ' hub-pro-card__avatar--ph'}`}
											>
												{pro.imageUrl ? (
													<img
														src={pro.imageUrl}
														alt=""
														className="hub-pro-card__photo is-ready"
														width="96"
														height="96"
														loading="lazy"
														decoding="async"
													/>
												) : (
													<span className="hub-pro-card__initials" aria-hidden="true">
														{pro.initials}
													</span>
												)}
												<span
													className="hub-pro-card__status-dot hub-pro-card__status-dot--avatar"
													aria-hidden="true"
												/>
											</div>
											<div className="hub-pro-card__text">
												<h3 className="hub-pro-card__name">{pro.fullName}</h3>
												<p className="hub-pro-card__specialty">{pro.specialty}</p>
											</div>
										</div>
										<span className="hub-pro-card__btn">
											<span className="material-symbols-rounded" aria-hidden="true">
												event
											</span>
											Reservar
										</span>
									</div>
								))}
							</div>
						) : (
							<p className="hub-empty">Todavía no hay profesionales.</p>
						)}
					</section>

					<section
						className={`hub-panel ${activeTab === 'sucursales' ? 'is-active' : ''}`}
						hidden={activeTab !== 'sucursales'}
					>
						<h3 className="hub-section-title">Sucursales</h3>
						{locations.length ? (
							<div className="hub-locations-grid" aria-label="Sucursales">
								{locations.map((loc) => (
									<article className="hub-location-card" key={loc.id}>
										<div className="hub-location-card__map hub-location-card__map--empty">
											<span className="material-symbols-rounded" aria-hidden="true">
												location_on
											</span>
										</div>
										<div className="hub-location-card__body">
											<div className="hub-location-card__info">
												<h3 className="hub-location-card__name">{loc.name}</h3>
												{loc.address ? (
													<p className="hub-location-card__address">{loc.address}</p>
												) : null}
											</div>
										</div>
									</article>
								))}
							</div>
						) : (
							<p className="hub-empty">Todavía no hay sucursales.</p>
						)}
					</section>
				</div>
			</div>
		</>
	);

	if (isLive) {
		return (
			<div className="hub-root ppe-preview-hub ppe-preview-hub--live">{hubBody}</div>
		);
	}

	return (
		<div className="ppe-phone">
			<div className="ppe-phone__bezel" aria-hidden="true">
				<span className="ppe-phone__btn ppe-phone__btn--silent" />
				<span className="ppe-phone__btn ppe-phone__btn--vol-up" />
				<span className="ppe-phone__btn ppe-phone__btn--vol-down" />
				<span className="ppe-phone__btn ppe-phone__btn--power" />
				<span className="ppe-phone__island">
					<span className="ppe-phone__island-lens" />
				</span>
				<div className="ppe-phone__screen hub-root ppe-preview-hub">{hubBody}</div>
				<span className="ppe-phone__home" />
			</div>
		</div>
	);
}
