const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const trimLeadingSlash = (value: string) => value.replace(/^\/+/, '');

const normalizeAbsoluteUrl = (rawValue: string, envName: string) => {
	const trimmed = String(rawValue || '').trim();
	if (!trimmed) {
		throw new Error(`[env] Missing required environment variable: ${envName}`);
	}

	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const parsed = new URL(withScheme);
		return `${parsed.origin}${trimTrailingSlash(parsed.pathname)}`;
	} catch {
		throw new Error(`[env] Invalid URL in ${envName}: "${trimmed}"`);
	}
};

const resolveFromBase = (baseEnvName: string, baseValue: string | undefined, pathFromBase: string) => {
	const normalizedBase = normalizeAbsoluteUrl(String(baseValue || ''), baseEnvName);
	const safePath = trimLeadingSlash(String(pathFromBase || '').trim());
	if (!safePath) return normalizedBase;
	return `${normalizedBase}/${safePath}`;
};

export const resolveOrdsApiUrl = (
	explicitUrl: string | undefined,
	explicitEnvName: string,
	pathFromApiBase: string
) => {
	const explicit = String(explicitUrl || '').trim();
	if (explicit) return normalizeAbsoluteUrl(explicit, explicitEnvName);
	return resolveFromBase('ORDS_API_BASE_URL', import.meta.env.ORDS_API_BASE_URL, pathFromApiBase);
};

export const resolveOrdsPublicApiUrl = (
	explicitUrl: string | undefined,
	explicitEnvName: string,
	pathFromPublicBase = ''
) => {
	const explicit = String(explicitUrl || '').trim();
	if (explicit) return normalizeAbsoluteUrl(explicit, explicitEnvName);
	return resolveFromBase(
		'ORDS_PUBLIC_API_BASE_URL',
		import.meta.env.ORDS_PUBLIC_API_BASE_URL,
		pathFromPublicBase
	);
};
