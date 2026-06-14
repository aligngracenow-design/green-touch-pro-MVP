import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isMockMode } from '../lib/api';
import {
  LayoutDashboard, Building2, Users, FileText, Bot, Radio, Settings, LogOut, HardHat,
} from 'lucide-react';
import { cx } from '../lib/utils';
import type { ReactNode } from 'react';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: Building2 },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/invoicing', label: 'Invoicing', icon: FileText },
  { to: '/ai', label: 'AI Assistant', icon: Bot },
  { to: '/comms', label: 'Communications', icon: Radio },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-surface border-r border-border flex flex-col fixed h-screen">
        <div className="px-6 py-6 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gold flex items-center justify-center">
              <HardHat className="w-5 h-5 text-bg" />
            </div>
            <div>
              <div className="font-extrabold text-lg leading-none">
                Green Touch<span className="text-gold">Pro</span>
              </div>
              <div className="text-[11px] text-muted mt-0.5">Construction OS</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-gold/10 text-gold' : 'text-muted hover:text-text hover:bg-white/5',
                )
              }
            >
              <Icon className="w-[18px] h-[18px]" />
              {label}
            </NavLink>
          ))}
          {user?.role === 'owner' && (
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-gold/10 text-gold' : 'text-muted hover:text-text hover:bg-white/5',
                )
              }
            >
              <Settings className="w-[18px] h-[18px]" />
              Settings
            </NavLink>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-gold/20 text-gold flex items-center justify-center font-bold text-sm">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{user?.name}</div>
              <div className="text-[11px] text-muted truncate capitalize">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-red hover:bg-red/10 transition-colors"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 min-h-screen">
        {isMockMode() && (
          <div className="bg-gold/10 border-b border-gold/20 text-gold text-xs text-center py-1.5 px-4">
            Demo mode — running on seeded sample data. Connect the backend API to go live.
          </div>
        )}
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
