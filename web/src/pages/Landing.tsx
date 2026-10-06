import { Link } from 'react-router-dom';
import { ArrowRight, FileText, GraduationCap, MessageCircle, Mic, Route } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Brand } from '../App';

const TRANSCRIPT = [
  ['BITS 2513', 'Cloud Computing Fundamentals', 'A-'],
  ['BITS 2343', 'Database Systems', 'A'],
  ['BITI 2233', 'Operating Systems', 'B+'],
  ['BITM 3113', 'Final Year Project I', 'A-'],
];

const LOOP = [
  { icon: GraduationCap, n: '01', t: 'Map', d: 'Tick the subjects you passed. Their learning outcomes become skills, each backed by the subject that taught it.' },
  { icon: Route, n: '02', t: 'Plan', d: 'Pick a role. Get a week-by-week plan that closes your real gaps, with free resources and the right Huawei certification.' },
  { icon: Mic, n: '03', t: 'Practise', d: 'Five-question mock interviews built from your own projects. Speak or type, and get a score and a better answer every time.' },
  { icon: FileText, n: '04', t: 'Apply', d: 'Honest, ATS-ready resumes in a minute, checked against the job ad, and live openings ranked by how much you can prove.' },
];

export function Landing() {
  const { user } = useAuth();
  return (
    <div className="landing">
      <header className="landing__nav">
        <Brand />
        <div className="row">
          {user ? <Link className="btn btn--primary" to="/app">Open PathForward <ArrowRight size={16} /></Link> : <>
            <Link className="btn btn--ghost" to="/login">Sign in</Link>
            <Link className="btn btn--primary" to="/register">Get started</Link>
          </>}
        </div>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <h1>Your transcript already says what you can do. <span className="hero__accent">We'll show you the path forward.</span></h1>
          <p className="hero__lead">PathForward reads the subjects you passed, turns them into skills employers search for, and then coaches you every day until you land the role: a plan, mock interviews, resumes and real jobs.</p>
          <div className="row">
            <Link className="btn btn--primary btn--lg" to={user ? '/app' : '/register'}>Map my subjects <ArrowRight size={18} /></Link>
            <a className="btn btn--ghost btn--lg" href="#how">How it works</a>
          </div>
          <div className="hero__proof">
            <span><b>2 min</b>to map a degree</span>
            <span><b>11</b>MQA outcome domains</span>
            <span><b>0</b>invented facts on your resume</span>
          </div>
        </div>
        <div className="tx" aria-hidden>
          <div className="tx__card">
            <p className="eyebrow">Transcript · Year 3</p>
            {TRANSCRIPT.map(([c, n, g], i) => <div key={c} className="tx__row" style={{ animationDelay: `${i * 90}ms` }}><span className="mono">{c}</span><span>{n}</span><b>{g}</b></div>)}
          </div>
          <div className="tx__arrow">PathForward</div>
          <div className="tx__out">
            <div className="tx__role"><b>Junior Cloud Engineer</b><span>82% fit</span></div>
            <div className="chips"><span className="chip">Huawei Cloud ECS</span><span className="chip">SQL</span><span className="chip">Linux</span><span className="chip">Virtualisation</span><span className="chip">Teamwork</span></div>
            <p className="small" style={{ opacity: .75 }}>Next: learn Terraform basics (week 2 of your plan) · HCIA-Cloud in 6 weeks</p>
          </div>
        </div>
      </section>

      <section id="how" className="stack" style={{ gap: 28 }}>
        <div className="sec-head">
          <p className="eyebrow">The loop</p>
          <h2>Not a resume generator. A daily habit that gets you hired.</h2>
          <p>Every day PathForward picks your next three moves, keeps your streak, and remembers where you left off.</p>
        </div>
        <div className="loop">
          {LOOP.map(s => <div key={s.t} className="loop__step"><div className="row between"><s.icon /><span className="mono">{s.n}</span></div><h3>{s.t}</h3><p>{s.d}</p></div>)}
        </div>
      </section>

      <section className="band">
        <div className="stack">
          <p className="eyebrow">Coach</p>
          <h2>A career coach that has actually read your transcript.</h2>
          <p>Ask anything, any time. Path knows your subjects, skills, projects, plan and last interview score, and answers in seconds.</p>
          <Link className="btn btn--accent" style={{ justifySelf: 'start' }} to={user ? '/app/coach' : '/register'}><MessageCircle size={16} /> Talk to Path</Link>
        </div>
        <div className="band__chat" aria-hidden>
          <p>Am I ready to apply for cloud roles?</p>
          <p>Close. Cloud Computing Fundamentals and Database Systems give you the core. The gap is infrastructure as code: week 2 of your plan covers Terraform. Apply to two support roles now to practise.</p>
          <p>How do I talk about my FYP?</p>
        </div>
      </section>

      <footer className="landing__foot"><span>PathForward · Universiti Teknikal Malaysia Melaka, FTMK</span><span>Runs on Huawei Cloud · AI by Groq</span></footer>
    </div>
  );
}
