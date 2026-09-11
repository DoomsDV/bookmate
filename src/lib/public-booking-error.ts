export class PublicBookingApiError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 400, details?: unknown) {
		super(message);
		this.name = 'PublicBookingApiError';
		this.status = status;
		this.details = details;
	}
};
