import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, ClipboardCheck, Compass, FileText, GraduationCap, Bookmark, Building2, Kanban, LayoutGrid, LogOut, X, Search, MessageCircle, Mic, Route as RouteIcon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useAuth } from './lib/auth';
import { Landing } from './pages/Landing';
import { AuthPage, LinkedInDone, SetPassword } from './pages/Auth';
import { CandidatePage, ShortlistPage, TalentPage } from './pages/Talent';
import { ThemeToggle } from './components/ThemeToggle';
import { ManageFaculty, ManageHome, ManageProgramme, ManageUniversity } from './pages/Manage';
import { Today } from './pages/Today';
import { CoachPage } from './pages/Coach';
import { InterviewPage } from './pages/Interview';
import { PlanPage } from './pages/Plan';
import { Onboarding } from './pages/Onboarding';
import { ProfilePage } from './pages/Profile';
import { CompetencyPage } from './pages/Competency';
import { CareerPage } from './pages/Career';
import { ResumesPage } from './pages/Resumes';
import { ResumeEditor } from './pages/ResumeEditor';
import { AtsPage } from './pages/Ats';
import { JobsPage } from './pages/Jobs';
import { TrackerPage } from './pages/Tracker';
import { AdminPage } from './pages/Admin';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/auth/linkedin" element={<LinkedInDone />} />
      <Route path="/app" element={<Protected />}>
        <Route index element={<Home />} />
        <Route path="start" element={<Onboarding />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="competency" element={<CompetencyPage />} />
        <Route path="career" element={<CareerPage />} />
        <Route path="resumes" element={<ResumesPage />} />
        <Route path="resumes/:id" element={<ResumeEditor />} />
        <Route path="ats" element={<AtsPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="tracker" element={<TrackerPage />} />
        <Route path="coach" element={<CoachPage />} />
        <Route path="interview" element={<InterviewPage />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="talent" element={<TalentPage />} />
        <Route path="talent/:id" element={<CandidatePage />} />
        <Route path="shortlist" element={<ShortlistPage />} />
        <Route path="manage" element={<ManageHome />} />
        <Route path="manage/u/:id" element={<ManageUniversity />} />
        <Route path="manage/f/:id" element={<ManageFaculty />} />
        <Route path="manage/p/:id" element={<ManageProgramme />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const GROUPS: { label: string; items: { to: string; label: string; icon: typeof Sun; end?: boolean }[] }[] = [
  { label: 'Daily', items: [
    { to: '/app', label: 'Today', icon: Sun, end: true },
    { to: '/app/coach', label: 'Coach', icon: MessageCircle },
    { to: '/app/plan', label: 'Learning plan', icon: RouteIcon },
    { to: '/app/interview', label: 'Mock interview', icon: Mic },
  ] },
  { label: 'Your record', items: [
    { to: '/app/profile', label: 'Profile', icon: UserRound },
    { to: '/app/competency', label: 'Competency map', icon: GraduationCap },
    { to: '/app/career', label: 'Career paths', icon: Compass },
  ] },
  { label: 'Apply', items: [
    { to: '/app/resumes', label: 'Resumes', icon: FileText },
    { to: '/app/ats', label: 'ATS check', icon: ClipboardCheck },
    { to: '/app/jobs', label: 'Job search', icon: BriefcaseBusiness },
    { to: '/app/tracker', label: 'Applications', icon: Kanban },
  ] },
];

const TABS = [
  { to: '/app', label: 'Today', icon: Sun, end: true },
  { to: '/app/coach', label: 'Coach', icon: MessageCircle },
  { to: '/app/resumes', label: 'Resumes', icon: FileText },
  { to: '/app/jobs', label: 'Jobs', icon: BriefcaseBusiness },
];

const MANAGE = [{ to: '/app/manage', label: 'University', icon: Building2 }];

const RECRUITER = [
  { to: '/app/talent', label: 'Find talent', icon: Search },
  { to: '/app/shortlist', label: 'Shortlist', icon: Bookmark },
];

const Mark = () => <span className="brand__mark" aria-hidden><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18c4 0 6-3 8-6s4-6 8-6" /><path d="M15 6h5v5" /></svg></span>;
export const Brand = ({ to = '/' }: { to?: string }) => <NavLink to={to} className="brand"><Mark /><span>PathForward</span></NavLink>;

function Protected() {
  const { user, logout, mustChange } = useAuth();
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => { setMore(false); }, [loc.pathname, loc.search]);
  useEffect(() => { document.body.style.overflow = more ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [more]);
  if (!user) return <Navigate to="/login" replace />;
  if (mustChange) return <SetPassword />;
  const isAdmin = user.role === 'admin';
  const isRecruiter = user.role === 'recruiter';
  const isStaff = user.role === 'staff';
  const student = !isAdmin && !isRecruiter && !isStaff;
  const out = () => { logout(); nav('/'); };
  return (
    <div className="shell">
      <aside className="side">
        <Brand to="/app" />
        <nav className="side__nav">
          {isAdmin && <>
            <p className="side__group">Manage</p>
            <NavLink to="/app/admin" className="navlink"><ShieldCheck size={18} /><span>Admin console</span></NavLink>
            <NavLink to="/app/manage" className="navlink"><Building2 size={18} /><span>Universities</span></NavLink>
            <p className="side__group">Recruiting</p>
            {RECRUITER.map(n => <NavLink key={n.to} to={n.to} className="navlink"><n.icon size={18} /><span>{n.label}</span></NavLink>)}
          </>}
          {isStaff && <>
            <p className="side__group">Manage</p>
            {MANAGE.map(n => <NavLink key={n.to} to={n.to} className="navlink"><n.icon size={18} /><span>{n.label}</span></NavLink>)}
          </>}
          {isRecruiter && <>
            <p className="side__group">Recruiting</p>
            {RECRUITER.map(n => <NavLink key={n.to} to={n.to} className="navlink"><n.icon size={18} /><span>{n.label}</span></NavLink>)}
          </>}
          {student && GROUPS.map(g => (
              <div key={g.label}>
                <p className="side__group">{g.label}</p>
                {g.items.map(n => <NavLink key={n.to} to={n.to} end={n.end} className="navlink"><n.icon size={18} /><span>{n.label}</span></NavLink>)}
              </div>
            ))}
        </nav>
        <div className="side__foot">
          <ThemeToggle />
          {student && <NavLink to="/app/coach" className="side__coach"><b><MessageCircle size={16} /> Ask Path</b><span>Your coach knows your subjects, skills and plan.</span></NavLink>}
          <div className="side__user"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><b>{user.name}</b><span>{user.email}</span></div><button className="icon-btn" onClick={out} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
        </div>
      </aside>
      <header className="topbar">
        <Brand to="/app" />
        <div className="row">
          <ThemeToggle compact />
          <button className="topbar__me" onClick={() => setMore(true)} aria-label="Account and all sections"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span></button>
        </div>
      </header>
      <main className="main"><Outlet /></main>
      <nav className="tabbar" aria-label="Sections">
        {isAdmin && <NavLink to="/app/admin"><ShieldCheck size={20} /><span>Admin</span></NavLink>}
        {(isAdmin || isStaff) && <NavLink to="/app/manage"><Building2 size={20} /><span>{isAdmin ? 'Unis' : 'Manage'}</span></NavLink>}
        {(isAdmin || isRecruiter) && RECRUITER.map(n => <NavLink key={n.to} to={n.to}><n.icon size={20} /><span>{n.label === 'Find talent' ? 'Talent' : n.label}</span></NavLink>)}
        {student && TABS.map(n => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={20} /><span>{n.label}</span></NavLink>)}
        <button className={more ? 'active' : ''} onClick={() => setMore(true)}><LayoutGrid size={20} /><span>More</span></button>
      </nav>
      {more && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="All sections" onClick={e => e.target === e.currentTarget && setMore(false)}>
          <div className="sheet__card">
            <div className="sheet__head">
              <div className="side__user"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><b>{user.name}</b><span>{user.email}</span></div></div>
              <button className="icon-btn" onClick={() => setMore(false)} aria-label="Close"><X size={20} /></button>
            </div>
            {student && GROUPS.map(g => (
              <div key={g.label} className="sheet__group">
                <p className="side__group">{g.label}</p>
                <div className="sheet__grid">{g.items.map(n => <NavLink key={n.to} to={n.to} end={n.end} className="sheet__item"><n.icon size={20} /><span>{n.label}</span></NavLink>)}</div>
              </div>
            ))}
            {!student && <div className="sheet__grid">
              {isAdmin && <NavLink to="/app/admin" className="sheet__item"><ShieldCheck size={20} /><span>Admin</span></NavLink>}
              {(isAdmin || isStaff) && <NavLink to="/app/manage" className="sheet__item"><Building2 size={20} /><span>Universities</span></NavLink>}
              {!isStaff && RECRUITER.map(n => <NavLink key={n.to} to={n.to} className="sheet__item"><n.icon size={20} /><span>{n.label}</span></NavLink>)}
            </div>}
            <div className="sheet__foot"><span className="muted small">Appearance</span><ThemeToggle /></div>
            <button className="btn btn--ghost btn--wide" onClick={out}><LogOut size={16} /> Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Admins land on the console; students on their dashboard. */
function Home() {
  const { user } = useAuth();
  if (user?.role === 'admin') return <Navigate to="/app/admin" replace />;
  if (user?.role === 'recruiter') return <Navigate to="/app/talent" replace />;
  if (user?.role === 'staff') return <Navigate to="/app/manage" replace />;
  return <Today />;
}
