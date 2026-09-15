/** Mismos IDs que `ROLES` en roles.ts. No importar de ahí: evita ciclo. */
const ADMIN = 1;
const PROFESIONAL = 2;
const RECEPCIONISTA = 3;

type BaseRoleId = typeof ADMIN | typeof PROFESIONAL | typeof RECEPCIONISTA;

export const CAPABILITIES = {
	DASHBOARD_VIEW: 'dashboard.view',
	CALENDAR_VIEW: 'calendar.view',
	CALENDAR_MANAGE: 'calendar.manage',
	CUSTOMERS_VIEW: 'customers.view',
	CUSTOMERS_CREATE: 'customers.create',
	CUSTOMERS_EDIT: 'customers.edit',
	CUSTOMERS_EXPORT: 'customers.export',
	COBROS_VIEW: 'cobros.view',
	COBROS_MANAGE: 'cobros.manage',
	SERVICES_VIEW: 'services.view',
	SERVICES_MANAGE: 'services.manage',
	LOCATIONS_VIEW: 'locations.view',
	LOCATIONS_MANAGE: 'locations.manage',
	PUBLIC_PROFILE_MANAGE: 'public_profile.manage',
	ADDONS_VIEW: 'addons.view',
	ADDONS_MANAGE: 'addons.manage',
	ADDONS_ODONTOGRAM: 'addons.odontogram',
	ADDONS_BODY_MAP: 'addons.body_map',
	SPECIALTIES_VIEW: 'specialties.view',
	SPECIALTIES_MANAGE: 'specialties.manage',
	PROFESSIONALS_VIEW: 'professionals.view',
	PROFESSIONALS_MANAGE: 'professionals.manage',
	SCHEDULES_VIEW: 'schedules.view',
	SCHEDULES_MANAGE: 'schedules.manage',
	AJUSTES_VIEW: 'ajustes.view',
	WORKSPACE_MANAGE: 'workspace.manage',
	PLAN_VIEW: 'plan.view',
	PLAN_MANAGE: 'plan.manage',
	PERMISSIONS_MANAGE: 'permissions.manage',
} as const;

export type CapabilityCode = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export type CapabilityKind = 'MENU' | 'ACTION' | 'ADDON';

export type CapabilityDefinition = {
	code: CapabilityCode;
	groupCode: string;
	groupLabel: string;
	label: string;
	description: string;
	kind: CapabilityKind;
	sortOrder: number;
	requiresEntitlement?: string;
	lockedForRoles?: readonly BaseRoleId[];
};

type RouteMatchType = 'exact' | 'prefix';

export type CapabilityRoute = {
	path: string;
	capability: CapabilityCode;
	match?: RouteMatchType;
};

const A = ADMIN;
const P = PROFESIONAL;
const R = RECEPCIONISTA;

/**
 * Defaults = comportamiento real de staging (HAS-28 / HAS-32), no solo ROUTE_PERMISSIONS.
 * Recepción ve sucursales/servicios/especialidades pero no las edita.
 */
