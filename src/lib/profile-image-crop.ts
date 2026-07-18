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
		const url = URL.createObjectURL(file);
		this.objectUrl = url;

		if (this.mode === 'banner') {
			const width = Math.min(320, Math.max(240, this.mountEl.clientWidth - 24));
			const height = Math.round(width / 2);
			this.instance = new Croppie(this.mountEl, {
				viewport: { width, height, type: 'square' },
				boundary: { width: width + 32, height: height + 48 },
				showZoomer: true,
				enableExif: true,
				enforceBoundary: true,
			});
		} else {
			const viewport = Math.min(260, Math.max(200, this.mountEl.clientWidth - 24));
			this.instance = new Croppie(this.mountEl, {
				viewport: { width: viewport, height: viewport, type: 'circle' },
				boundary: { width: viewport + 32, height: viewport + 32 },
				showZoomer: true,
				enableExif: true,
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
