import type { DriveStep } from 'driver.js';
import { runBookmateTour, type BookmateTourRunOptions } from './product-tour';

const VOICE_SHELL_SELECTOR = '[data-voice-overlay-shell]';
const VOICE_RECORD_SELECTOR = '[data-voice-overlay-record]';
const SCAN_DROPZONE_SELECTOR = '[data-voice-overlay-dropzone]';

const QUICK_TOUR_OPTIONS: Pick<
	BookmateTourRunOptions,
	'force' | 'persistCompletion' | 'useTopLayerShell' | 'overlayOpacity' | 'hostSelector' | 'scrollIntoView' | 'stagePadding'
> = {
	force: true,
	persistCompletion: false,
	useTopLayerShell: true,
	overlayOpacity: 0,
	hostSelector: VOICE_SHELL_SELECTOR,
	scrollIntoView: { rootSelector: '.appointment-voice-body' },
	stagePadding: 10,
};

function buildVoiceTourSteps(): DriveStep[] {
	if (!document.querySelector(VOICE_RECORD_SELECTOR)) return [];

	return [
		{
			element: VOICE_RECORD_SELECTOR,
			popover: {
				title: '¿Qué decir?',
				description:
					'Tocá el micrófono para empezar. Mientras grabás podés pausar, reiniciar o terminar. Por ejemplo: «Creá una cita para hoy a las 17:00, para el cliente María García, para el servicio Corte de pelo, con el profesional Ana López, en la sucursal Centro.»',
				side: 'top',
				align: 'center',
			},
		},
	];
}

function buildScanTourSteps(): DriveStep[] {
	if (!document.querySelector(SCAN_DROPZONE_SELECTOR)) return [];

	return [
		{
			element: SCAN_DROPZONE_SELECTOR,
			popover: {
				title: 'Subí tu agenda',
				description:
					'Podés tomar una foto de tu agenda escrita a mano o elegir una imagen guardada. La IA lee las citas y las precarga en el formulario. Usá JPG, PNG o WEBP; que la letra se vea clara y con buena luz.',
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

	const steps = buildVoiceTourSteps();
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		...QUICK_TOUR_OPTIONS,
		storageKey: 'bookmate_appointment_voice_tour',
		stageRadius: 999,
	});
}

/** Guía repetible de la pestaña Escanear agenda. */
export function showAppointmentAgendaScanTour() {
	const shell = document.querySelector<HTMLDialogElement>(VOICE_SHELL_SELECTOR);
	if (!shell?.open) return;

	const steps = buildScanTourSteps();
	if (steps.length === 0) return;

	runBookmateTour(steps, {
		...QUICK_TOUR_OPTIONS,
		storageKey: 'bookmate_appointment_agenda_scan_tour',
		stageRadius: 16,
	});
}

export function showAppointmentQuickTour(mode: 'voice' | 'scan') {
	if (mode === 'scan') {
		showAppointmentAgendaScanTour();
		return;
	}
	showAppointmentVoiceTour();
}