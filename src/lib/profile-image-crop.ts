import Croppie from 'croppie';
import 'croppie/croppie.css';

export const PROFILE_IMAGE_ACCEPT_MIME = ['image/jpeg', 'image/png'] as const;
export const PROFILE_IMAGE_OUTPUT_SIZE = 512;
export const PROFILE_IMAGE_RECOMMENDED_MAX_BYTES = 2 * 1024 * 1024;

export function isAcceptedProfileImage(file: File): boolean {
	return (PROFILE_IMAGE_ACCEPT_MIME as readonly string[]).includes(file.type);
}

export function buildCroppedProfileFileName(originalName: string): string {
	const base =
		originalName
			.replace(/\.[^.]+$/, '')
			.replace(/-recortada$/i, '')
			.trim() || 'perfil';
	return `${base}.jpg`;
}

export type ProfileCropMode = 'logo' | 'banner';

const waitForLayout = (el: HTMLElement) =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (el.clientWidth > 0) {
					resolve();
					return;
				}
				// Diálogo recién abierto: un frame extra suele bastar
				requestAnimationFrame(() => resolve());
			});
		});
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

		const mountW = Math.max(this.mountEl.clientWidth || 0, 280);
		const mountH = Math.max(this.mountEl.clientHeight || 0, 200);

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
		const blob = await this.instance.result({
			type: 'blob',
			size: isBanner
				? { width: 1200, height: 600 }
				: { width: this.outputSize, height: this.outputSize },
			format: 'jpeg',
			quality: 0.9,
			circle: !isBanner,
		});

		if (!(blob instanceof Blob)) {
			throw new Error('No se pudo generar la imagen recortada.');
		}

		const name = isBanner
			? `${originalName.replace(/\.[^.]+$/, '') || 'banner'}.jpg`
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
