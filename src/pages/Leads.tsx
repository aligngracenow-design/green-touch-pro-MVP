import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Lead } from '../lib/types';
import { PageHeader, Spinner } from '../components/ui';
import { toast } from '../components/Toaster';
import { statusColors, cx } from '../lib/utils';
import { Phone, Mail, Building } from 'lucide-react';

const STATUSES: Lead['status'][] = ['new', 'warm', 'hot', 'won', 'lost'];

export default function Leads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);

  useEffect(() => { api.leads().then(setLeads); }, []);

  if (!leads) return <Spinner />;

  async function changeStatus(id: string, status: string) {
    await api.updateLead(id, 'status', status);
    setLeads((prev) => prev?.map((l) => (l.id === id ? { ...l, status: status as Lead['status'] } : l)) || null);
    toast('Lead updated');
  }

  return (
    <div>
      <PageHeader title="Lead Pipeline" subtitle={`${leads.length} active opportunities`} />

      <div className="space-y-3">
        {leads.map((l) => (
          <div key={l.id} className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg">{l.name}</h3>
                  <span className={cx('badge', statusColors[l.status])}>{l.status}</span>
                  <span className="badge bg-white/5 text-muted">{l.source}</span>
                </div>
                <div className="text-sm text-muted flex items-center gap-1 mb-2"><Building className="w-3.5 h-3.5" />{l.company}</div>
                <p className="text-sm mb-2">{l.project_desc}</p>
                <p className="text-xs text-muted italic">"{l.notes}"</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{l.phone}</span>
                  <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{l.email}</span>
                  {l.sqft > 0 && <span>{l.sqft.toLocaleString()} sq ft</span>}
                </div>
              </div>
              <div className="shrink-0">
                <label className="label">Status</label>
                <select className="input w-32" value={l.status} onChange={(e) => changeStatus(l.id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
