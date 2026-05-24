declare module 'croppie' {
	export interface CroppieViewport {
		width: number;
		height: number;
		type?: 'square' | 'circle';
	}

	export interface CroppieBoundary {
		width: number;
		height: number;
	}

	export interface CroppieOptions {
		viewport: CroppieViewport;
		boundary?: CroppieBoundary;
		showZoomer?: boolean;
		enableExif?: boolean;
		enableOrientation?: boolean;
		enforceBoundary?: boolean;
	}

	export interface CroppieResultOptions {
		type?: 'canvas' | 'base64' | 'blob' | 'rawcanvas';
		format?: 'jpeg' | 'png' | 'webp';
		quality?: number;
		size?: { width: number; height: number };
		circle?: boolean;
	}

	export default class Croppie {
		constructor(element: HTMLElement, options: CroppieOptions);
		bind(options: { url: string; zoom?: number; points?: number[] }): Promise<void>;
		result(options: CroppieResultOptions): Promise<HTMLCanvasElement | HTMLImageElement | Blob | string>;
		destroy(): void;
		refresh(): void;
	}
}