export const DEFAULT_ROLE_CAPABILITIES: Record<BaseRoleId, readonly CapabilityCode[]> = {
	[A]: [
		CAPABILITIES.DASHBOARD_VIEW,
		CAPABILITIES.CALENDAR_VIEW,
		CAPABILITIES.CALENDAR_MANAGE,
		CAPABILITIES.CUSTOMERS_VIEW,
		CAPABILITIES.CUSTOMERS_CREATE,
		CAPABILITIES.CUSTOMERS_EDIT,
		CAPABILITIES.CUSTOMERS_EXPORT,
		CAPABILITIES.COBROS_VIEW,
		CAPABILITIES.COBROS_MANAGE,
		CAPABILITIES.SERVICES_VIEW,
		CAPABILITIES.SERVICES_MANAGE,
		CAPABILITIES.LOCATIONS_VIEW,
		CAPABILITIES.LOCATIONS_MANAGE,
		CAPABILITIES.PUBLIC_PROFILE_MANAGE,
		CAPABILITIES.ADDONS_VIEW,
		CAPABILITIES.ADDONS_MANAGE,
		CAPABILITIES.ADDONS_ODONTOGRAM,
		CAPABILITIES.ADDONS_BODY_MAP,
		CAPABILITIES.SPECIALTIES_VIEW,
		CAPABILITIES.SPECIALTIES_MANAGE,
		CAPABILITIES.PROFESSIONALS_VIEW,
		CAPABILITIES.PROFESSIONALS_MANAGE,
		CAPABILITIES.SCHEDULES_VIEW,
		CAPABILITIES.SCHEDULES_MANAGE,
		CAPABILITIES.AJUSTES_VIEW,
		CAPABILITIES.WORKSPACE_MANAGE,
		CAPABILITIES.PLAN_VIEW,
		CAPABILITIES.PLAN_MANAGE,
		CAPABILITIES.PERMISSIONS_MANAGE,
	],
	[R]: [
		CAPABILITIES.DASHBOARD_VIEW,
		CAPABILITIES.CALENDAR_VIEW,
		CAPABILITIES.CALENDAR_MANAGE,
		CAPABILITIES.CUSTOMERS_VIEW,
		CAPABILITIES.CUSTOMERS_CREATE,
		CAPABILITIES.CUSTOMERS_EDIT,
		CAPABILITIES.CUSTOMERS_EXPORT,
		CAPABILITIES.COBROS_VIEW,
		CAPABILITIES.COBROS_MANAGE,
		CAPABILITIES.SERVICES_VIEW,
		CAPABILITIES.LOCATIONS_VIEW,
		CAPABILITIES.ADDONS_ODONTOGRAM,
		CAPABILITIES.ADDONS_BODY_MAP,
		CAPABILITIES.SPECIALTIES_VIEW,
		CAPABILITIES.PROFESSIONALS_VIEW,
		CAPABILITIES.PROFESSIONALS_MANAGE,
		CAPABILITIES.SCHEDULES_VIEW,
		CAPABILITIES.SCHEDULES_MANAGE,
		CAPABILITIES.AJUSTES_VIEW,
	],
	[P]: [
		CAPABILITIES.DASHBOARD_VIEW,
		CAPABILITIES.CALENDAR_VIEW,
		CAPABILITIES.CALENDAR_MANAGE,
		CAPABILITIES.CUSTOMERS_VIEW,
		CAPABILITIES.CUSTOMERS_EXPORT,
		CAPABILITIES.SERVICES_VIEW,
		CAPABILITIES.ADDONS_ODONTOGRAM,
		CAPABILITIES.ADDONS_BODY_MAP,
		CAPABILITIES.SCHEDULES_VIEW,
		CAPABILITIES.AJUSTES_VIEW,
	],
};

