import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, ClipboardCheck, Compass, FileText, GraduationCap, Kanban, LayoutDashboard, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from './lib/auth';
import { Landing } from './pages/Landing';
import { AuthPage } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
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
      <Route path="/app" element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="start" element={<Onboarding />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="competency" element={<CompetencyPage />} />
        <Route path="career" element={<CareerPage />} />
        <Route path="resumes" element={<ResumesPage />} />
        <Route path="resumes/:id" element={<ResumeEditor />} />
        <Route path="ats" element={<AtsPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="tracker" element={<TrackerPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/profile', label: 'Profile', icon: UserRound },
  { to: '/app/competency', label: 'Competency map', icon: GraduationCap },
  { to: '/app/career', label: 'Career paths', icon: Compass },
  { to: '/app/resumes', label: 'Resumes', icon: FileText },
  { to: '/app/ats', label: 'ATS check', icon: ClipboardCheck },
  { to: '/app/jobs', label: 'Job search', icon: BriefcaseBusiness },
  { to: '/app/tracker', label: 'Applications', icon: Kanban },
];

function Protected() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="shell">
      <aside className="side">
        <NavLink to="/app" className="brand"><span className="brand__mark" aria-hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18c4 0 6-3 8-6s4-6 8-6" /><path d="M15 6h5v5" /></svg></span><span>Path<b className="brand__accent">Forward</b></span></NavLink>
        <nav className="side__nav">
          {NAV.map(n => <NavLink key={n.to} to={n.to} end={n.end} className="navlink"><n.icon size={18} /><span>{n.label}</span></NavLink>)}
          {user.role === 'admin' && <NavLink to="/app/admin" className="navlink"><ShieldCheck size={18} /><span>Admin</span></NavLink>}
        </nav>
        <div className="side__foot">
          <div className="side__user"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><b>{user.name}</b><span>{user.email}</span></div></div>
          <button className="navlink" onClick={() => { logout(); nav('/'); }}><LogOut size={18} /><span>Sign out</span></button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
      <nav className="tabbar" aria-label="Sections">
        {NAV.slice(0, 5).map(n => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={20} /><span>{n.label.split(' ')[0]}</span></NavLink>)}
        <NavLink to="/app/jobs"><BriefcaseBusiness size={20} /><span>Jobs</span></NavLink>
      </nav>
    </div>
  );
}
