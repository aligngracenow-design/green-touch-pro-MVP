import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import { api } from '../lib/api';
import type { DashboardData, Project } from '../lib/types';
import { PageHeader, StatCard, Spinner } from '../components/ui';
import { fmtMoney, healthColors } from '../lib/utils';
import { TrendingUp, Building2, Users, DollarSign } from 'lucide-react';

const HEALTH_HEX: Record<string, string> = { excellent: '#22c55e', good: '#3b82f6', warning: '#f59e0b', critical: '#ef4444' };

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.dashboard(), api.projects()]).then(([d, p]) => {
      setData(d);
      setProjects(p);
    });
  }, []);

  if (!data) return <Spinner />;

  const budgetData = projects.map((p) => ({
    name: p.name.split('—')[0].trim().slice(0, 14),
    Budget: p.budget,
    Spent: p.spent,
  }));

  const leadPie = [
    { name: 'Hot', value: data.leads.hot, color: '#ef4444' },
    { name: 'Warm', value: data.leads.warm, color: '#f59e0b' },
    { name: 'New', value: data.leads.new, color: '#3b82f6' },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <PageHeader title="Executive Dashboard" subtitle="Real-time operations across all active projects" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Budget" value={fmtMoney(data.financial.total_budget, true)} sub={`${data.financial.budget_util}% utilized`} accent="text-gold" />
        <StatCard label="Active Projects" value={data.projects.active} sub={`${data.projects.total} total · ${data.projects.completed} done`} />
        <StatCard label="Revenue Collected" value={fmtMoney(data.financial.paid, true)} sub={`${fmtMoney(data.financial.pending, true)} pending`} accent="text-green" />
        <StatCard label="Active Leads" value={data.leads.total} sub={`${data.leads.hot} hot · ${data.leads.warm} warm`} accent="text-amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="card lg:col-span-2">
          <h3 className="font-bold mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-gold" /> Budget vs. Spent</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={budgetData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <XAxis dataKey="name" stroke="#667799" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#667799" fontSize={11} tickFormatter={(v) => `$${v / 1000}k`} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0e1426', border: '1px solid #1a2340', borderRadius: 8, color: '#e0e6f0' }} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="Budget" fill="#1a2340" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Spent" fill="#d4af37" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-bold mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-gold" /> Lead Pipeline</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={leadPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {leadPie.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0e1426', border: '1px solid #1a2340', borderRadius: 8, color: '#e0e6f0' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {leadPie.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name} ({d.value})
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-gold" /> Project Health</h3>
        <div className="space-y-3">
          {projects.map((p) => {
            const hs = data.health_scores[p.id];
            return (
              <div key={p.id} onClick={() => navigate(`/project/${p.id}`)}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{p.name}</span>
                    <span className={`text-xs font-bold uppercase ${healthColors[p.health]}`}>{p.health}</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{p.phase} · {p.progress}% complete</div>
                  <div className="h-1.5 bg-border rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: HEALTH_HEX[p.health] }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-gold" />{hs?.score}
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
