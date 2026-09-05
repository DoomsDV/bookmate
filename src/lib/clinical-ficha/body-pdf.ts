import { jsPDF } from 'jspdf';
import { markKindMeta } from './body-catalog';
import type { BodySessionSnapshot } from './types';

const PAGE_MARGIN = 14;
const INK: [number, number, number] = [28, 32, 36];
const MUTED: [number, number, number] = [100, 108, 116];

export type BodyPdfInput = {
	customerName: string;
	snapshot: BodySessionSnapshot;
	mapImage?: string | null;
};

export const downloadBodyMapPdf = (input: BodyPdfInput): void => {
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	let y = PAGE_MARGIN;

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.setTextColor(...INK);
	doc.text('Mapa corporal — sesión', PAGE_MARGIN, y);
	y += 8;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10);
	doc.setTextColor(...MUTED);
	doc.text(`Cliente: ${input.customerName || '—'}`, PAGE_MARGIN, y);
	y += 5;
	doc.text(`Cita #${input.snapshot.appointmentId}`, PAGE_MARGIN, y);
	y += 5;
	doc.text(`Capturado: ${new Date(input.snapshot.capturedAt).toLocaleString('es-PY')}`, PAGE_MARGIN, y);
	y += 8;

	if (input.mapImage) {
		try {
			doc.addImage(input.mapImage, 'PNG', PAGE_MARGIN, y, 90, 120);
			y += 125;
		} catch {
			/* ignore raster errors */
		}
	}

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(11);
	doc.setTextColor(...INK);
	doc.text('Marcas', PAGE_MARGIN, y);
	y += 6;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9);
	if (!input.snapshot.marks.length) {
		doc.setTextColor(...MUTED);
		doc.text('Sin marcas registradas.', PAGE_MARGIN, y);
	} else {
		for (const mark of input.snapshot.marks) {
			const meta = markKindMeta(mark.kind);
			const line = `${meta.label}${mark.intensity > 0 ? ` ${mark.intensity}/10` : ''} · ${mark.view}${mark.note ? ` — ${mark.note}` : ''}`;
			const lines = doc.splitTextToSize(line, 180);
			doc.setTextColor(...INK);
			doc.text(lines, PAGE_MARGIN, y);
			y += lines.length * 4 + 2;
			if (y > 270) {
				doc.addPage();
				y = PAGE_MARGIN;
			}
		}
	}

	const slug = (input.customerName || 'cliente').replace(/\s+/g, '_').slice(0, 40);
	doc.save(`mapa_corporal_${slug}_${input.snapshot.appointmentId}.pdf`);
};
