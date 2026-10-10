import type { ResumeContent } from './types';

/**
 * Builds a real, text-based A4 PDF of the resume in the browser (selectable text, ATS-readable),
 * so downloading never depends on the browser's print dialog — which iPhones block in
 * home-screen apps and many in-app browsers.
 */
export async function resumePdf(r: ResumeContent): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const M = 48, CW = W - M * 2;
  const INK: [number, number, number] = [22, 21, 15], SOFT: [number, number, number] = [78, 74, 62], ACC: [number, number, number] = [138, 106, 0];
  let y = M;
  const on = (k: string) => !(r.hidden ?? []).includes(k);

  const room = (h: number) => { if (y + h > H - M) { pdf.addPage(); y = M; } };
  const text = (s: string, size: number, opts: { bold?: boolean; italic?: boolean; color?: [number, number, number]; gap?: number; indent?: number } = {}) => {
    if (!s?.trim()) return;
    pdf.setFont('helvetica', opts.bold ? (opts.italic ? 'bolditalic' : 'bold') : opts.italic ? 'italic' : 'normal');
    pdf.setFontSize(size); pdf.setTextColor(...(opts.color ?? INK));
    const x = M + (opts.indent ?? 0);
    const lines = pdf.splitTextToSize(clean(s), CW - (opts.indent ?? 0)) as string[];
    const lh = size * 1.35;
    for (const l of lines) { room(lh); pdf.text(l, x, y + size); y += lh; }
    y += opts.gap ?? 0;
  };
  const row = (left: string, right: string, size: number) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size - 1);
    const rw = right ? pdf.getTextWidth(clean(right)) + 12 : 0;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(clean(left), CW - rw) as string[];
    const lh = size * 1.35;
    room(lh * lines.length);
    pdf.setTextColor(...INK);
    lines.forEach((l, i) => pdf.text(l, M, y + size + i * lh));
    if (right) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(size - 1); pdf.setTextColor(...SOFT); pdf.text(clean(right), W - M, y + size, { align: 'right' }); }
    y += lh * lines.length;
  };
  const heading = (s: string) => {
    room(40); y += 10;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(...ACC);
    pdf.text(s.toUpperCase(), M, y + 9.5, { charSpace: 1.2 });
    y += 14; pdf.setDrawColor(221, 216, 200); pdf.setLineWidth(0.6); pdf.line(M, y, W - M, y); y += 7;
  };
  const bullets = (items: string[]) => items.filter(b => b?.trim()).forEach(b => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(clean(b), CW - 14) as string[];
    lines.forEach((l, i) => { room(13.5); pdf.setTextColor(...SOFT); if (i === 0) pdf.text('•', M + 2, y + 10); pdf.setTextColor(...INK); pdf.text(l, M + 14, y + 10); y += 13.5; });
  });

  // Header
  text(r.name, 24, { bold: true, gap: 2 });
  text(r.headline, 12, { color: ACC, bold: true, gap: 4 });
  const c = r.contact ?? {};
  text([c.email, c.phone, c.location, c.linkedin, c.github, c.website].filter(Boolean).join('  |  '), 9.5, { color: SOFT, gap: 2 });
  y += 4; pdf.setDrawColor(...INK); pdf.setLineWidth(1.2); pdf.line(M, y, W - M, y); y += 6;

  if (on('summary') && r.summary?.trim()) { heading('Profile'); text(r.summary, 10.5, { color: INK }); }
  if (on('skills') && r.skills?.some(g => g.items?.some(Boolean))) {
    heading('Skills');
    r.skills.filter(g => g.items?.some(Boolean)).forEach(g => text(`${g.group ? g.group + ': ' : ''}${g.items.filter(Boolean).join(', ')}`, 10, { gap: 2 }));
  }
  const block = (title: string, list: { title: string; org: string; period: string; bullets: string[] }[]) => {
    if (!list?.length || !on(title.toLowerCase())) return;
    heading(title);
    list.forEach(e => { row(e.title, e.period, 11); text(e.org, 10, { italic: true, color: SOFT, gap: 2 }); bullets(e.bullets ?? []); y += 6; });
  };
  block('Experience', r.experience);
  block('Projects', r.projects);
  if (on('education') && r.education?.length) {
    heading('Education');
    r.education.forEach(e => { row(e.qualification, e.period, 11); text(e.institution, 10, { italic: true, color: SOFT }); text(e.details, 10, { color: SOFT, gap: 6 }); });
  }
  const awards = (r.awards ?? []).filter(a => a.trim());
  if (on('awards') && awards.length) { heading('Awards'); bullets(awards); }
  if (on('certifications') && r.certifications?.length) {
    heading('Certifications');
    r.certifications.forEach(x => row(`${x.name}${x.issuer ? ' — ' + x.issuer : ''}`, x.year, 10.5));
  }
  if (on('competencies') && r.competencies?.length) {
    heading('Programme outcomes evidenced');
    r.competencies.forEach(x => text(`${x.code} ${x.domain}${x.evidence ? ': ' + x.evidence : ''}`, 10, { gap: 2 }));
  }
  const langs = (r.languages ?? []).filter(a => a.trim());
  if (on('languages') && langs.length) { heading('Languages'); text(langs.join(', '), 10); }
  pdf.setProperties({ title: `${r.name} - Resume`, creator: 'PathForward' });
  return pdf.output('blob');
}

// Helvetica covers Latin-1 only: swap common typographic characters so nothing renders as garbage.
function clean(s: string) {
  return String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/…/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

/** Hand the file to the user in the way their device supports. */
export async function deliverPdf(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (ios && nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
