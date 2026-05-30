import type { UserBookingService } from './types';

export const formatDuration = (totalMinutes: number) => {
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (minutes === 0) return `${hours} h`;
	return `${hours} h ${minutes} min`;
};

export const formatCurrency = (value: number) =>
	new Intl.NumberFormat('es-PY', {
		style: 'currency',
		currency: 'PYG',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0);

export const calculateDepositAmount = (service: UserBookingService | null) => {
	if (!service || Number(service.requires_deposit || 0) !== 1) return 0;

	const fromApi = Number(service.deposit_amount ?? NaN);
	if (Number.isFinite(fromApi) && fromApi > 0) return fromApi;

	const depositType = String(service.deposit_type || '').trim().toUpperCase();
	const depositValue = Number(service.deposit_value || 0);
	const price = Number(service.price || 0);

	if (depositType === 'PERCENT') return Math.round((price * depositValue) / 100);
	if (depositType === 'FIXED') return depositValue;
	return 0;
};

export const formatLocationCardTitle = (location: {
	organization_name?: string;
	name?: string;
}) => {
	const org = String(location.organization_name || '').trim();
	const branch = String(location.name || '').trim();
	if (org && branch) return `${org} · ${branch}`;
	return org || branch || 'Sucursal';
};

export const formatBranchLabel = (location: { name?: string; address?: string }) => {
	const branch = String(location.name || '').trim();
	const address = String(location.address || '').trim();
	return branch || address || 'Sucursal';
};
