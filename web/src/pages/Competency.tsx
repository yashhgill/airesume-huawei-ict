import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useApi } from '../lib/hooks';
import type { Competency } from '../lib/types';
import { Card, Empty, Meter, PageHead, Spinner, Tag } from '../components/ui';

const PART_LABEL: Record<string, string> = { profile: 'Contact & links', education: 'Education', subjects: 'Subjects', skills: 'Skills', experience: 'Experience', certifications: 'Certifications' };

export function CompetencyPage() {
  const { data: c, loading } = useApi<Competency>('/profile/competency');
  if (loading) return <div className="page"><Spinner label="Mapping outcomes" /></div>;
  if (!c?.total) return <div className="page"><PageHead eyebrow="Competency map" title="Programme learning outcomes" /><Empty icon={<GraduationCap />} title="No programme yet"><p>Pick your programme and subjects to see which outcomes you can already evidence.</p><Link className="btn btn--primary" to="/app/start">Map my subjects</Link></Empty></div>;

  return (
    <div className="page">
      <PageHead eyebrow="Competency map" title={`${c.covered} of ${c.total} outcomes evidenced`}
        sub="Each programme learning outcome (PLO) is backed by the subjects you completed and the experience you added. Employers see this evidence on your resume." />
      <div className="grid-2 grid-2--wide-right">
        <Card eyebrow="By MQA domain" title="Shape of your profile">
          <Radar plos={c.plos} />
          <ul className="parts">
            {Object.entries(c.parts).map(([k, v]) => <li key={k}><span>{PART_LABEL[k]}</span><Meter value={Math.round(v * 100)} label={PART_LABEL[k]} /><b className="mono">{Math.round(v * 100)}%</b></li>)}
          </ul>
        </Card>
        <Card eyebrow="Evidence" title="Outcome by outcome">
          <ul className="plos">
            {c.plos.map(p => (
              <li key={p.code} className={p.strength ? '' : 'is-gap'}>
                <div className="plos__head">
                  <span className="mono">{p.code}</span>
                  <b>{p.domain}</b>
                  {p.strength ? <Tag tone={p.strength >= 67 ? 'ok' : 'warn'}>{p.strength >= 67 ? 'Strong' : 'Some evidence'}</Tag> : <Tag tone="bad">Gap</Tag>}
                </div>
                <p>{p.description}</p>
                <Meter value={p.strength} label={p.code} />
                {p.evidence.length ? <div className="chips">{p.evidence.map(e => <Tag key={e}>{e}</Tag>)}</div> : <p className="muted small">{hint(p.domain)}</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function hint(domain: string) {
  const m: Record<string, string> = {
    Interpersonal: 'Add a group project or team role in Experience.',
    Leadership: 'Add a club, committee or project you led.',
    Communication: 'Add a presentation, report or publication.',
    Entrepreneurial: 'Add a startup, freelance or business project.',
    Ethics: 'Complete a security/ethics subject or add a compliance-related project.',
    Personal: 'Add certifications or self-learning courses.',
    Numeracy: 'Tick mathematics or statistics subjects.',
  };
  return m[domain] ?? 'Tick more subjects or add related experience.';
}

/** 11-axis radar of PLO strength. */
function Radar({ plos }: { plos: Competency['plos'] }) {
  const n = plos.length, cx = 160, cy = 150, R = 110;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
  };
  const poly = plos.map((p, i) => pt(i, Math.max(0.04, p.strength / 100)).join(',')).join(' ');
  return (
    <svg className="radar" viewBox="0 0 320 300" role="img" aria-label="Radar chart of outcome strength">
      {[0.25, 0.5, 0.75, 1].map(r => <polygon key={r} points={plos.map((_, i) => pt(i, r).join(',')).join(' ')} className="radar__ring" />)}
      {plos.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="radar__spoke" />; })}
      <polygon points={poly} className="radar__area" />
      {plos.map((p, i) => { const [x, y] = pt(i, Math.max(0.04, p.strength / 100)); return <circle key={p.code} cx={x} cy={y} r="3.5" className="radar__dot" />; })}
      {plos.map((p, i) => {
        const [x, y] = pt(i, 1.2);
        return <text key={p.code} x={x} y={y + 4} textAnchor={Math.abs(x - cx) < 10 ? 'middle' : x > cx ? 'start' : 'end'} className="radar__label">{p.code}</text>;
      })}
    </svg>
  );
}
