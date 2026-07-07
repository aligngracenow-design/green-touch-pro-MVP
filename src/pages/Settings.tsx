import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { isMockMode } from '../lib/api';
import { cx } from '../lib/utils';
import { Shield, Database, User as UserIcon, ChevronDown } from 'lucide-react';

const ROLES = ['owner', 'exec', 'foreman', 'sub'] as const;

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-brand/15 text-brand',
  exec: 'bg-blue/15 text-blue',
  foreman: 'bg-amber/15 text-amber',
  sub: 'bg-white/5 text-muted',
};

const STAT_LABELS: Record<string, string> = {
  projects: 'Projects', invoices: 'Invoices', daily_logs: 'Daily Logs',
  documents: 'Documents', notifications: 'Notifications', ai_chat: 'AI Conversations',
  transactions: 'Transactions', subs: 'Subcontractors', todos: 'Tasks', users: 'Users',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [changing, setChanging] = useState<string | null>(null); // user id being changed

  useEffect(() => {
    api.users().then(setUsers).catch(() => setUsers([]));
    api.stats().then(setStats).catch(() => setStats({}));
  }, []);

  async function handleRoleChange(userId: string, newRole: string) {
    setChanging(userId);
    try {
      const updated = await api.changeRole(userId, newRole);
      setUsers((prev) => (prev || []).map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setChanging(null);
    }
  }

  if (!users || !stats) return <Spinner />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="System administration & account management" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-bold mb-4 flex items-center gap-2"><UserIcon className="w-4 h-4 text-brand" /> Your Account</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Name</span><span className="font-semibold">{user?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted">Email</span><span>{user?.email}</span></div>
            <div className="flex justify-between"><span className="text-muted">Company</span><span>{user?.company}</span></div>
            <div className="flex justify-between"><span className="text-muted">Role</span><span className="badge bg-brand/15 text-brand capitalize">{user?.role}</span></div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-brand" /> Backend Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted">Mode</span>
              <span className={cx('badge', isMockMode() ? 'bg-amber/15 text-amber' : 'bg-green/15 text-green')}>
                {isMockMode() ? 'Demo (mock data)' : 'Live API'}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-muted">Database</span><span>SQLite (shared with bot)</span></div>
            <div className="flex justify-between"><span className="text-muted">Auth</span><span>JWT (30-day)</span></div>
            <p className="text-xs text-muted pt-2">
              {isMockMode()
                ? 'Running on seeded sample data. Deploy the /server backend and set VITE_API_URL to go live.'
                : 'Connected to live backend — changes here appear instantly in the Telegram bot.'}
            </p>
          </div>
        </div>
      </div>

      {user?.role === 'owner' && (
        <div className="card mb-6">
          <h3 className="font-bold mb-1 flex items-center gap-2"><UserIcon className="w-4 h-4 text-brand" /> Team Roles</h3>
          <p className="text-xs text-muted mb-4">Change access levels. Changes apply immediately across bot + dashboard.</p>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <div className="w-9 h-9 rounded-full bg-brand/20 text-brand flex items-center justify-center font-bold text-sm shrink-0">
                  {u.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{u.name}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </div>
                {u.id === user?.id ? (
                  <span className={cx('badge capitalize shrink-0', ROLE_COLORS[u.role] || 'bg-white/5 text-muted')}>
                    {u.role} (you)
                  </span>
                ) : (
                  <div className="relative shrink-0">
                    <select
                      className="input !py-1.5 !pl-3 !pr-8 text-sm !bg-white/5 !border-border/50 capitalize min-h-[38px]"
                      value={u.role}
                      disabled={changing === u.id}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {changing === u.id && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <div className="w-3.5 h-3.5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Database className="w-4 h-4 text-brand" /> Database Records</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-2xl font-extrabold text-brand">{v}</div>
              <div className="text-xs text-muted mt-0.5">{STAT_LABELS[k] || k}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
