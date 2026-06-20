import type { DriveStep } from 'driver.js';
import { runBookmateTour } from './product-tour';

const VOICE_SHELL_SELECTOR = '[data-voice-overlay-shell]';
const VOICE_RECORD_SELECTOR = '[data-voice-overlay-record]';

function buildTourSteps(): DriveStep[] {
	if (!document.querySelector(VOICE_RECORD_SELECTOR)) return [];

	return [
		{
			element: VOICE_RECORD_SELECTOR,
			popover: {
				title: '¿Qué decir?',
				description:
					'Tocá el micrófono y describí la cita en voz alta. Por ejemplo: «Creá una cita para hoy a las 17:00, para el cliente María García, para el servicio Corte de pelo, con el profesional Ana López, en la sucursal Centro.» Podés incluir fecha, hora, cliente, servicio, profesional y sucursal en una sola frase.',
				side: 'top',
				align: 'center',
			},
		},
	];
}

/** Guía repetible del modal de cita rápida por voz. */
export function showAppointmentVoiceTour() {
	const shell = document.querySelector<HTMLDialogElement>(VOICE_SHELL_SELECTOR);
	if (!shell?.open) return;

	const steps = buildTourSteps();
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		force: true,
		storageKey: 'bookmate_appointment_voice_tour',
		persistCompletion: false,
		useTopLayerShell: true,
		hostSelector: VOICE_SHELL_SELECTOR,
		stagePadding: 10,
		stageRadius: 999,
	});
}
