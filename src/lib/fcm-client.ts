import { getFcmTokenFromFirebase } from '../scripts/firebase-messaging';

export const FCM_PROMPT_COOKIE_KEY = 'fcm_prompt_pending';
export const FCM_DEVICE_TOKEN_STORAGE_KEY = 'hasel:fcm:device-token';
export const FCM_PROMPT_SHOWN_SESSION_KEY = 'hasel:fcm:prompt-shown';
export const IOS_INSTALL_GUIDE_SHOWN_SESSION_KEY = 'hasel:fcm:ios-install-guide-shown';

export type PushPermissionState = NotificationPermission | 'unsupported';

export type PushNotificationUiState = {
	pwaInstalled: boolean;
	browserSupported: boolean;
	permission: PushPermissionState;
	deviceSubscribed: boolean;
	switchEnabled: boolean;
	switchChecked: boolean;
};

const readCookie = (name: string) => {
	if (typeof document === 'undefined') return '';
	const pattern = new RegExp(
		`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`
	);
	const match = document.cookie.match(pattern);
	return match ? decodeURIComponent(match[1]) : '';
};

export const clearCookie = (name: string) => {
	if (typeof document === 'undefined') return;
	document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
};

export const isInstalledPwaContext = () => {
	if (typeof window === 'undefined') return false;

	const isStandaloneDisplayMode = window.matchMedia('(display-mode: standalone)').matches;
	const isIosStandalone = Boolean(
		(window.navigator as Navigator & { standalone?: boolean }).standalone
	);
	const isAndroidTwa = document.referrer.startsWith('android-app://');

	return isStandaloneDisplayMode || isIosStandalone || isAndroidTwa;
};

/** iPhone/iPad (incluye iPadOS desktop UA). */
export const isIosBrowser = () => {
	if (typeof window === 'undefined') return false;
	const ua = window.navigator.userAgent;
	if (/iPhone|iPad|iPod/i.test(ua)) return true;
	// iPadOS 13+ puede reportarse como MacIntel con touch.
	return (
		window.navigator.platform === 'MacIntel' &&
		typeof window.navigator.maxTouchPoints === 'number' &&
		window.navigator.maxTouchPoints > 1
	);
};

export const inferFcmPlatform = () => {
	const userAgent = window.navigator.userAgent.toLowerCase();
	if (userAgent.includes('android')) return 'android';
	if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ios')) {
		return 'ios';
	}
	if (isIosBrowser()) return 'ios';
	return 'web';
};

const getStoredDeviceToken = () => {
	const localToken = String(localStorage.getItem(FCM_DEVICE_TOKEN_STORAGE_KEY) || '').trim();
	if (localToken) return localToken;
	return String(readCookie('fcm_device_token') || '').trim();
};

export const getPushNotificationUiState = (): PushNotificationUiState => {
	const pwaInstalled = isInstalledPwaContext();
	const browserSupported = typeof window !== 'undefined' && 'Notification' in window;
	const permission: PushPermissionState = browserSupported
		? Notification.permission
		: 'unsupported';
	const hasDeviceToken = Boolean(getStoredDeviceToken());
	const deviceSubscribed = permission === 'granted' && hasDeviceToken;

	return {
		pwaInstalled,
		browserSupported,
		permission,
		deviceSubscribed,
		switchEnabled: pwaInstalled && browserSupported && permission !== 'denied',
		switchChecked: deviceSubscribed,
	};
};

export const showFcmAlert = async (title: string, message: string) => {
	if (window.BookmateAlert?.alert) {
		await window.BookmateAlert.alert({
			type: 'info',
			title,
			message,
			confirmText: 'Entendido',
		});
		return;
	}
	window.alert(message);
};

