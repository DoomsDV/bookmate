import { PublicUserProfileApiError } from './public-user-profile';

const toSafeApiStatus = (value: number) => {
	if (value === 555) return 502;
	return Number.isInteger(value) && value >= 400 && value <= 599 ? value : 500;
};

export const publicUserProfileErrorResponse = (error: unknown, fallbackMessage: string) => {
	const profileError =
		error instanceof PublicUserProfileApiError
			? error
			: new PublicUserProfileApiError(fallbackMessage, 500);

	return Response.json(
		{
			status: 'error',
			message: profileError.message,
			details: profileError.details,
		},
		{ status: toSafeApiStatus(profileError.status) }
	);
};
