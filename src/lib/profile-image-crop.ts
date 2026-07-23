import Croppie from 'croppie';
import 'croppie/croppie.css';

export const PROFILE_IMAGE_ACCEPT_MIME = ['image/jpeg', 'image/png'] as const;
export const COVER_IMAGE_ACCEPT_MIME = [
	'image/jpeg',
	'image/png',
	'image/webp',
] as const;
export const PROFILE_IMAGE_OUTPUT_SIZE = 512;
export const PROFILE_IMAGE_RECOMMENDED_MAX_BYTES = 2 * 1024 * 1024;
export const COVER_IMAGE_OUTPUT = { width: 800, height: 600 } as const;

export function isAcceptedProfileImage(file: File): boolean {
	return (PROFILE_IMAGE_ACCEPT_MIME as readonly string[]).includes(file.type);
}

export function isAcceptedCoverImage(file: File): boolean {
	return (COVER_IMAGE_ACCEPT_MIME as readonly string[]).includes(file.type);
}

export function buildCroppedProfileFileName(originalName: string): string {
	const base =
		originalName
			.replace(/\.[^.]+$/, '')
			.replace(/-recortada$/i, '')
			.trim() || 'perfil';
	return `${base}.jpg`;
}

export type ProfileCropMode = 'logo' | 'banner' | 'cover';

const waitForLayout = (el: HTMLElement) =>
	new Promise<void>((resolve) => {
		const tryResolve = (attempt: number) => {
			requestAnimationFrame(() => {
				const w = el.clientWidth;
				const h = el.clientHeight;
				if ((w > 40 && h > 40) || attempt >= 8) {
					resolve();
					return;
				}
				tryResolve(attempt + 1);
			});
		};
		tryResolve(0);
	});

export class ProfileImageCropper {
	private instance: Croppie | null = null;
	private objectUrl: string | null = null;

	constructor(
		private readonly mountEl: HTMLElement,
		private readonly outputSize = PROFILE_IMAGE_OUTPUT_SIZE,
		private readonly mode: ProfileCropMode = 'logo'
	) {}

	async bindFile(file: File): Promise<void> {
		this.destroy();
		await waitForLayout(this.mountEl);

		const url = URL.createObjectURL(file);
		this.objectUrl = url;

		const rawW = this.mountEl.clientWidth || 0;
		const rawH = this.mountEl.clientHeight || 0;
		const mountW = Math.max(rawW, 280);
		const mountH = Math.max(rawH, 200);

		if (this.mode === 'banner') {
			// Viewport 2:1 lo más grande posible dentro del modal
			const maxViewportW = Math.min(mountW - 32, 720);
			const maxViewportH = Math.min(mountH - 72, 320);
			let viewportW = maxViewportW;
			let viewportH = Math.round(viewportW / 2);
			if (viewportH > maxViewportH) {
				viewportH = maxViewportH;
				viewportW = Math.round(viewportH * 2);
			}
			viewportW = Math.max(280, viewportW);
			viewportH = Math.max(140, Math.round(viewportW / 2));

			const boundaryW = Math.min(mountW, viewportW + 48);
			const boundaryH = Math.min(Math.max(mountH - 24, viewportH + 56), viewportH + 80);

			this.instance = new Croppie(this.mountEl, {
				viewport: { width: viewportW, height: viewportH, type: 'square' },
				boundary: { width: boundaryW, height: boundaryH },
				showZoomer: true,
				enableExif: true,
				enableOrientation: true,
				enforceBoundary: true,
			});
		} else if (this.mode === 'cover') {
			// Medir el ancho real disponible (sin piso artificial) para no desbordar mobile
			const availW = Math.max(
				160,
				Math.floor(
					Math.min(
						rawW || mountW,
						typeof window !== 'undefined' ? window.innerWidth - 32 : mountW,
					),
				),
			);
			const availH = Math.max(160, rawH || mountH);
			const maxViewportW = Math.max(140, availW - 24);
			const maxViewportH = Math.max(120, availH - 56);
			let viewportW = Math.min(maxViewportW, 640);
			let viewportH = Math.round((viewportW * 3) / 4);
			if (viewportH > maxViewportH) {
				viewportH = maxViewportH;
				viewportW = Math.round((viewportH * 4) / 3);
			}
			if (viewportW > maxViewportW) {
				viewportW = maxViewportW;
				viewportH = Math.round((viewportW * 3) / 4);
			}

			const boundaryW = availW;
			const boundaryH = Math.min(availH, Math.max(viewportH + 48, viewportH + 56));

			this.instance = new Croppie(this.mountEl, {
				viewport: { width: viewportW, height: viewportH, type: 'square' },
				boundary: { width: boundaryW, height: boundaryH },
				showZoomer: true,
				enableExif: true,
				enableOrientation: true,
				enforceBoundary: true,
			});

			// Croppie escribe width en px; forzar que no desborde el mount en mobile
			const boundaryEl = this.mountEl.querySelector('.cr-boundary') as HTMLElement | null;
			const containerEl = this.mountEl.querySelector('.croppie-container') as HTMLElement | null;
			if (containerEl) {
				containerEl.style.width = '100%';
				containerEl.style.maxWidth = '100%';
			}
			if (boundaryEl) {
				boundaryEl.style.maxWidth = '100%';
				boundaryEl.style.width = `${boundaryW}px`;
			}
		} else {
			const viewport = Math.min(300, Math.max(220, mountW - 48));
			this.instance = new Croppie(this.mountEl, {
				viewport: { width: viewport, height: viewport, type: 'circle' },
				boundary: { width: viewport + 40, height: viewport + 40 },
				showZoomer: true,
				enableExif: true,
				enableOrientation: true,
				enforceBoundary: true,
			});
		}

		await this.instance.bind({ url });
	}

	async exportJpeg(originalName: string): Promise<File> {
		if (!this.instance) {
			throw new Error('No hay imagen para recortar.');
		}

		const isBanner = this.mode === 'banner';
		const isCover = this.mode === 'cover';
		const blob = await this.instance.result({
			type: 'blob',
			size: isBanner
				? { width: 1200, height: 600 }
				: isCover
					? { ...COVER_IMAGE_OUTPUT }
					: { width: this.outputSize, height: this.outputSize },
			format: 'jpeg',
			quality: 0.9,
			circle: !isBanner && !isCover,
		});

		if (!(blob instanceof Blob)) {
			throw new Error('No se pudo generar la imagen recortada.');
		}

		const stem =
			originalName.replace(/\.[^.]+$/, '').trim() ||
			(isCover ? 'portada' : isBanner ? 'banner' : 'perfil');
		const name =
			isBanner || isCover
				? `${stem}.jpg`
				: buildCroppedProfileFileName(originalName);

		return new File([blob], name, {
			type: 'image/jpeg',
		});
	}

	destroy(): void {
		this.instance?.destroy();
		this.instance = null;

		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}

		this.mountEl.replaceChildren();
	}
}
