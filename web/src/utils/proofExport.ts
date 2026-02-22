import { jsPDF } from 'jspdf';

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportPdf(filename: string, title: string, lines: string[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.text(title, 40, 40);
  doc.setFont('helvetica', 'normal');

  let y = 70;
  for (const line of lines) {
    if (y > 770) {
      doc.addPage();
      y = 40;
    }
    doc.text(line, 40, y);
    y += 16;
  }

  doc.save(filename);
}
