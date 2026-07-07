import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Toaster } from './components/Toaster';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ResourcePage from './components/ResourcePage';
import * as R from './lib/resourceConfigs';

// Lazy-load non-critical pages — only loaded when navigated to
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Money = lazy(() => import('./pages/Money'));
const CrewPage = lazy(() => import('./pages/CrewPage'));
const PhotosPage = lazy(() => import('./pages/PhotosPage'));
const InspectionsPage = lazy(() => import('./pages/InspectionsPage'));
const PermitsPage = lazy(() => import('./pages/PermitsPage'));
const LiensPage = lazy(() => import('./pages/LiensPage'));
const Invoicing = lazy(() => import('./pages/Invoicing'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const Communications = lazy(() => import('./pages/Communications'));
const SettingsPage = lazy(() => import('./pages/Settings'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Layout>{children}</Layout>;
}

// Helper: wrap lazy pages
const L = (el: React.ReactNode) => <Protected><Suspense fallback={<PageFallback />}>{el}</Suspense></Protected>;
// Helper: resource-driven page (not lazy — component is tiny + shared)
const RP = (cfg: React.ComponentProps<typeof ResourcePage>) => <Protected><ResourcePage {...cfg} /></Protected>;

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/projects" element={L(<Projects />)} />
        <Route path="/project/:id" element={L(<ProjectDetail />)} />
        <Route path="/money" element={L(<Money />)} />
        <Route path="/crew" element={L(<CrewPage />)} />
        <Route path="/photos" element={L(<PhotosPage />)} />
        <Route path="/inspections" element={L(<InspectionsPage />)} />
        <Route path="/permits" element={L(<PermitsPage />)} />
        <Route path="/liens" element={L(<LiensPage />)} />
        <Route path="/invoicing" element={L(<Invoicing />)} />
        <Route path="/ai" element={L(<AIAssistant />)} />
        <Route path="/comms" element={L(<Communications />)} />
        <Route path="/settings" element={L(<SettingsPage />)} />

        {/* Full bot-parity data management pages */}
        <Route path="/change-orders" element={RP(R.CHANGE_ORDERS)} />
        <Route path="/tasks" element={RP(R.ASSIGNMENTS)} />
        <Route path="/punchlist" element={RP(R.PUNCHLIST)} />
        <Route path="/rfis" element={RP(R.RFIS)} />
        <Route path="/submittals" element={RP(R.SUBMITTALS)} />
        <Route path="/blockers" element={RP(R.BLOCKERS)} />
        <Route path="/deliveries" element={RP(R.DELIVERIES)} />
        <Route path="/contacts" element={RP(R.CONTACTS)} />
        <Route path="/incidents" element={RP(R.INCIDENTS)} />
        <Route path="/toolbox" element={RP(R.TOOLBOX)} />
        <Route path="/plan-revisions" element={RP(R.PLANREVS)} />
        <Route path="/daily-reports" element={RP(R.DAILYREPORTS)} />
        <Route path="/subs" element={RP(R.SUBS)} />
        <Route path="/liens-manage" element={RP(R.LIENS)} />
        <Route path="/reminders" element={RP(R.REMINDERS)} />
        <Route path="/time-clock" element={RP(R.TIME_ENTRIES)} />
        <Route path="/meetings" element={RP(R.MEETINGS)} />
        <Route path="/chat-history" element={RP(R.CONVERSATIONS)} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
