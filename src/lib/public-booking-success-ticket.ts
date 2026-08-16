import { formatFriendlyTime, formatTicketDate, parseApiDate, parseApiDateTime } from './booking-datetime';

export type PublicBookingSuccessTicketData = {
	professionalName: string;
	organizationName?: string;
	serviceName: string;
	durationMinutes?: number;
	dateYmd: string;
	time: string;
	locationName?: string;
	locationAddress?: string;
	imageUrl?: string;
};

export const fillPublicBookingSuccessTicket = (
	root: ParentNode,
	data: PublicBookingSuccessTicketData
) => {
	const professional = root.querySelector<HTMLElement>('[data-ticket-professional]');
	const organization = root.querySelector<HTMLElement>('[data-ticket-organization]');
	const service = root.querySelector<HTMLElement>('[data-ticket-service]');
	const duration = root.querySelector<HTMLElement>('[data-ticket-duration]');
	const dateEl = root.querySelector<HTMLElement>('[data-ticket-date]');
	const timeEl = root.querySelector<HTMLElement>('[data-ticket-time]');
	const locationName = root.querySelector<HTMLElement>('[data-ticket-location-name]');
	const locationAddress = root.querySelector<HTMLElement>('[data-ticket-location-address]');
	const avatarImg = root.querySelector<HTMLImageElement>('[data-ticket-avatar-img]');
	const avatarEmpty = root.querySelector<HTMLElement>('[data-ticket-avatar-empty]');

	if (professional) professional.textContent = data.professionalName || '—';
	if (organization) {
		const orgLabel = String(data.organizationName || '').trim();
		organization.textContent = orgLabel;
		organization.hidden = !orgLabel;
	}
	if (service) service.textContent = data.serviceName || '—';

	if (duration) {
		const mins = Number(data.durationMinutes || 0);
		if (mins > 0) {
			duration.textContent = `${mins} min`;
			duration.hidden = false;
		} else {
			duration.textContent = '';
			duration.hidden = true;
		}
	}

	const parsedDate = parseApiDate(data.dateYmd);
	if (dateEl) dateEl.textContent = parsedDate ? formatTicketDate(parsedDate) : data.dateYmd || '—';
	if (timeEl) {
		const normalizedTime = String(data.time || '').trim();
		const parsedDateTime =
			data.dateYmd && normalizedTime
				? parseApiDateTime(`${data.dateYmd}T${normalizedTime}`)
				: null;
		timeEl.textContent = parsedDateTime
			? `${formatFriendlyTime(parsedDateTime)} hs`
			: normalizedTime
				? `${normalizedTime} hs`
				: '—';
	}

	if (locationName) locationName.textContent = String(data.locationName || '').trim() || '—';
	if (locationAddress) {
		locationAddress.textContent = String(data.locationAddress || '').trim() || '—';
	}

	const imageUrl = String(data.imageUrl || '').trim();
	if (avatarImg && avatarEmpty) {
		if (imageUrl) {
			avatarImg.src = imageUrl;
			avatarImg.alt = `Foto de ${data.professionalName}`;
			avatarImg.hidden = false;
			avatarEmpty.hidden = true;
		} else {
			avatarImg.removeAttribute('src');
			avatarImg.hidden = true;
			avatarEmpty.hidden = false;
		}
	}
};
