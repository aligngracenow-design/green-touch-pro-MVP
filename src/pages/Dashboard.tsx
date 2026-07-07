import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { DashboardData, Project } from '../lib/types';
import { PageHeader, StatCard, Spinner } from '../components/ui';
import { fmtMoney, healthColors } from '../lib/utils';
import { TrendingUp, Building2, DollarSign, AlertCircle } from 'lucide-react';

const HEALTH_HEX: Record<string, string> = { excellent: '#22c55e', good: '#3b82f6', warning: '#f59e0b', critical: '#ef4444' };

// ─── Zero-dependency Bar Chart ──────────────────────────────────
function BarChart({ data }: { data: { name: string; Budget: number; Spent: number }[] }) {
  const max = Math.max(...data.map((d) => Math.max(d.Budget, d.Spent)), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const bw = (d.Budget / max) * 100;
        const sw = (d.Spent / max) * 100;
        return (
          <div key={d.name} className="flex items-center gap-3">
            <span className="text-xs text-muted w-16 shrink-0 truncate text-right">{d.name}</span>
            <div className="flex-1 flex gap-0.5 h-6 items-end">
              <div className="h-4 rounded-sm bg-[#1F2E24] transition-all duration-500" style={{ width: `${bw}%` }} title={`Budget: ${fmtMoney(d.Budget)}`} />
              <div className="h-4 rounded-sm bg-brand transition-all duration-500" style={{ width: `${sw}%`, marginLeft: '-0.125rem' }} title={`Spent: ${fmtMoney(d.Spent)}`} />
            </div>
            <span className="text-xs text-muted w-14 shrink-0 text-right font-mono">{fmtMoney(d.Spent, true)}</span>
          </div>
        );
      })}
      {/* Legend */}
      <div className="flex justify-end gap-4 text-xs text-muted pt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1F2E24]" />Budget</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-brand" />Spent</span>
      </div>
    </div>
  );
}

// ─── Skeleton components ─────────────────────────────────────────
function SkeletonCard() {
  return <div className="card"><div className="skeleton h-3 w-20 mb-3" /><div className="skeleton h-8 w-24 mb-1" /><div className="skeleton h-3 w-32" /></div>;
}

// ─── Error state ─────────────────────────────────────────────────
function ErrorState({ message }: { message: string }) {
  return (
    <div className="card text-center py-12">
      <AlertCircle className="w-8 h-8 text-amber mx-auto mb-3" />
      <div className="font-semibold mb-1">Couldn't load dashboard</div>
      <div className="text-sm text-muted">{message}</div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.dashboard(), api.projects()])
      .then(([d, p]) => { if (!cancelled) { setData(d); setProjects(p); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load'); });
    return () => { cancelled = true; };
  }, []);

  // Loading: show skeleton cards
  if (!data && !error) {
    return (
      <div>
        <PageHeader title="Executive Dashboard" subtitle="Real-time operations across all active projects" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-6">
          <div className="card"><div className="skeleton h-4 w-40 mb-4" /><div className="skeleton h-48 w-full" /></div>
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;
  if (!data) return <Spinner />;

  const budgetData = projects.map((p) => ({
    name: p.name.split('—')[0].trim().slice(0, 14),
    Budget: p.budget,
    Spent: p.spent,
  }));

  

  return (
    <div>
      <PageHeader title="Executive Dashboard" subtitle="Real-time operations across all active projects" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6 stagger">
        <StatCard label="Total Budget" value={fmtMoney(data.financial.total_budget, true)} sub={`${data.financial.budget_util}% utilized`} accent="text-brand" icon={DollarSign} />
        <StatCard label="Active Projects" value={data.projects.active} sub={`${data.projects.total} total · ${data.projects.completed} done`} icon={Building2} />
        <StatCard label="Revenue Collected" value={fmtMoney(data.financial.paid, true)} sub={`${fmtMoney(data.financial.pending, true)} pending`} accent="text-green" icon={TrendingUp} trend="up" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-4 sm:mb-6">
        <div className="card">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-sm sm:text-base"><DollarSign className="w-4 h-4 text-brand shrink-0" /> Budget vs. Spent</h3>
          <BarChart data={budgetData} />
        </div>
      </div>

      {/* Project health */}
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2 text-sm sm:text-base"><Building2 className="w-4 h-4 text-brand shrink-0" /> Project Health</h3>
        <div className="space-y-2">
          {projects.map((p) => {
            const hs = data.health_scores[p.id];
            return (
              <div key={p.id} onClick={() => navigate(`/project/${p.id}`)}
                className="flex items-center gap-3 sm:gap-4 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors min-h-[44px]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{p.name}</span>
                    <span className={`text-xs font-bold uppercase ${healthColors[p.health]}`}>{p.health}</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{p.phase} · {p.progress}% complete</div>
                  <div className="h-1.5 bg-border rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p.progress}%`, background: HEALTH_HEX[p.health] }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base sm:text-lg font-bold flex items-center gap-1 justify-end">
                    <TrendingUp className="w-3.5 h-3.5 text-brand shrink-0" />{hs?.score || '-'}
                  </div>
                  <div className="text-xs text-muted">{fmtMoney(p.spent, true)} / {fmtMoney(p.budget, true)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
