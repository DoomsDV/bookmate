export type PlanBenefit = { title: string };

export type PlanMarketing = {
	tagline: string;
	includesBase?: boolean;
	benefits: PlanBenefit[];
};

export const FEATURE_LABELS: Record<string, string> = {
	WEB_BOOKING: 'Reservas 24/7',
	NOTIFICATIONS: 'Notificaciones',
	CUSTOMERS: 'Clientes',
	SERVICES: 'Servicios',
	TEAM_MULTI_BRANCH: 'Equipo ilimitado',
	AI_MORNING_DIGEST: 'Resumen con IA',
	VOICE_RECEPTION: 'Turnos por voz',
	DEPOSIT_COLLECTION: 'Cobro de señas',
	APPOINTMENT_HISTORY: 'Historial del cliente',
	PROFITABILITY_ANALYTICS: 'Análisis de rentabilidad',
};

export const PLAN_MARKETING: Record<string, PlanMarketing> = {
	BASE: {
		tagline: 'Para tu negocio.',
		benefits: [
			{ title: 'Equipo ilimitado' },
			{ title: 'Hub público' },
			{ title: 'Reservas 24/7' },
			{ title: 'Calendario' },
			{ title: 'Notificaciones' },
		],
	},
	PREMIUM: {
		tagline: 'Para tu agenda.',
		includesBase: true,
		benefits: [
			{ title: 'Escaneo de agenda' },
			{ title: 'Turnos por voz' },
			{ title: 'Cobro de señas' },
			{ title: 'Historial del cliente' },
			{ title: '5 GB de almacenamiento' },
		],
	},
};

const gsFormatter = new Intl.NumberFormat('es-PY');

export const featureLabel = (code: string) => FEATURE_LABELS[code] ?? code;

export const planMarketing = (code: string): PlanMarketing | null => PLAN_MARKETING[code] ?? null;

export const formatPlanGs = (amount: number) =>
	`${gsFormatter.format(Math.max(0, Math.round(amount)))} Gs`;
