/**
 * Flags para habilitar funcionalidades en desarrollo.
 * Activar en `true` cuando estén listas para producción.
 */
export const FEATURE_FLAGS = {
	/** Ajustes → pestaña Integraciones (Pagopar). */
	INTEGRATIONS_SETTINGS: false,
	/** Panel servicios → seña / depósito en reserva pública. */
	SERVICE_DEPOSIT_OPTIONS: false,
	/** Cita rápida por voz (Whisper + precarga del formulario). */
	APPOINTMENT_AI_VOICE: true,
} as const;
