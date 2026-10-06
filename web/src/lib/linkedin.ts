import { unzipSync, strFromU8 } from 'fflate';

/** Parses LinkedIn's "Get a copy of your data" export (the .zip, or individual
 *  CSV files from it) into the same draft shape the CV importer produces. */
export interface LinkedInDraft {
  name?: string; headline?: string; location?: string; linkedin?: string;
  education: { qualification: string; institution: string; start_year?: number; end_year?: number }[];
  skills: { name: string; category: string }[];
  experiences: { kind: string; title: string; organisation?: string; start_date?: string; end_date?: string; description?: string }[];
  certifications: { name: string; issuer?: string; year?: string }[];
  found: string[];
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  // LinkedIn sometimes puts a "Notes:" preamble above the header row
  const hi = rows.findIndex(r => r.length > 1 && r.every(c => c.trim().length > 0 && c.length < 40));
  if (hi < 0) return [];
  const head = rows[hi].map(h => h.trim());
  return rows.slice(hi + 1).filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const year = (s?: string) => { const m = s?.match(/(19|20)\d{2}/); return m ? Number(m[0]) : undefined; };
const ym = (s?: string) => {
  if (!s) return undefined;
  const d = new Date(s.length <= 4 ? `${s}-01-01` : `1 ${s}`);
  return Number.isNaN(d.getTime()) ? s : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export async function readLinkedIn(files: File[]): Promise<LinkedInDraft> {
  const csv: Record<string, string> = {};
  for (const f of files) {
    const buf = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name)) {
      const z = unzipSync(buf, { filter: e => /\.csv$/i.test(e.name) });
      for (const [n, data] of Object.entries(z)) csv[n.split('/').pop()!.toLowerCase()] = strFromU8(data);
    } else if (/\.csv$/i.test(f.name)) csv[f.name.toLowerCase()] = strFromU8(buf);
  }
  const get = (n: string) => (csv[n] ? parseCsv(csv[n]) : []);
  const d: LinkedInDraft = { education: [], skills: [], experiences: [], certifications: [], found: [] };

  const prof = get('profile.csv')[0];
  if (prof) {
    d.found.push('Profile');
    d.name = [prof['First Name'], prof['Last Name']].filter(Boolean).join(' ') || undefined;
    d.headline = prof['Headline'] || undefined;
    d.location = prof['Geo Location'] || prof['Location'] || undefined;
  }
  const pos = get('positions.csv');
  if (pos.length) d.found.push(`${pos.length} positions`);
  for (const p of pos) if (p['Title']) d.experiences.push({ kind: /intern/i.test(p['Title']) ? 'internship' : 'work', title: p['Title'], organisation: p['Company Name'], start_date: ym(p['Started On']), end_date: ym(p['Finished On']), description: p['Description'] });
  const proj = get('projects.csv');
  if (proj.length) d.found.push(`${proj.length} projects`);
  for (const p of proj) if (p['Title']) d.experiences.push({ kind: 'project', title: p['Title'], start_date: ym(p['Started On']), end_date: ym(p['Finished On']), description: [p['Description'], p['Url']].filter(Boolean).join(' ') });
  const vol = get('volunteering.csv');
  for (const p of vol) if (p['Role']) d.experiences.push({ kind: 'activity', title: p['Role'], organisation: p['Company Name'], start_date: ym(p['Started On']), end_date: ym(p['Finished On']), description: p['Description'] });
  const edu = get('education.csv');
  if (edu.length) d.found.push(`${edu.length} education`);
  for (const e of edu) if (e['School Name']) d.education.push({ institution: e['School Name'], qualification: e['Degree Name'] || 'Studies', start_year: year(e['Start Date']), end_year: year(e['End Date']) });
  const sk = get('skills.csv');
  if (sk.length) d.found.push(`${sk.length} skills`);
  for (const s of sk) if (s['Name']) d.skills.push({ name: s['Name'], category: 'Technical' });
  for (const l of get('languages.csv')) if (l['Name']) d.skills.push({ name: l['Name'], category: 'Language' });
  const certs = get('certifications.csv');
  if (certs.length) d.found.push(`${certs.length} certifications`);
  for (const c of certs) if (c['Name']) d.certifications.push({ name: c['Name'], issuer: c['Authority'] || undefined, year: String(year(c['Started On']) ?? '') || undefined });
  if (!d.found.length) throw new Error('No LinkedIn data found. Upload the .zip from LinkedIn (Settings → Data privacy → Get a copy of your data), or its CSV files.');
  return d;
}
