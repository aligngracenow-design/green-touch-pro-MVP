import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { isMockMode } from '../lib/api';
import {
  LayoutDashboard, Building2, FileText, Bot, Radio, Settings, LogOut, Menu, X,
  DollarSign, ClipboardCheck, Shield, FileCheck, Camera, Users2, Send, ExternalLink,
  FileQuestion, FileCheck2, AlertTriangle, Truck, Contact, ShieldAlert, Megaphone,
  FileStack, ClipboardList, HardHat, ListTodo, Bell, Clock, Calendar, MessageSquare,
} from 'lucide-react';
import { cx } from '../lib/utils';
import { Logo } from './Logo';
import type { ReactNode } from 'react';

// External destinations
const BOT_URL = 'https://t.me/GreenTouchProBot';
const COMPANY_URL = 'https://greentouchbuilders.com';

// Grouped navigation for scannability
const navGroups: { heading: string; items: { to: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/projects', label: 'Projects', icon: Building2 },
      { to: '/money', label: 'Money', icon: DollarSign },
      { to: '/change-orders', label: 'Change Orders', icon: DollarSign },
      { to: '/tasks', label: 'Tasks', icon: ListTodo },
    ],
  },
  {
    heading: 'Field',
    items: [
      { to: '/crew', label: 'Crew', icon: Users2 },
      { to: '/time-clock', label: 'Time Clock', icon: Clock },
      { to: '/photos', label: 'Photos', icon: Camera },
      { to: '/punchlist', label: 'Punch List', icon: ClipboardCheck },
      { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
      { to: '/deliveries', label: 'Deliveries', icon: Truck },
      { to: '/daily-reports', label: 'Daily Reports', icon: ClipboardList },
      { to: '/toolbox', label: 'Toolbox Talks', icon: Megaphone },
      { to: '/incidents', label: 'Safety', icon: ShieldAlert },
    ],
  },
  {
    heading: 'Documents',
    items: [
      { to: '/permits', label: 'Permits', icon: FileCheck },
      { to: '/rfis', label: 'RFIs', icon: FileQuestion },
      { to: '/submittals', label: 'Submittals', icon: FileCheck2 },
      { to: '/plan-revisions', label: 'Plan Revisions', icon: FileStack },
      { to: '/liens', label: 'Liens', icon: Shield },
      { to: '/liens-manage', label: 'Lien Releases', icon: Shield },
      { to: '/blockers', label: 'Blockers', icon: AlertTriangle },
    ],
  },
  {
    heading: 'Directory',
    items: [
      { to: '/subs', label: 'Subcontractors', icon: HardHat },
      { to: '/contacts', label: 'Contacts', icon: Contact },
    ],
  },
  {
    heading: 'Business',
    items: [
      { to: '/invoicing', label: 'Invoicing', icon: FileText },
      { to: '/meetings', label: 'Meetings', icon: Calendar },
      { to: '/reminders', label: 'Reminders', icon: Bell },
      { to: '/comms', label: 'Communications', icon: Radio },
      { to: '/chat-history', label: 'Chat History', icon: MessageSquare },
      { to: '/ai', label: 'AI Assistant', icon: Bot },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/login');
    setOpen(false);
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] relative group',
      isActive
        ? 'bg-brand/12 text-brand'
        : 'text-muted hover:text-text hover:bg-white/5',
    );

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <Logo variant="full" />
          <button onClick={() => setOpen(false)} className="lg:hidden text-muted hover:text-text -mr-1 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.heading}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted/60">
              {group.heading}
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)} className={navLinkClass}>
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-brand" />}
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {user?.role === 'owner' && (
          <div>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted/60">Admin</div>
            <NavLink to="/settings" onClick={() => setOpen(false)} className={navLinkClass}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-brand" />}
                  <Settings className="w-[18px] h-[18px] shrink-0" />
                  Settings
                </>
              )}
            </NavLink>
          </div>
        )}

        {/* Quick links — Bot + Company site */}
        <div>
          <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted/60">Quick Links</div>
          <div className="space-y-0.5">
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-brand hover:bg-brand/8 transition-all min-h-[44px]">
              <Send className="w-[18px] h-[18px] shrink-0" />
              <span className="flex-1">Green Touch Bot</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </a>
            <a href={COMPANY_URL} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-brand hover:bg-brand/8 transition-all min-h-[44px]">
              <Building2 className="w-[18px] h-[18px] shrink-0" />
              <span className="flex-1">greentouchbuilders.com</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-50" />
            </a>
          </div>
        </div>
      </nav>

      <div className="px-3 py-4 border-t border-border shrink-0">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold text-sm shrink-0">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-[11px] text-muted truncate capitalize">{user?.role}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-red hover:bg-red/10 transition-colors min-h-[44px]"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen relative z-10">
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={cx(
          'bg-surface/95 backdrop-blur-xl border-r border-border flex-col z-50',
          'fixed top-0 left-0 h-screen w-64',
          'flex', // always flex for desktop
          // Mobile: hidden by default, slides in when open
          open ? 'max-lg:flex animate-slide-in' : 'max-lg:hidden',
        )}
      >
        {sidebarContent}
      </aside>

      <div className="w-64 shrink-0 hidden lg:block" />

      <main className="flex-1 min-h-screen min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <button onClick={() => setOpen(true)} className="text-muted hover:text-text p-2 -ml-2 rounded-lg hover:bg-white/5 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <Menu className="w-5 h-5" />
            </button>
            <Logo variant="mark" size={30} />
            <span className="font-bold text-sm">GreenTouch<span className="text-brand">.Pro</span></span>
          </div>
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer"
            className="w-9 h-9 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0 active:scale-95 transition-transform">
            <Send className="w-4 h-4" />
          </a>
        </div>

        {isMockMode() && (
          <div className="bg-brand/10 border-b border-brand/20 text-brand text-xs text-center py-1.5 px-4">
            Demo mode — running on seeded sample data. Connect the backend API to go live.
          </div>
        )}

        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
