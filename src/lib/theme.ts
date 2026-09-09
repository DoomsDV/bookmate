export const PANEL_THEME_KEY = 'bookmate-theme';
export const THEME_COLOR_DARK = '#0c0e14';
export const THEME_COLOR_LIGHT = '#f6f7f9';

export type ResolvedTheme = 'light' | 'dark';
export type PanelThemePref = 'light' | 'dark' | 'system';

export const isPanelPath = (pathname: string): boolean => {
	const path = String(pathname || '').split(/[?#]/)[0] || '';
	return path === '/panel' || path.startsWith('/panel/');
};

export const systemTheme = (): ResolvedTheme => {
	try {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	} catch {
		return 'light';
	}
};

export const readStoredPanelTheme = (): ResolvedTheme | null => {
	try {
		const stored = localStorage.getItem(PANEL_THEME_KEY);
		if (stored === 'light' || stored === 'dark') return stored;
	} catch {
		/* private mode / quota */
	}
	return null;
};

export const resolveThemeForPath = (pathname: string): ResolvedTheme => {
	if (isPanelPath(pathname)) {
		return readStoredPanelTheme() ?? systemTheme();
	}
	return systemTheme();
};

export const themeFollowsSystem = (pathname: string): boolean =>
	!isPanelPath(pathname) || readStoredPanelTheme() === null;

export const themeColorFor = (theme: ResolvedTheme): string =>
	theme === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;

export const applyResolvedTheme = (
	theme: ResolvedTheme,
	root: HTMLElement = document.documentElement,
): void => {
	root.dataset.theme = theme;
	const doc = root.ownerDocument ?? document;
	doc.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
		if (meta instanceof HTMLMetaElement && !meta.media) {
			meta.content = themeColorFor(theme);
		}
	});
};

export const persistPanelTheme = (theme: ResolvedTheme): void => {
	try {
		localStorage.setItem(PANEL_THEME_KEY, theme);
	} catch {
		/* ignore */
	}
	try {
		document.cookie = `${PANEL_THEME_KEY}=${theme};path=/;max-age=31536000;SameSite=Lax`;
	} catch {
		/* ignore */
	}
};

export const clearPanelTheme = (): void => {
	try {
		localStorage.removeItem(PANEL_THEME_KEY);
	} catch {
		/* ignore */
	}
	try {
		document.cookie = `${PANEL_THEME_KEY}=;path=/;max-age=0;SameSite=Lax`;
	} catch {
		/* ignore */
	}
};

export const requestThemeSync = (): void => {
	window.__haselSyncTheme?.();
};
