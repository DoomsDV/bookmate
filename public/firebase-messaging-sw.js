/* global importScripts, firebase */

(function bootstrapFirebaseMessagingServiceWorker() {
	'use strict';

	const params = new URL(self.location.href).searchParams;
	const firebaseConfig = {
		apiKey: String(params.get('apiKey') || '').trim(),
		authDomain: String(params.get('authDomain') || '').trim(),
		projectId: String(params.get('projectId') || '').trim(),
		storageBucket: String(params.get('storageBucket') || '').trim(),
		messagingSenderId: String(params.get('messagingSenderId') || '').trim(),
		appId: String(params.get('appId') || '').trim(),
		measurementId: String(params.get('measurementId') || '').trim() || undefined,
	};

	const hasRequiredConfig = Boolean(
		firebaseConfig.apiKey &&
		firebaseConfig.projectId &&
		firebaseConfig.messagingSenderId &&
		firebaseConfig.appId
	);

	if (!hasRequiredConfig) return;

	try {
		importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
		importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
	} catch {
		return;
	}

	if (typeof firebase === 'undefined') return;

	if (!firebase.apps.length) {
		firebase.initializeApp(firebaseConfig);
	}

	const messaging = firebase.messaging();
	messaging.onBackgroundMessage((payload) => {
		const notification = payload && payload.notification ? payload.notification : {};
		const title =
			typeof notification.title === 'string' && notification.title.trim()
				? notification.title
				: 'Nueva notificacion';
		const body =
			typeof notification.body === 'string' && notification.body.trim()
				? notification.body
				: '';

		self.registration.showNotification(title, {
			body,
			icon: '/icon-192x192.png',
			badge: '/icon-192x192.png',
			data: (payload && payload.data) || {},
		});
	});
})();
