export const DASHBOARD_ALERTS_MAX = 5;
export const COBROS_HREF = '/panel/cobros?status=pending';
export const PERSONAL_HREF = '/panel/professionals';
export const SERVICES_HREF = '/panel/services';
export const LOCATIONS_HREF = '/panel/locations';
export const SCHEDULES_HREF = '/panel/schedules';

export type DashboardAlertId =
	| 'staff_hub'
	| 'pending_payments'
	| 'setup_service'
	| 'setup_location'
	| 'setup_schedule';

export type DashboardAlert = {
	id: DashboardAlertId;
	icon: string;
	message: string;
	ctaLabel: string;
	href: string;
};

export type DashboardAlertCapabilities = {
	canViewProfessionals: boolean;
	canViewCobros: boolean;
	canViewServices: boolean;
	canViewLocations: boolean;
	canViewSchedules: boolean;
};

export type DashboardAlertsInput = DashboardAlertCapabilities & {
	staffTotalCount: number | null;
	staffIncompleteCount: number | null;
	pendingPaymentsCount: number | null;
	serviceCount: number | null;
	locationCount: number | null;
	hasAnySchedule: boolean | null;
};

export const buildDashboardAlerts = (input: DashboardAlertsInput): DashboardAlert[] => {
	const alerts: DashboardAlert[] = [];

	if (input.canViewCobros && (input.pendingPaymentsCount ?? 0) > 0) {
		const count = input.pendingPaymentsCount ?? 0;
		alerts.push({
			id: 'pending_payments',
			icon: 'payments',
			message:
				count === 1
					? 'Hay 1 seña pendiente de revisar.'
					: `Hay ${count} señas pendientes de revisar.`,
			ctaLabel: 'Ir a Cobros',
			href: COBROS_HREF,
		});
	}

	if (input.canViewProfessionals && input.staffTotalCount !== null) {
		if (input.staffTotalCount <= 0) {
			alerts.push({
				id: 'staff_hub',
				icon: 'badge',
				message: 'Todavía no hay personal. Agregá a quien atiende.',
				ctaLabel: 'Ir a Personal',
				href: PERSONAL_HREF,
			});
		} else if ((input.staffIncompleteCount ?? 0) > 0) {
			const count = input.staffIncompleteCount ?? 0;
			alerts.push({
				id: 'staff_hub',
				icon: 'badge',
				message:
					count === 1
						? '1 persona del equipo no aparece en el hub: falta foto o bio.'
						: `${count} personas del equipo no aparecen en el hub: falta foto o bio.`,
				ctaLabel: 'Completar en Personal',
				href: PERSONAL_HREF,
			});
		}
	}

	if (input.canViewServices && input.serviceCount === 0) {
		alerts.push({
			id: 'setup_service',
			icon: 'inventory_2',
			message: 'Falta un servicio. Sin eso los clientes no pueden reservar.',
			ctaLabel: 'Ir a Servicios',
			href: SERVICES_HREF,
		});
	}

	if (input.canViewLocations && input.locationCount === 0) {
		alerts.push({
			id: 'setup_location',
			icon: 'storefront',
			message: 'Falta una sucursal para abrir turnos.',
			ctaLabel: 'Ir a Sucursales',
			href: LOCATIONS_HREF,
		});
	}

	if (
		input.canViewSchedules &&
		input.hasAnySchedule === false &&
		(input.staffTotalCount === null || input.staffTotalCount > 0)
	) {
		alerts.push({
			id: 'setup_schedule',
			icon: 'schedule',
			message: 'Falta configurar horarios para que puedan reservar.',
			ctaLabel: 'Ir a Horarios',
			href: SCHEDULES_HREF,
		});
	}

	return alerts.slice(0, DASHBOARD_ALERTS_MAX);
};
