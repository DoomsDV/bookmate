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

export class ProfileImageCropper {
	private instance: Croppie | null = null;
	private objectUrl: string | null = null;

	constructor(
		private readonly mountEl: HTMLElement,
		private readonly outputSize = PROFILE_IMAGE_OUTPUT_SIZE
	) {}

	async bindFile(file: File): Promise<void> {
		this.destroy();
		const url = URL.createObjectURL(file);
		this.objectUrl = url;

		const viewport = Math.min(260, Math.max(200, this.mountEl.clientWidth - 24));
		this.instance = new Croppie(this.mountEl, {
			viewport: { width: viewport, height: viewport, type: 'circle' },
			boundary: { width: viewport + 32, height: viewport + 32 },
			showZoomer: true,
			enableExif: true,
			enforceBoundary: true,
		});

		await this.instance.bind({ url });
	}

	async exportJpeg(originalName: string): Promise<File> {
		if (!this.instance) {
			throw new Error('No hay imagen para recortar.');
		}

		const blob = await this.instance.result({
			type: 'blob',
			size: { width: this.outputSize, height: this.outputSize },
			format: 'jpeg',
			quality: 0.9,
			circle: true,
		});

		if (!(blob instanceof Blob)) {
			throw new Error('No se pudo generar la imagen recortada.');
		}

		return new File([blob], buildCroppedProfileFileName(originalName), {
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
