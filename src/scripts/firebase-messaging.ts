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
	const serviceWorkerRegistration = await navigator.serviceWorker.ready;

	const token = await getToken(messaging, {
		vapidKey,
		serviceWorkerRegistration,
	});

	return String(token || '').trim();
};
