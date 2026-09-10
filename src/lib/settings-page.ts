export const SETTINGS_PAGE_PATH = '/panel/ajustes';

export const settingsPageHref = (tab?: string) => {
	const next = String(tab || '').trim();
	if (!next || next === 'profile') return SETTINGS_PAGE_PATH;
	return `${SETTINGS_PAGE_PATH}?tab=${encodeURIComponent(next)}`;
};
