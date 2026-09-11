import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export const formatMapCoordinates = (latitude: number, longitude: number): string => {
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
	const latHem = latitude >= 0 ? 'N' : 'S';
	const lngHem = longitude >= 0 ? 'E' : 'W';
	return `${Math.abs(latitude).toFixed(4)}° ${latHem}, ${Math.abs(longitude).toFixed(4)}° ${lngHem}`;
};

type LocationMapProps = {
	location?: string;
	coordinates?: string;
	address?: string;
	latitude?: number;
	longitude?: number;
	stadiaKey?: string;
	className?: string;
	children?: ReactNode;
};

export function LocationMap({
	location = 'Ubicación',
	coordinates = '',
	address = '',
	latitude,
	longitude,
	stadiaKey = '',
	className = '',
	children,
}: LocationMapProps) {
	const reactId = useId().replace(/:/g, '');
	const gridId = `location-map-grid-${reactId}`;
	const rootRef = useRef<HTMLDivElement>(null);
	const mapElRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<{ resize: () => void; remove: () => void } | null>(null);
	const prefersReducedMotion = useReducedMotion();
	const [isHovered, setIsHovered] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const [mapMounted, setMapMounted] = useState(false);
	const [mapReady, setMapReady] = useState(false);
	const [sheetSettled, setSheetSettled] = useState(true);

	const reduceMotion = Boolean(prefersReducedMotion);
	const hasCoords =
		typeof latitude === 'number' &&
		typeof longitude === 'number' &&
		Number.isFinite(latitude) &&
		Number.isFinite(longitude) &&
		Boolean(stadiaKey);
	const showMap = isExpanded && mapReady && sheetSettled;

	const toggleExpanded = (event: MouseEvent<HTMLDivElement>) => {
		const target = event.target;
		if (target instanceof Element && target.closest('.hub-location-map__actions')) return;
		setSheetSettled(false);
		setIsExpanded((open) => !open);
	};

	const resizeMap = () => {
		const map = mapRef.current;
		if (!map) return;
		try {
			map.resize();
		} catch {
			// ignore
		}
	};

	useEffect(() => {
		if (isExpanded && hasCoords) setMapMounted(true);
	}, [isExpanded, hasCoords]);

	useEffect(() => {
		if (!isExpanded) return;
		const onPointerDown = (event: PointerEvent) => {
			const root = rootRef.current;
			const target = event.target;
			if (!root || !(target instanceof Node) || root.contains(target)) return;
			setSheetSettled(false);
			setIsExpanded(false);
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	}, [isExpanded]);

	useEffect(() => {
		if (!mapMounted || !hasCoords || typeof latitude !== 'number' || typeof longitude !== 'number') {
			return;
		}

		let cancelled = false;
		let raf = 0;
		let disconnect: (() => void) | null = null;
		let marker: { remove: () => void } | null = null;
		const lat = latitude;
		const lng = longitude;

		const destroy = () => {
			disconnect?.();
			disconnect = null;
			try {
				marker?.remove();
			} catch {
				// ignore
			}
			marker = null;
			try {
				mapRef.current?.remove();
			} catch {
				// ignore
			}
			mapRef.current = null;
		};

		const start = async (container: HTMLDivElement) => {
			const mod = await import('../../lib/maplibre-interactive');
			const maplibregl = await mod.loadMapLibre();
			if (cancelled) return;
			await mod.whenMapContainerReady(container);
			if (cancelled) return;

			const theme = mod.resolveMapTheme();
			const center = { lat, lng };
			const instance = new maplibregl.Map({
				container,
				style: mod.getStadiaStyleUrl(theme, stadiaKey),
				center: [lng, lat],
				zoom: 16,
				fadeDuration: 0,
				attributionControl: false,
				transformRequest: mod.createStadiaTransformRequest(stadiaKey),
			});
			mapRef.current = instance;
			marker = mod
				.createBrandMarker(maplibregl, center, {
					title: location,
				})
				.addTo(instance);
			const reveal = () => {
				if (cancelled) return;
				try {
					instance.resize();
				} catch {
					// ignore
				}
				setMapReady(true);
			};
			if (instance.loaded()) {
				reveal();
			} else {
				instance.once('idle', reveal);
			}
		};

		const waitForEl = () => {
			const el = mapElRef.current;
			if (!el) {
				raf = requestAnimationFrame(waitForEl);
				return;
			}
			void start(el);
		};
		raf = requestAnimationFrame(waitForEl);

		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			destroy();
			setMapReady(false);
		};
	}, [mapMounted, hasCoords, latitude, longitude, stadiaKey, location]);

	return (
		<motion.div
			ref={rootRef}
			className={`hub-location-map ${className}`.trim()}
			onMouseEnter={() => {
				setIsHovered(true);
				if (hasCoords) {
					void import('../../lib/maplibre-interactive').then((mod) => {
						void mod.loadMapLibre();
					});
				}
			}}
			onMouseLeave={() => setIsHovered(false)}
			onClick={toggleExpanded}
		>
			<motion.div
				className="hub-location-map__sheet"
				animate={{ height: isExpanded ? 328 : 176 }}
				transition={
					reduceMotion
						? { duration: 0 }
						: { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
				}
				onAnimationComplete={() => {
					resizeMap();
					setSheetSettled(true);
				}}
			>
				<div className="hub-location-map__wash" />

				{mapMounted ? (
					<div
						className="hub-location-map__real"
						style={{ opacity: showMap ? 1 : 0 }}
					>
						<div ref={mapElRef} className="hub-location-map__canvas" />
						<div className="hub-location-map__detail-fade" />
					</div>
				) : null}

				<motion.div
					className="hub-location-map__grid"
					animate={{ opacity: showMap ? 0 : 0.04 }}
					transition={{ duration: reduceMotion ? 0 : 0.35 }}
				>
					<svg width="100%" height="100%" aria-hidden="true">
						<defs>
							<pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
								<path d="M 20 0 L 0 0 0 20" fill="none" className="hub-location-map__grid-stroke" />
							</pattern>
						</defs>
						<rect width="100%" height="100%" fill={`url(#${gridId})`} />
					</svg>
				</motion.div>

				<div className="hub-location-map__content">
					<div className="hub-location-map__top">
						<motion.div
							className="hub-location-map__icon-wrap"
							animate={{ opacity: isExpanded ? 0 : 1 }}
							transition={{ duration: reduceMotion ? 0 : 0.3 }}
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="hub-location-map__icon"
								aria-hidden="true"
							>
								<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
								<line x1="9" x2="9" y1="3" y2="18" />
								<line x1="15" x2="15" y1="6" y2="21" />
							</svg>
						</motion.div>
					</div>

					<div className="hub-location-map__bottom">
						<h3 className="hub-location-map__name">{location}</h3>

						{address && !isExpanded ? <p className="hub-location-map__address">{address}</p> : null}

						{isExpanded && coordinates ? (
							<p className="hub-location-map__coords">{coordinates}</p>
						) : null}

						<motion.div
							className="hub-location-map__rule"
							initial={reduceMotion ? false : { scaleX: 0.3 }}
							animate={{ scaleX: isHovered || isExpanded ? 1 : 0.3 }}
							transition={{ duration: reduceMotion ? 0 : 0.4, ease: 'easeOut' }}
						/>

						{children ? (
							<div className="hub-location-map__actions">{children}</div>
						) : null}
					</div>
				</div>
			</motion.div>

			<motion.p
				className="hub-location-map__hint"
				initial={false}
				animate={{
					opacity: isHovered && !isExpanded ? 1 : 0,
					y: isHovered ? 0 : 4,
				}}
				transition={{ duration: reduceMotion ? 0 : 0.2 }}
			>
				Tocá para ampliar
			</motion.p>
		</motion.div>
	);
}
