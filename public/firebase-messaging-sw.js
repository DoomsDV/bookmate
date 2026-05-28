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

	const resolveNotificationTargetUrl = (notification) => {
		const data = notification && notification.data ? notification.data : {};
		const rawUrl =
			(typeof data.url === 'string' && data.url.trim()) ||
			(typeof data.link === 'string' && data.link.trim()) ||
			'';

		if (rawUrl) {
			try {
				return new URL(rawUrl, self.location.origin).href;
			} catch {
				return rawUrl;
			}
		}

		if (data.org_member_id) {
			return new URL(
				`/panel/calendar?org_member_id=${encodeURIComponent(String(data.org_member_id))}`,
				self.location.origin
			).href;
		}

		return new URL('/panel/calendar', self.location.origin).href;
	};

	const focusOrOpenClient = async (targetUrl) => {
		const absoluteTarget = new URL(targetUrl, self.location.origin).href;
		const windowClients = await self.clients.matchAll({
			type: 'window',
			includeUncontrolled: true,
		});

		for (const client of windowClients) {
			if (!String(client.url || '').startsWith(self.location.origin)) continue;

			if ('navigate' in client) {
				await client.navigate(absoluteTarget);
				return client.focus();
			}

			await client.focus();
			client.postMessage({
				type: 'BOOKMATE_PUSH_NAVIGATE',
				url: absoluteTarget,
			});
			return;
		}

		if (self.clients.openWindow) {
			return self.clients.openWindow(absoluteTarget);
		}

		return undefined;
	};

	self.addEventListener('notificationclick', (event) => {
		event.notification.close();
		const targetUrl = resolveNotificationTargetUrl(event.notification);
		event.waitUntil(focusOrOpenClient(targetUrl));
	});

	const messaging = firebase.messaging();
	messaging.onBackgroundMessage((payload) => {
		const notification = payload && payload.notification ? payload.notification : null;
		const data = payload && payload.data ? payload.data : {};
		const hasNativeNotificationPayload = Boolean(
			notification &&
			(
				(typeof notification.title === 'string' && notification.title.trim()) ||
				(typeof notification.body === 'string' && notification.body.trim())
			)
		);

		const title =
			(typeof notification?.title === 'string' && notification.title.trim()) ||
			(typeof data.title === 'string' && data.title.trim()) ||
			'Nueva notificacion';
		const body =
			(typeof notification?.body === 'string' && notification.body.trim()) ||
			(typeof data.body === 'string' && data.body.trim()) ||
			'';

		if (!title && !body) return;

		const targetUrl = resolveNotificationTargetUrl({
			data: {
				...data,
				url: data.url || data.link || '',
			},
		});

		const notificationData = {
			...data,
			url: targetUrl,
		};

		if (hasNativeNotificationPayload) {
			// El SDK/navegador ya muestra la notificación; `data` viaja al click.
			return;
		}

		self.registration.showNotification(title, {
			body,
			icon: '/icon-192x192.png',
			badge: '/icon-192x192.png',
			data: notificationData,
		});
	});
})();