export const CAPABILITY_CATALOG: readonly CapabilityDefinition[] = [
	{
		code: CAPABILITIES.DASHBOARD_VIEW,
		groupCode: 'dashboard',
		groupLabel: 'Dashboard',
		label: 'Ver dashboard',
		description: 'Acceso al inicio del panel.',
		kind: 'MENU',
		sortOrder: 10,
	},
	{
		code: CAPABILITIES.CALENDAR_VIEW,
		groupCode: 'calendar',
		groupLabel: 'Calendario',
		label: 'Ver calendario',
		description: 'Ver la agenda y el detalle de citas.',
		kind: 'MENU',
		sortOrder: 20,
	},
	{
		code: CAPABILITIES.CALENDAR_MANAGE,
		groupCode: 'calendar',
		groupLabel: 'Calendario',
		label: 'Crear y editar citas',
		description: 'Alta, edición y cancelación de turnos.',
		kind: 'ACTION',
		sortOrder: 21,
	},
	{
		code: CAPABILITIES.CUSTOMERS_VIEW,
		groupCode: 'customers',
		groupLabel: 'Clientes',
		label: 'Ver clientes',
		description: 'Listar y abrir fichas. El profesional solo ve los suyos.',
		kind: 'MENU',
		sortOrder: 30,
	},
	{
		code: CAPABILITIES.CUSTOMERS_CREATE,
		groupCode: 'customers',
		groupLabel: 'Clientes',
		label: 'Crear clientes',
		description: 'Alta de clientes desde el panel.',
		kind: 'ACTION',
		sortOrder: 31,
	},
	{
		code: CAPABILITIES.CUSTOMERS_EDIT,
		groupCode: 'customers',
		groupLabel: 'Clientes',
		label: 'Editar clientes',
		description: 'Modificar datos de contacto de un cliente.',
		kind: 'ACTION',
		sortOrder: 32,
	},
	{
		code: CAPABILITIES.CUSTOMERS_EXPORT,
		groupCode: 'customers',
		groupLabel: 'Clientes',
		label: 'Exportar clientes',
		description: 'Descargar el listado en CSV.',
		kind: 'ACTION',
		sortOrder: 33,
	},
	{
		code: CAPABILITIES.COBROS_VIEW,
		groupCode: 'cobros',
		groupLabel: 'Cobros',
		label: 'Ver cobros',
		description: 'Listado de señas y reembolsos. El menú de Cobros sigue exigiendo el plan con cobro de señas.',
		kind: 'MENU',
		sortOrder: 40,
	},
	{
		code: CAPABILITIES.COBROS_MANAGE,
		groupCode: 'cobros',
		groupLabel: 'Cobros',
		label: 'Gestionar cobros',
		description: 'Aprobar, rechazar o marcar reembolsos.',
		kind: 'ACTION',
		sortOrder: 41,
	},
	{
		code: CAPABILITIES.SERVICES_VIEW,
		groupCode: 'services',
		groupLabel: 'Servicios',
		label: 'Ver servicios',
		description: 'Consultar el catálogo de servicios.',
		kind: 'MENU',
		sortOrder: 50,
	},
	{
		code: CAPABILITIES.SERVICES_MANAGE,
		groupCode: 'services',
		groupLabel: 'Servicios',
		label: 'Crear y editar servicios',
		description: 'Alta, edición y baja de servicios.',
		kind: 'ACTION',
		sortOrder: 51,
	},
	{
		code: CAPABILITIES.LOCATIONS_VIEW,
		groupCode: 'locations',
		groupLabel: 'Sucursales',
		label: 'Ver sucursales',
		description: 'Entrar a Sucursales en solo lectura.',
		kind: 'MENU',
		sortOrder: 60,
	},
	{
		code: CAPABILITIES.LOCATIONS_MANAGE,
		groupCode: 'locations',
		groupLabel: 'Sucursales',
		label: 'Crear y editar sucursales',
		description: 'CRUD de sucursales y cierres. Default: solo Admin (la UI ya era así).',
		kind: 'ACTION',
		sortOrder: 61,
	},
	{
		code: CAPABILITIES.PUBLIC_PROFILE_MANAGE,
		groupCode: 'public_profile',
		groupLabel: 'Perfil público',
		label: 'Editar perfil público',
		description: 'Branding y página pública del negocio.',
		kind: 'MENU',
		sortOrder: 70,
	},
	{
		code: CAPABILITIES.ADDONS_VIEW,
		groupCode: 'addons',
		groupLabel: 'Complementos',
		label: 'Ver complementos',
		description: 'Abrir la página de complementos contratables.',
		kind: 'MENU',
		sortOrder: 80,
	},
	{
		code: CAPABILITIES.ADDONS_MANAGE,
		groupCode: 'addons',
		groupLabel: 'Complementos',
		label: 'Contratar complementos',
		description: 'Activar o cancelar addons de la organización.',
		kind: 'ACTION',
		sortOrder: 81,
	},
	{
		code: CAPABILITIES.ADDONS_ODONTOGRAM,
		groupCode: 'addons',
		groupLabel: 'Complementos',
		label: 'Usar odontograma',
		description: 'Abrir y editar odontograma. Requiere el complemento contratado.',
		kind: 'ADDON',
		sortOrder: 82,
		requiresEntitlement: 'ODONTOGRAM_3D',
	},
	{
		code: CAPABILITIES.ADDONS_BODY_MAP,
		groupCode: 'addons',
		groupLabel: 'Complementos',
		label: 'Usar mapa corporal',
		description: 'Abrir y editar mapa corporal. Requiere el complemento contratado.',
		kind: 'ADDON',
		sortOrder: 83,
		requiresEntitlement: 'BODY_MAP',
	},
	{
		code: CAPABILITIES.SPECIALTIES_VIEW,
		groupCode: 'specialties',
		groupLabel: 'Especialidades',
		label: 'Ver especialidades',
		description: 'Consultar especialidades del equipo.',
		kind: 'MENU',
		sortOrder: 90,
	},
	{
		code: CAPABILITIES.SPECIALTIES_MANAGE,
		groupCode: 'specialties',
		groupLabel: 'Especialidades',
		label: 'Crear y editar especialidades',
		description: 'Alta y edición de especialidades.',
		kind: 'ACTION',
		sortOrder: 91,
	},
	{
		code: CAPABILITIES.PROFESSIONALS_VIEW,
		groupCode: 'professionals',
		groupLabel: 'Personal',
		label: 'Ver personal',
		description: 'Listar profesionales e invitaciones.',
		kind: 'MENU',
		sortOrder: 100,
	},
	{
		code: CAPABILITIES.PROFESSIONALS_MANAGE,
		groupCode: 'professionals',
		groupLabel: 'Personal',
		label: 'Invitar y editar personal',
		description: 'Invitaciones, roles y visibilidad pública.',
		kind: 'ACTION',
		sortOrder: 101,
	},
	{
		code: CAPABILITIES.SCHEDULES_VIEW,
		groupCode: 'schedules',
		groupLabel: 'Horarios',
		label: 'Ver horarios',
		description: 'Consultar horarios y excepciones.',
		kind: 'MENU',
		sortOrder: 110,
	},
	{
		code: CAPABILITIES.SCHEDULES_MANAGE,
		groupCode: 'schedules',
		groupLabel: 'Horarios',
		label: 'Editar horarios del equipo',
		description: 'Crear y modificar horarios de otros profesionales.',
		kind: 'ACTION',
		sortOrder: 111,
	},
	{
		code: CAPABILITIES.AJUSTES_VIEW,
		groupCode: 'ajustes',
		groupLabel: 'Ajustes',
		label: 'Ver ajustes',
		description: 'Abrir Ajustes (perfil y seguridad propios).',
		kind: 'MENU',
		sortOrder: 120,
	},
	{
		code: CAPABILITIES.WORKSPACE_MANAGE,
		groupCode: 'ajustes',
		groupLabel: 'Ajustes',
		label: 'Configurar negocio',
		description: 'Apariencia, datos del negocio, pagos y sistema.',
		kind: 'ACTION',
		sortOrder: 121,
	},
	{
		code: CAPABILITIES.PLAN_VIEW,
		groupCode: 'plan',
		groupLabel: 'Plan',
		label: 'Ver plan',
		description: 'Ver el plan y la facturación Hasel.',
		kind: 'MENU',
		sortOrder: 130,
	},
	{
		code: CAPABILITIES.PLAN_MANAGE,
		groupCode: 'plan',
		groupLabel: 'Plan',
		label: 'Cambiar plan y facturación',
		description: 'Checkout, cambio de plan y medios de pago.',
		kind: 'ACTION',
		sortOrder: 131,
	},
	{
		code: CAPABILITIES.PERMISSIONS_MANAGE,
		groupCode: 'permissions',
		groupLabel: 'Permisos',
		label: 'Configurar permisos',
		description: 'Editar la matriz de accesos por rol. Siempre activo para Admin.',
		kind: 'ACTION',
		sortOrder: 140,
		lockedForRoles: [A],
	},
];

