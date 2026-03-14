export const ROLES = {
	ADMIN: 1,
	RECEPCIONISTA: 2,
	PROFESIONAL: 3,
} as const;

export type RoleId = (typeof ROLES)[keyof typeof ROLES];

const ALL_ROLES: readonly RoleId[] = [ROLES.ADMIN, ROLES.RECEPCIONISTA, ROLES.PROFESIONAL];
const MANAGER_ROLES: readonly RoleId[] = [ROLES.ADMIN, ROLES.RECEPCIONISTA];

type RouteMatchType = 'exact' | 'prefix';

type RoutePermission = {
	path: string;
	roles: readonly RoleId[];
	match?: RouteMatchType;
};

export const ROUTE_PERMISSIONS: readonly RoutePermission[] = [
	{ path: '/', roles: ALL_ROLES },
	{ path: '/calendar', roles: ALL_ROLES },
	{ path: '/services', roles: MANAGER_ROLES },
	{ path: '/locations', roles: MANAGER_ROLES },
	{ path: '/specialties', roles: MANAGER_ROLES },
	{ path: '/professionals', roles: MANAGER_ROLES },
	{ path: '/schedules', roles: ALL_ROLES },

	{ path: '/api/appointments', roles: ALL_ROLES, match: 'prefix' },
	{ path: '/api/schedules', roles: ALL_ROLES, match: 'prefix' },
	{ path: '/api/services', roles: MANAGER_ROLES, match: 'prefix' },
	{ path: '/api/locations', roles: MANAGER_ROLES, match: 'prefix' },
	{ path: '/api/specialties', roles: MANAGER_ROLES, match: 'prefix' },
	{ path: '/api/professionals', roles: MANAGER_ROLES, match: 'prefix' },
	{ path: '/api/profile', roles: ALL_ROLES, match: 'prefix' },
	{ path: '/api/workspace', roles: [ROLES.ADMIN], match: 'prefix' },
	{ path: '/api/roles', roles: MANAGER_ROLES, match: 'prefix' },
	{ path: '/api/catalog', roles: MANAGER_ROLES, match: 'prefix' },
];

const normalizePath = (path: string) => {
	if (!path || path === '/') return '/';
	return path.endsWith('/') ? path.slice(0, -1) : path;
};

const isPrefixMatch = (pathname: string, basePath: string) => {
	return pathname === basePath || pathname.startsWith(`${basePath}/`);
};

export const isKnownRoleId = (roleId: number): roleId is RoleId => {
	return ALL_ROLES.some((item) => item === roleId);
};

export const getAllowedRolesForPath = (pathname: string): readonly RoleId[] | null => {
	const normalizedPath = normalizePath(pathname);

	for (const rule of ROUTE_PERMISSIONS) {
		const rulePath = normalizePath(rule.path);
		const matchType = rule.match ?? 'exact';
		const matches =
			matchType === 'prefix'
				? isPrefixMatch(normalizedPath, rulePath)
				: normalizedPath === rulePath;

		if (matches) return rule.roles;
	}

	return null;
};

export const canAccessPath = (pathname: string, roleId: number) => {
	const allowedRoles = getAllowedRolesForPath(pathname);
	if (!allowedRoles) return true;
	return allowedRoles.some((item) => item === roleId);
};
