import { Link } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, ClipboardCheck, FileText, GraduationCap, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '../lib/auth';

const FLOW = [
  { k: 'Subject', v: 'Cloud Computing Fundamentals', n: 'Year 2 · A-' },
  { k: 'Learning outcome', v: 'Provision virtual machines and storage in a public cloud', n: 'CLO2' },
  { k: 'Programme outcome', v: 'PLO3 · Practical skills', n: 'MQA domain' },
  { k: 'Skill', v: 'Huawei Cloud ECS · Virtualisation', n: 'level 3 / 5' },
  { k: 'Your next step', v: 'Junior Cloud Engineer', n: '82% fit' },
];

const FEATURES = [
  { icon: GraduationCap, t: 'Competency map', d: 'Tick the subjects you passed. Their learning outcomes become evidence for each of your programme outcomes, with no guessing.' },
  { icon: Sparkles, t: 'Skills from your transcript', d: 'Curriculum skills are added instantly; the AI adds soft skills and tools from your projects, each with the evidence behind it.' },
  { icon: FileText, t: 'Honest AI resumes', d: 'One-page, ATS-friendly resumes written only from your real record. Three templates, edit inline, export to PDF.' },
  { icon: ClipboardCheck, t: 'ATS check', d: 'Paste a job ad to see the keywords you hit and miss, a fit score, and rewrites that stay truthful.' },
  { icon: BriefcaseBusiness, t: 'Live job search', d: 'Search real openings, ranked by how well your skills match, then tailor a resume or cover letter in one click.' },
  { icon: Upload, t: 'Import an old CV', d: 'Upload a PDF and the AI fills your profile so you can start from what you already have.' },
];

export function Landing() {
  const { user } = useAuth();
  return (
    <div className="landing">
      <header className="landing__nav">
        <Link to="/" className="brand"><span className="brand__mark" aria-hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18c4 0 6-3 8-6s4-6 8-6" /><path d="M15 6h5v5" /></svg></span><span>Path<b className="brand__accent">Forward</b></span></Link>
        <div className="row">
          {user ? <Link className="btn btn--primary" to="/app">Open dashboard <ArrowRight size={16} /></Link> : <>
            <Link className="btn btn--ghost" to="/login">Sign in</Link>
            <Link className="btn btn--primary" to="/register">Create free account</Link>
          </>}
        </div>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <h1>Your transcript already says what you can do. <span className="hero__accent">We'll show you the path forward.</span></h1>
          <p className="hero__lead">Four years of subjects shouldn't end in a blank resume. PathForward reads the subjects you passed and their learning outcomes, turns them into competencies employers recognise, and shows you exactly where you stand: the roles you already fit, the gaps worth closing, and a resume you can defend in any interview.</p>
          <div className="row">
            <Link className="btn btn--primary btn--lg" to={user ? '/app' : '/register'}>Build my competency map <ArrowRight size={18} /></Link>
            <a className="btn btn--ghost btn--lg" href="#how">How it works</a>
          </div>
        </div>
        <ol className="flowcard" aria-label="From subject to job match">
          {FLOW.map((f, i) => (
            <li key={f.k} style={{ animationDelay: `${i * 90}ms` }}>
              <span className="flowcard__k">{f.k}</span>
              <b>{f.v}</b>
              <span className="flowcard__n">{f.n}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="how" className="features">
        {FEATURES.map(f => (
          <article key={f.t} className="feature">
            <f.icon size={22} />
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </article>
        ))}
      </section>


      <footer className="landing__foot">PathForward · UTeM FTMK prototype. Your data stays in your account; the AI only rewrites facts you give it.</footer>
    </div>
  );
}