export const CAPABILITY_ROUTES: readonly CapabilityRoute[] = [
	{ path: '/panel', capability: CAPABILITIES.DASHBOARD_VIEW },
	{ path: '/panel/dashboard', capability: CAPABILITIES.DASHBOARD_VIEW },
	{ path: '/panel/calendar', capability: CAPABILITIES.CALENDAR_VIEW },
	{ path: '/calendar', capability: CAPABILITIES.CALENDAR_VIEW },
	{ path: '/panel/customers', capability: CAPABILITIES.CUSTOMERS_VIEW },
	{ path: '/panel/cobros', capability: CAPABILITIES.COBROS_VIEW },
	{ path: '/panel/services', capability: CAPABILITIES.SERVICES_VIEW },
	{ path: '/panel/locations', capability: CAPABILITIES.LOCATIONS_VIEW },
	{ path: '/panel/perfil-publico', capability: CAPABILITIES.PUBLIC_PROFILE_MANAGE },
	{ path: '/panel/specialties', capability: CAPABILITIES.SPECIALTIES_VIEW },
	{ path: '/panel/professionals', capability: CAPABILITIES.PROFESSIONALS_VIEW },
	{ path: '/panel/schedules', capability: CAPABILITIES.SCHEDULES_VIEW },
	{ path: '/panel/plan', capability: CAPABILITIES.PLAN_VIEW, match: 'prefix' },
	{ path: '/panel/ajustes', capability: CAPABILITIES.AJUSTES_VIEW },
	{ path: '/panel/complementos', capability: CAPABILITIES.ADDONS_VIEW },
	{ path: '/panel/ops', capability: CAPABILITIES.DASHBOARD_VIEW },

	{ path: '/api/appointments', capability: CAPABILITIES.CALENDAR_VIEW, match: 'prefix' },
	{ path: '/api/addons', capability: CAPABILITIES.ADDONS_VIEW, match: 'prefix' },
	{ path: '/api/customers', capability: CAPABILITIES.CUSTOMERS_VIEW, match: 'prefix' },
	{ path: '/api/cobros', capability: CAPABILITIES.COBROS_VIEW, match: 'prefix' },
	{ path: '/api/schedules', capability: CAPABILITIES.SCHEDULES_VIEW, match: 'prefix' },
	{ path: '/api/services', capability: CAPABILITIES.SERVICES_VIEW, match: 'prefix' },
	{ path: '/api/locations', capability: CAPABILITIES.LOCATIONS_VIEW, match: 'prefix' },
	{ path: '/api/specialties', capability: CAPABILITIES.SPECIALTIES_VIEW, match: 'prefix' },
	{ path: '/api/professionals', capability: CAPABILITIES.PROFESSIONALS_VIEW, match: 'prefix' },
	{ path: '/api/workspace', capability: CAPABILITIES.WORKSPACE_MANAGE, match: 'prefix' },
	{ path: '/api/billing-profile', capability: CAPABILITIES.PLAN_MANAGE, match: 'prefix' },
	{ path: '/api/org-payment-settings', capability: CAPABILITIES.WORKSPACE_MANAGE, match: 'prefix' },
	{ path: '/api/roles', capability: CAPABILITIES.PROFESSIONALS_VIEW, match: 'prefix' },
	{ path: '/api/catalog', capability: CAPABILITIES.LOCATIONS_VIEW, match: 'prefix' },
	{ path: '/api/permissions/matrix', capability: CAPABILITIES.PERMISSIONS_MANAGE, match: 'prefix' },
];