/** Misma alerta del sistema, con pasos visuales para «Agregar a inicio» en iOS. */
export const showIosPwaInstallGuide = async () => {
	const messageHtml = `
		<p class="app-alert-install-lead">Para recibir recordatorios de tus citas al instante, instalá la app:</p>
		<ol class="app-alert-install-steps">
			<li>
				<span class="material-symbols-rounded" aria-hidden="true">ios_share</span>
				<span>Tocá <strong>Compartir</strong> en Safari</span>
			</li>
			<li>
				<span class="material-symbols-rounded" aria-hidden="true">add_box</span>
				<span>Elegí <strong>Agregar a pantalla de inicio</strong></span>
			</li>
			<li>
				<span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
				<span>Confirmá con <strong>Agregar</strong> y abrí Hasel desde el inicio</span>
			</li>
		</ol>
		<p class="app-alert-install-note">Cuando la abras como app, te vamos a pedir activar las notificaciones.</p>
	`.trim();

	if (window.BookmateAlert?.alert) {
		await window.BookmateAlert.alert({
			type: 'info',
			icon: 'ios_share',
			title: 'Instalá Hasel en tu iPhone',
			messageHtml,
			confirmText: 'Entendido',
		});
		return;
	}

	window.alert(
		'Para recibir recordatorios, instalá Hasel: tocá Compartir → Agregar a pantalla de inicio. Después abrí la app desde el inicio para activar notificaciones.'
	);
};

const askNotificationConsent = async () => {
	const message =
		'¿Querés activar notificaciones para recibir avisos de nuevas citas y recordatorios en este dispositivo?';
	if (window.BookmateAlert?.confirm) {
		return window.BookmateAlert.confirm({
			type: 'info',
			icon: 'notifications_active',
			title: 'Activar notificaciones',
			message,
			confirmText: 'Activar',
			cancelText: 'Ahora no',
		});
	}
	return window.confirm(message);
};

export const subscribeCurrentDevice = async (fcmToken: string) => {
	const response = await fetch('/api/fcm/subscribe', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			fcm_token: fcmToken,
			platform: inferFcmPlatform(),
		}),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok || payload?.status !== 'success') {
		throw new Error(payload?.message || 'No fue posible activar las notificaciones.');
	}
};

