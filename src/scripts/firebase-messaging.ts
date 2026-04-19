import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

const firebaseConfig: FirebaseOptions = {
	apiKey: String(import.meta.env.PUBLIC_FIREBASE_API_KEY || '').trim(),
	authDomain: String(import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN || '').trim(),
	projectId: String(import.meta.env.PUBLIC_FIREBASE_PROJECT_ID || '').trim(),
	storageBucket: String(import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET || '').trim(),
	messagingSenderId: String(import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
	appId: String(import.meta.env.PUBLIC_FIREBASE_APP_ID || '').trim(),
	measurementId: String(import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID || '').trim() || undefined,
};

const vapidKey = String(import.meta.env.PUBLIC_FIREBASE_VAPID_KEY || '').trim();
const FIREBASE_MESSAGING_SW_PATH = '/firebase-messaging-sw.js';
const FIREBASE_MESSAGING_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

const getMissingFirebaseVars = () => {
	const missing: string[] = [];
	if (!firebaseConfig.apiKey) missing.push('PUBLIC_FIREBASE_API_KEY');
	if (!firebaseConfig.projectId) missing.push('PUBLIC_FIREBASE_PROJECT_ID');
	if (!firebaseConfig.messagingSenderId) missing.push('PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
	if (!firebaseConfig.appId) missing.push('PUBLIC_FIREBASE_APP_ID');
	if (!vapidKey) missing.push('PUBLIC_FIREBASE_VAPID_KEY');
	return missing;
};

const ensureFirebaseConfig = () => {
	const missing = getMissingFirebaseVars();
	if (missing.length === 0) return;
	throw new Error(`Faltan variables Firebase para FCM: ${missing.join(', ')}`);
};

const getClientFirebaseApp = () => {
	if (getApps().length > 0) return getApp();
	return initializeApp(firebaseConfig);
};

const buildFirebaseMessagingSwUrl = () => {
	const swUrl = new URL(FIREBASE_MESSAGING_SW_PATH, window.location.origin);
	swUrl.searchParams.set('apiKey', firebaseConfig.apiKey || '');
	swUrl.searchParams.set('authDomain', firebaseConfig.authDomain || '');
	swUrl.searchParams.set('projectId', firebaseConfig.projectId || '');
	swUrl.searchParams.set('storageBucket', firebaseConfig.storageBucket || '');
	swUrl.searchParams.set('messagingSenderId', firebaseConfig.messagingSenderId || '');
	swUrl.searchParams.set('appId', firebaseConfig.appId || '');
	swUrl.searchParams.set('measurementId', firebaseConfig.measurementId || '');
	return swUrl.toString();
};

const waitForServiceWorkerActivation = async (registration: ServiceWorkerRegistration) => {
	if (registration.active) return registration;

	const pendingWorker = registration.installing || registration.waiting;
	if (!pendingWorker) return registration;

	await new Promise<void>((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			reject(new Error('No se pudo activar el Service Worker de Firebase a tiempo.'));
		}, 12000);

		const cleanup = () => {
			window.clearTimeout(timeoutId);
			pendingWorker.removeEventListener('statechange', onStateChange);
		};

		const onStateChange = () => {
			if (pendingWorker.state === 'activated') {
				cleanup();
				resolve();
				return;
			}

			if (pendingWorker.state === 'redundant') {
				cleanup();
				reject(new Error('El Service Worker de Firebase quedó redundante.'));
			}
		};

		pendingWorker.addEventListener('statechange', onStateChange);
		onStateChange();
	});

	return registration;
};

const getFirebaseMessagingServiceWorkerRegistration = async () => {
	const swUrl = buildFirebaseMessagingSwUrl();
	try {
		const registration = await navigator.serviceWorker.register(swUrl, {
			scope: FIREBASE_MESSAGING_SW_SCOPE,
			updateViaCache: 'none',
		});
		return waitForServiceWorkerActivation(registration);
	} catch {
		return navigator.serviceWorker.ready;
	}
};

export const getFcmTokenFromFirebase = async (): Promise<string> => {
	ensureFirebaseConfig();

	if (typeof window === 'undefined') {
		throw new Error('FCM solo esta disponible en navegador.');
	}

	if (!('serviceWorker' in navigator)) {
		throw new Error('Este navegador no soporta Service Worker para FCM.');
	}

	const supported = await isSupported().catch(() => false);
	if (!supported) {
		throw new Error('Firebase Messaging no esta soportado en este navegador.');
	}

	const app = getClientFirebaseApp();
	const messaging = getMessaging(app);
	const serviceWorkerRegistration =
		await getFirebaseMessagingServiceWorkerRegistration();

	const token = await getToken(messaging, {
		vapidKey,
		serviceWorkerRegistration,
	});

	return String(token || '').trim();
};