const normalizePath = (path: string) => {
	if (!path || path === '/') return '/';
	return path.endsWith('/') ? path.slice(0, -1) : path;
};

const isPrefixMatch = (pathname: string, basePath: string) =>
	pathname === basePath || pathname.startsWith(`${basePath}/`);

export const defaultCapabilitiesForRole = (roleId: number): readonly CapabilityCode[] => {
	if (roleId === A || roleId === P || roleId === R) {
		return DEFAULT_ROLE_CAPABILITIES[roleId];
	}
	return [];
};

export const isCapabilityGranted = (
	capabilities: readonly string[] | undefined,
	code: string,
	roleId?: number
) => {
	if (Array.isArray(capabilities)) {
		return capabilities.includes(code);
	}
	if (typeof roleId === 'number') {
		return defaultCapabilitiesForRole(roleId).includes(code as CapabilityCode);
	}
	return false;
};

export const getRequiredCapabilityForPath = (pathname: string): CapabilityCode | null => {
	const normalizedPath = normalizePath(pathname);

	for (const rule of CAPABILITY_ROUTES) {
		const rulePath = normalizePath(rule.path);
		const matchType = rule.match ?? 'exact';
		const matches =
			matchType === 'prefix'
				? isPrefixMatch(normalizedPath, rulePath)
				: normalizedPath === rulePath;
		if (matches) return rule.capability;
	}

	return null;
};

export const canAccessPathWithCapabilities = (
	pathname: string,
	capabilities: readonly string[] | undefined,
	roleId: number
) => {
	const required = getRequiredCapabilityForPath(pathname);
	if (!required) return true;
	return isCapabilityGranted(capabilities, required, roleId);
};

export const BASE_ROLES: readonly { roleId: BaseRoleId; name: string; label: string }[] = [
	{ roleId: A, name: 'ADMIN', label: 'Admin' },
	{ roleId: R, name: 'RECEPCIONISTA', label: 'Recepcionista' },
	{ roleId: P, name: 'PROFESIONAL', label: 'Profesional' },
];
