export type SessionClaims = {
	user_id: number;
	role_id: number;
	organization_id: number;
};

const toInt = (value: unknown) => {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : 0;
};

const decodeBase64Url = (value: string) => {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padding = normalized.length % 4;
	const safeValue = padding ? `${normalized}${'='.repeat(4 - padding)}` : normalized;
	const binary = atob(safeValue);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
};

export const parseTokenClaims = (token: string): SessionClaims => {
	try {
		const parts = token.split('.');
		if (parts.length < 2) return { user_id: 0, role_id: 0, organization_id: 0 };

		const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
		return {
			user_id: toInt(payload.user_id ?? payload.id_user ?? 0),
			role_id: toInt(payload.role_id ?? payload.rol_id_role ?? 0),
			organization_id: toInt(payload.organization_id ?? payload.org_id_organization ?? 0),
		};
	} catch {
		return { user_id: 0, role_id: 0, organization_id: 0 };
	}
};
