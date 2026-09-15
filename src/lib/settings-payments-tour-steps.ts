/** Primera visita a Ajustes → Pagos (admin Premium). */
export const PAYMENTS_SENAS_TOUR_STORAGE_KEY = 'bookmate_payments_senas_tour_v1';

export const PAYMENTS_SIPAP_SELECTOR = '[data-payments-tour-sipap]';
export const PAYMENTS_POLICY_SELECTOR = '[data-payments-tour-policy]';
export const PAYMENTS_RECEIPT_SELECTOR = '[data-payments-tour-receipt]';

/**
 * Recorrido HAS-20: alias SIPAP → política → cómo se ve un cobro/comprobante.
 * El orden es de producto (no el DOM); el interruptor se menciona en el paso SIPAP.
 */
export const PAYMENTS_SENAS_TOUR_STEPS = [
	{
		id: 'sipap',
		selector: PAYMENTS_SIPAP_SELECTOR,
		title: 'Alias SIPAP',
		description:
			'Activá cobro de señas arriba y completá banco, titular, documento y alias. El cliente transfiere a esa cuenta y pone el código HASEL en el asunto. El dinero va a tu banco; Hasel no intermedia el pago.',
		side: 'top' as const,
		align: 'start' as const,
	},
	{
		id: 'policy',
		selector: PAYMENTS_POLICY_SELECTOR,
		title: 'Política de reembolso',
		description:
			'Elegí Flexible, Moderada o Estricta. El cliente la acepta al reservar. Define cuánto se devuelve si cancela (ventana de 24 horas antes del turno).',
		side: 'bottom' as const,
		align: 'start' as const,
	},
	{
		id: 'receipt',
		selector: PAYMENTS_RECEIPT_SELECTOR,
		title: 'Cómo se ve un cobro',
		description:
			'El cliente sube la foto o PDF del comprobante. Hasel lee el monto y el código HASEL. En Cobros aparece como este ejemplo: Pendiente de revisión → Validar comprobante. El monto o porcentaje de seña se define en cada servicio.',
		side: 'top' as const,
		align: 'start' as const,
	},
] as const;

export const COBROS_TOUR_STORAGE_KEY = 'bookmate_cobros_tour_v1';
