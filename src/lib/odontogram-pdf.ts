export type OdontogramPdfEvent = {
	date: string;
	toothFdi: number;
	finding: string;
	faces: string;
	notes: string;
};

export type OdontogramPdfCapture = {
	dataUrl: string;
	width: number;
	height: number;
};

export type OdontogramPdfInput = {
	customerName: string;
	customerHc: string;
	clinicName: string;
	clinicLogoDataUrl?: string | null;
	capturedAt: Date;
	image: OdontogramPdfCapture | null;
	events: OdontogramPdfEvent[];
};

const PAGE_MARGIN = 16;
const FOOTER_RESERVE = 28;
const FRAME_HEIGHT = 86;
const FRAME_PAD = 4;
const ZEBRA_FILL: [number, number, number] = [244, 246, 248];
const FRAME_FILL: [number, number, number] = [248, 249, 250];
const FRAME_STROKE: [number, number, number] = [208, 213, 221];
const RULE_COLOR: [number, number, number] = [203, 213, 225];
const MUTED: [number, number, number] = [100, 116, 139];
const INK: [number, number, number] = [15, 23, 42];

const slugifyCustomerName = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'cliente';

const formatFileDate = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const formatEmissionDate = (date: Date) => {
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${day}/${month}/${date.getFullYear()}`;
};

const imageFormatFromDataUrl = (dataUrl: string) =>
	/image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG';

export async function loadImageDataUrl(url: string): Promise<string | null> {
	const clean = String(url || '').trim();
	if (!clean) return null;
	try {
		const response = await fetch(clean, { mode: 'cors', credentials: 'omit' });
		if (!response.ok) return null;
		const blob = await response.blob();
		return await new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

export async function downloadOdontogramPdf(input: OdontogramPdfInput) {
	const { jsPDF } = await import('jspdf');
	const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const contentWidth = pageWidth - PAGE_MARGIN * 2;
	const contentBottom = pageHeight - FOOTER_RESERVE;
	let y = PAGE_MARGIN;

	const clinicName = String(input.clinicName || '').trim();
	const customerName = String(input.customerName || 'Cliente').trim() || 'Cliente';
	const customerHc = String(input.customerHc || '').trim();

	const ensureSpace = (needed: number) => {
		if (y + needed <= contentBottom) return;
		doc.addPage();
		y = PAGE_MARGIN;
	};

	const drawHeader = () => {
		const blockTop = y;
		const logoMaxW = 42;
		const logoMaxH = 16;
		let usedHeight = logoMaxH;

		if (input.clinicLogoDataUrl) {
			try {
				const format = imageFormatFromDataUrl(input.clinicLogoDataUrl);
				const props = doc.getImageProperties(input.clinicLogoDataUrl);
				const ratio = props.width / Math.max(props.height, 1);
				let logoW = logoMaxW;
				let logoH = logoW / ratio;
				if (logoH > logoMaxH) {
					logoH = logoMaxH;
					logoW = logoH * ratio;
				}
				doc.addImage(input.clinicLogoDataUrl, format, PAGE_MARGIN, blockTop, logoW, logoH);
				usedHeight = Math.max(usedHeight, logoH);
			} catch {
				doc.setFont('helvetica', 'bold');
				doc.setFontSize(13);
				doc.setTextColor(...INK);
				doc.text(clinicName || 'Clínica', PAGE_MARGIN, blockTop + 8);
			}
		} else {
			doc.setFont('helvetica', 'bold');
			doc.setFontSize(13);
			doc.setTextColor(...INK);
			doc.text(clinicName || 'Clínica', PAGE_MARGIN, blockTop + 8);
		}

		const metaX = PAGE_MARGIN + contentWidth;
		const lines = [
			['Paciente', customerName],
			['HC', customerHc ? `#${customerHc}` : '—'],
			['Fecha de emisión', formatEmissionDate(input.capturedAt)],
		];
		let metaY = blockTop + 4;
		for (const [label, value] of lines) {
			doc.setFont('helvetica', 'bold');
			doc.setFontSize(8.5);
			const valueLines = doc.splitTextToSize(value, 78);
			doc.setTextColor(...INK);
			doc.text(valueLines, metaX, metaY, { align: 'right' });
			const firstLine = Array.isArray(valueLines) ? valueLines[0] : valueLines;
			const valueWidth = doc.getTextWidth(firstLine);
			doc.setFont('helvetica', 'normal');
			doc.setTextColor(...MUTED);
			doc.text(`${label}:  `, metaX - valueWidth, metaY, { align: 'right' });
			metaY += Math.max(5.2, valueLines.length * 4.2);
		}
		usedHeight = Math.max(usedHeight, metaY - blockTop);
		y = blockTop + usedHeight + 5;
		doc.setDrawColor(...RULE_COLOR);
		doc.setLineWidth(0.35);
		doc.line(PAGE_MARGIN, y, PAGE_MARGIN + contentWidth, y);
		y += 8;
	};

	const drawFramedImage = (image: OdontogramPdfCapture) => {
		ensureSpace(FRAME_HEIGHT + 10);
		doc.setFillColor(...FRAME_FILL);
		doc.setDrawColor(...FRAME_STROKE);
		doc.setLineWidth(0.3);
		doc.roundedRect(PAGE_MARGIN, y, contentWidth, FRAME_HEIGHT, 2.2, 2.2, 'FD');

		const innerW = contentWidth - FRAME_PAD * 2;
		const innerH = FRAME_HEIGHT - FRAME_PAD * 2;
		const ratio = image.width / Math.max(image.height, 1);
		let drawW = innerW;
		let drawH = drawW / ratio;
		if (drawH > innerH) {
			drawH = innerH;
			drawW = drawH * ratio;
		}
		const drawX = PAGE_MARGIN + FRAME_PAD + (innerW - drawW) / 2;
		const drawY = y + FRAME_PAD + (innerH - drawH) / 2;
		doc.addImage(image.dataUrl, 'PNG', drawX, drawY, drawW, drawH);
		y += FRAME_HEIGHT + 8;
	};

	const columns = [
		{ key: 'date' as const, label: 'Fecha', width: 36 },
		{ key: 'tooth' as const, label: 'Pieza', width: 16 },
		{ key: 'finding' as const, label: 'Hallazgo', width: 28 },
		{ key: 'faces' as const, label: 'Caras', width: 38 },
		{ key: 'notes' as const, label: 'Nota', width: contentWidth - 118 },
	];

	const drawTableHeader = () => {
		const headerH = 8;
		ensureSpace(headerH + 6);
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(8);
		doc.setTextColor(...INK);
		let x = PAGE_MARGIN + 2;
		for (const column of columns) {
			doc.text(column.label, x, y + 5.3);
			x += column.width;
		}
		doc.setDrawColor(...RULE_COLOR);
		doc.setLineWidth(0.3);
		doc.line(PAGE_MARGIN, y + headerH, PAGE_MARGIN + contentWidth, y + headerH);
		y += headerH;
	};

	drawHeader();

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(12);
	doc.setTextColor(...INK);
	doc.text('Odontograma', PAGE_MARGIN, y);
	y += 6;

	if (input.image) {
		drawFramedImage(input.image);
	}

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(11);
	doc.setTextColor(...INK);
	ensureSpace(16);
	doc.text('Evolución de tratamientos', PAGE_MARGIN, y);
	y += 5;

	if (input.events.length === 0) {
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(9);
		doc.setTextColor(...MUTED);
		doc.text('Sin registros todavía.', PAGE_MARGIN, y + 4);
	} else {
		drawTableHeader();
		input.events.forEach((event, index) => {
			const values = {
				date: event.date || '—',
				tooth: event.toothFdi > 0 ? String(event.toothFdi) : '—',
				finding: event.finding || '—',
				faces: event.faces || '—',
				notes: event.notes || '—',
			};
			const lines = columns.map((column) =>
				doc.splitTextToSize(values[column.key], column.width - 4)
			);
			const rowHeight = Math.max(8, ...lines.map((line) => line.length * 4 + 4));
			if (y + rowHeight > contentBottom) {
				doc.addPage();
				y = PAGE_MARGIN;
				drawTableHeader();
			}
			if (index % 2 === 1) {
				doc.setFillColor(...ZEBRA_FILL);
				doc.rect(PAGE_MARGIN, y, contentWidth, rowHeight, 'F');
			}
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(8);
			doc.setTextColor(...INK);
			let x = PAGE_MARGIN + 2;
			columns.forEach((column, columnIndex) => {
				doc.text(lines[columnIndex], x, y + 5);
				x += column.width;
			});
			y += rowHeight;
		});
	}

	const pageCount = doc.getNumberOfPages();
	for (let page = 1; page <= pageCount; page += 1) {
		doc.setPage(page);
		const isLast = page === pageCount;
		const footerTop = pageHeight - 24;
		if (isLast) {
			doc.setDrawColor(...MUTED);
			doc.setLineWidth(0.35);
			doc.setLineDashPattern([1.1, 1.1], 0);
			const lineWidth = 72;
			const lineX = (pageWidth - lineWidth) / 2;
			doc.line(lineX, footerTop, lineX + lineWidth, footerTop);
			doc.setLineDashPattern([], 0);
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(8);
			doc.setTextColor(...MUTED);
			doc.text('Firma y sello del profesional', pageWidth / 2, footerTop + 5, {
				align: 'center',
			});
		}
		if (clinicName) {
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(8);
			doc.setTextColor(...MUTED);
			doc.text(clinicName, pageWidth / 2, pageHeight - 9, { align: 'center' });
		}
	}

	doc.save(
		`odontograma-${slugifyCustomerName(customerName)}-${formatFileDate(input.capturedAt)}.pdf`
	);
}
