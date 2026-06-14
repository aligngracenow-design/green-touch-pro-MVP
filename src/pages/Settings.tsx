import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { isMockMode } from '../lib/api';
import { cx } from '../lib/utils';
import { Shield, Database, User as UserIcon } from 'lucide-react';

const STAT_LABELS: Record<string, string> = {
  projects: 'Projects', leads: 'Leads', invoices: 'Invoices', daily_logs: 'Daily Logs',
  documents: 'Documents', notifications: 'Notifications', ai_chat: 'AI Conversations',
  transactions: 'Transactions', subs: 'Subcontractors', todos: 'Tasks', users: 'Users',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api.users().then(setUsers).catch(() => setUsers([]));
    api.stats().then(setStats).catch(() => setStats({}));
  }, []);

  if (!users || !stats) return <Spinner />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="System administration & account management" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-bold mb-4 flex items-center gap-2"><UserIcon className="w-4 h-4 text-gold" /> Your Account</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Name</span><span className="font-semibold">{user?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted">Email</span><span>{user?.email}</span></div>
            <div className="flex justify-between"><span className="text-muted">Company</span><span>{user?.company}</span></div>
            <div className="flex justify-between"><span className="text-muted">Role</span><span className="badge bg-gold/15 text-gold capitalize">{user?.role}</span></div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-gold" /> Backend Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted">Mode</span>
              <span className={cx('badge', isMockMode() ? 'bg-amber/15 text-amber' : 'bg-green/15 text-green')}>
                {isMockMode() ? 'Demo (mock data)' : 'Live API'}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-muted">Database</span><span>SQLite</span></div>
            <div className="flex justify-between"><span className="text-muted">Auth</span><span>JWT (30-day)</span></div>
            <p className="text-xs text-muted pt-2">
              {isMockMode()
                ? 'Running on seeded sample data. Deploy the /server backend and set VITE_API_URL to go live.'
                : 'Connected to the live backend API with persistent storage.'}
            </p>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="font-bold mb-4 flex items-center gap-2"><UserIcon className="w-4 h-4 text-gold" /> Users</h3>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <div className="w-9 h-9 rounded-full bg-gold/20 text-gold flex items-center justify-center font-bold text-sm">
                {u.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{u.name}</div>
                <div className="text-xs text-muted">{u.email}</div>
              </div>
              <span className={cx('badge capitalize', u.role === 'owner' ? 'bg-gold/15 text-gold' : 'bg-white/5 text-muted')}>{u.role}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Database className="w-4 h-4 text-gold" /> Database Records</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-2xl font-extrabold text-gold">{v}</div>
              <div className="text-xs text-muted mt-0.5">{STAT_LABELS[k] || k}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
