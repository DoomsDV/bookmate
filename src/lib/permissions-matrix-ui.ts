import { CAPABILITY_CATALOG } from '../config/capabilities.ts';

export type PermissionSearchItem = {
	code: string;
	label: string;
	description?: string;
	group_code: string;
	group_label: string;
};

const catalogVisibleByCode = new Map(
	CAPABILITY_CATALOG.map((item) => [
		item.code,
		{ label: item.label, description: item.description, groupLabel: item.groupLabel },
	])
);

export type PermissionSearchRole = {
	role_id: number;
	name: string;
};

export type PermissionFilterResult = {
	visibleCodes: Set<string> | null;
	highlightRoleIds: number[];
	empty: boolean;
	visibleCount: number;
};

export const normalizeSearchText = (value: string) =>
	String(value || '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim();

export const escapeHtml = (value: string) =>
	String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

/** Copy visible in Ajustes → Permisos. Keys (`module.action`) y kind quedan fuera. */
export const permissionVisibleCopy = (
	item: Pick<PermissionSearchItem, 'label' | 'description'> & { code?: string }
) => {
	const overlay = item.code ? catalogVisibleByCode.get(item.code) : undefined;
	return {
		label: String(overlay?.label || item.label || '').trim(),
		description: String(overlay?.description ?? item.description ?? '').trim(),
	};
};

export const overlayCatalogItemCopy = <T extends PermissionSearchItem>(item: T): T => {
	const overlay = catalogVisibleByCode.get(item.code);
	if (!overlay) return item;
	return {
		...item,
		label: overlay.label,
		description: overlay.description,
		group_label: overlay.groupLabel,
	};
};

export const overlayPermissionMatrix = <T extends { catalog?: PermissionSearchItem[] }>(matrix: T): T => ({
	...matrix,
	catalog: (matrix.catalog || []).map((item) => overlayCatalogItemCopy(item)),
});

export const permissionRowMatches = (item: PermissionSearchItem, query: string) => {
	const needle = normalizeSearchText(query);
	if (!needle) return true;
	const haystack = [item.label, item.description, item.group_label]
		.map((part) => normalizeSearchText(String(part || '')))
		.join(' ');
	return haystack.includes(needle);
};

export const matchingRoleIds = (roles: PermissionSearchRole[], query: string) => {
	const needle = normalizeSearchText(query);
	if (!needle) return [];
	return roles
		.filter((role) => normalizeSearchText(role.name).includes(needle))
		.map((role) => role.role_id);
};

export const filterPermissionsMatrix = (
	catalog: PermissionSearchItem[],
	roles: PermissionSearchRole[],
	query: string
): PermissionFilterResult => {
	const needle = normalizeSearchText(query);
	if (!needle) {
		return {
			visibleCodes: null,
			highlightRoleIds: [],
			empty: catalog.length === 0,
			visibleCount: catalog.length,
		};
	}

	const rowMatches = catalog.filter((item) => permissionRowMatches(item, needle));
	const highlightRoleIds = matchingRoleIds(roles, needle);

	if (rowMatches.length === 0 && highlightRoleIds.length > 0) {
		return {
			visibleCodes: null,
			highlightRoleIds,
			empty: false,
			visibleCount: catalog.length,
		};
	}

	if (rowMatches.length === 0) {
		return {
			visibleCodes: new Set(),
			highlightRoleIds: [],
			empty: true,
			visibleCount: 0,
		};
	}

	return {
		visibleCodes: new Set(rowMatches.map((item) => item.code)),
		highlightRoleIds,
		empty: false,
		visibleCount: rowMatches.length,
	};
};