export const unsubscribeCurrentDevice = async () => {
	const fcmToken = getStoredDeviceToken();
	if (!fcmToken) {
		localStorage.removeItem(FCM_DEVICE_TOKEN_STORAGE_KEY);
		clearCookie('fcm_device_token');
		return;
	}

	const response = await fetch('/api/fcm/unsubscribe', {
		method: 'DELETE',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({ fcm_token: fcmToken }),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok || payload?.status !== 'success') {
		throw new Error(payload?.message || 'No fue posible desactivar las notificaciones.');
	}

	localStorage.removeItem(FCM_DEVICE_TOKEN_STORAGE_KEY);
	clearCookie('fcm_device_token');
	clearCookie(FCM_PROMPT_COOKIE_KEY);
};

export const resolveAndSyncDeviceToken = async (options?: {
	forceSubscribe?: boolean;
	silent?: boolean;
}) => {
	const forceSubscribe = Boolean(options?.forceSubscribe);
	const silent = Boolean(options?.silent);
	const storedToken = getStoredDeviceToken();

	let firebaseToken = '';
	try {
		firebaseToken = await getFcmTokenFromFirebase();
	} catch (error) {
		if (storedToken) return storedToken;
		if (silent) return '';
		throw error;
	}

	const resolvedToken = String(firebaseToken || storedToken).trim();
	if (!resolvedToken) return '';

	if (resolvedToken !== storedToken) {
		localStorage.setItem(FCM_DEVICE_TOKEN_STORAGE_KEY, resolvedToken);
	}

	if (forceSubscribe || resolvedToken !== storedToken) {
		await subscribeCurrentDevice(resolvedToken);
	}

	return resolvedToken;
};

const requestBrowserNotificationPermission = async (options?: { fromSettings?: boolean }) => {
	if (!('Notification' in window)) {
		throw new Error('Este navegador no soporta notificaciones push.');
	}

	if (Notification.permission === 'granted') return 'granted' as const;
	if (Notification.permission === 'denied') {
		throw new Error(
			'Las notificaciones están bloqueadas en este dispositivo. Habilitalas desde la configuración del navegador o del sistema.'
		);
	}

	if (options?.fromSettings) {
		return Notification.requestPermission();
	}

	const accepted = await askNotificationConsent();
	if (!accepted) return 'rejected' as const;
	return Notification.requestPermission();
};

export const enablePushNotifications = async (options?: { fromSettings?: boolean }) => {
	if (!isInstalledPwaContext()) {
		if (isIosBrowser()) {
			await showIosPwaInstallGuide();
			throw new Error(
				'Instalá Hasel en tu iPhone (Compartir → Agregar a pantalla de inicio) y abrila desde el inicio para activar notificaciones.'
			);
		}
		throw new Error(
			'Instalá la app en tu dispositivo (PWA) para activar notificaciones desde este panel.'
		);
	}

	const permission = await requestBrowserNotificationPermission(options);
	if (permission !== 'granted') {
		throw new Error('No se otorgó permiso para mostrar notificaciones en este dispositivo.');
	}

	const deviceToken = await resolveAndSyncDeviceToken({ forceSubscribe: true });
	if (!deviceToken) {
		throw new Error('No se obtuvo el token FCM de Firebase para este dispositivo.');
	}

	clearCookie(FCM_PROMPT_COOKIE_KEY);
	return deviceToken;
};

export const disablePushNotifications = async () => {
	await unsubscribeCurrentDevice();
};

export const refreshPushTokenSilently = async () => {
	if (!('Notification' in window)) return;
	if (Notification.permission !== 'granted') return;
	if (!isInstalledPwaContext()) return;

	try {
		await resolveAndSyncDeviceToken({ forceSubscribe: false, silent: true });
	} catch {
		// Mantener el refresh silencioso sin bloquear la UI.
	}
};

/**
 * Onboarding unificado:
 * 1) iOS Safari (sin PWA) → misma alerta, texto de instalación.
 * 2) PWA instalada → misma alerta, texto de activar notificaciones.
 */
export const runPushOnboardingIfNeeded = async () => {
	const promptPending = readCookie(FCM_PROMPT_COOKIE_KEY) === '1';
	if (!promptPending) return false;

	await waitForBookmateAlert();

	if (!isInstalledPwaContext()) {
		if (!isIosBrowser()) return false;
		if (sessionStorage.getItem(IOS_INSTALL_GUIDE_SHOWN_SESSION_KEY) === '1') return true;
		sessionStorage.setItem(IOS_INSTALL_GUIDE_SHOWN_SESSION_KEY, '1');
		await showIosPwaInstallGuide();
		// Mantener fcm_prompt_pending para el paso de notificaciones al abrir la PWA.
		return true;
	}

	if (sessionStorage.getItem(FCM_PROMPT_SHOWN_SESSION_KEY) === '1') return true;
	sessionStorage.setItem(FCM_PROMPT_SHOWN_SESSION_KEY, '1');

	try {
		const permission = await requestBrowserNotificationPermission();
		if (permission !== 'granted') return true;

		const deviceToken = await resolveAndSyncDeviceToken({ forceSubscribe: true });
		if (!deviceToken) {
			await showFcmAlert(
				'No se pudo suscribir',
				'No se obtuvo el token FCM de Firebase para este dispositivo.'
			);
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'No fue posible activar las notificaciones.';
		await showFcmAlert('Notificaciones', message);
	} finally {
		clearCookie(FCM_PROMPT_COOKIE_KEY);
	}

	return true;
};

const waitForBookmateAlert = async (timeoutMs = 1800) => {
	if (window.BookmateAlert) return;
	const started = Date.now();
	while (!window.BookmateAlert && Date.now() - started < timeoutMs) {
		await new Promise((resolve) => window.setTimeout(resolve, 40));
	}
};

/** @deprecated Preferí runPushOnboardingIfNeeded */
export const runInitialFcmPromptIfNeeded = async () => {
	if (!isInstalledPwaContext()) return false;
	return runPushOnboardingIfNeeded();
};
