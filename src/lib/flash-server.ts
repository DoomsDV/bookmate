import type { FlashMessageType } from './flash';

export const FLASH_MESSAGE_COOKIE = 'bookmate_flash_message';
export const FLASH_TYPE_COOKIE = 'bookmate_flash_type';

export function appendFlashCookies(
	headers: Headers,
	message: string,
	type: FlashMessageType = 'success'
) {
	const safeMessage = String(message || '').trim();
	if (!safeMessage) return;

	headers.append(
		'Set-Cookie',
		`${FLASH_MESSAGE_COOKIE}=${encodeURIComponent(safeMessage)}; Path=/; Max-Age=60; SameSite=Lax; HttpOnly`
	);
	headers.append(
		'Set-Cookie',
		`${FLASH_TYPE_COOKIE}=${encodeURIComponent(type)}; Path=/; Max-Age=60; SameSite=Lax; HttpOnly`
	);
}

export function redirectWithFlashCookies(
	location: string,
	message: string,
	type: FlashMessageType = 'success',
	status = 302
) {
	const headers = new Headers({ Location: location });
	appendFlashCookies(headers, message, type);
	return new Response(null, { status, headers });
}
