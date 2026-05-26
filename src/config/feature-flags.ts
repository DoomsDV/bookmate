/**
 * Flags para habilitar funcionalidades en desarrollo.
 * Activar en `true` cuando estén listas para producción.
 */
export const FEATURE_FLAGS = {
	/** Ajustes → pestaña Integraciones (Pagopar). */
	INTEGRATIONS_SETTINGS: false,
	/** Panel servicios → seña / depósito en reserva pública. */
	SERVICE_DEPOSIT_OPTIONS: false,
} as const;
