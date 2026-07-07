import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';
import { fmtMoney } from '../lib/utils';
import { AlertCircle, DollarSign } from 'lucide-react';

export default function MoneyPage() {
  const [cos, setCos] = useState<any[]>([]);
  const [liens, setLiens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.cos(), api.liens()])
      .then(([c, l]) => { setCos(c); setLiens(l); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div className="card text-center py-12"><AlertCircle className="w-8 h-8 text-amber mx-auto mb-3" /><div className="font-semibold">{error}</div></div>;

  const totalCOs = cos.reduce((s: number, c: any) => s + (c.cost || 0), 0);
  const approvedCOs = cos.filter((c: any) => c.status === 'approved').length;
  const totalLiens = liens.reduce((s: number, l: any) => s + (l.amount || 0), 0);

  return (
    <div>
      <PageHeader title="Money" subtitle="Change orders, liens & budget impact" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card"><div className="text-xs text-muted uppercase font-semibold mb-1">Change Orders</div><div className="text-3xl font-extrabold text-brand">{cos.length}</div><div className="text-sm text-muted mt-1">{approvedCOs} approved · {fmtMoney(totalCOs)} total</div></div>
        <div className="card"><div className="text-xs text-muted uppercase font-semibold mb-1">CO Impact</div><div className="text-3xl font-extrabold text-amber">{fmtMoney(totalCOs, true)}</div></div>
        <div className="card"><div className="text-xs text-muted uppercase font-semibold mb-1">Lien Releases</div><div className="text-3xl font-extrabold text-blue">{liens.length}</div><div className="text-sm text-muted mt-1">{fmtMoney(totalLiens)} pending</div></div>
      </div>

      <div className="card mb-4">
        <h3 className="font-bold mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-brand" /> Change Orders</h3>
        {cos.length === 0 ? <p className="text-sm text-muted">No change orders yet. Add via Telegram bot with /addco.</p> : (
          <div className="space-y-2">
            {cos.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5">
                <div className="min-w-0 flex-1"><div className="font-semibold text-sm truncate">{c.description || c.id}</div><div className="text-xs text-muted">{c.project} · {c.status}</div></div>
                <div className="text-right shrink-0 ml-4"><div className="font-bold">{fmtMoney(c.cost || 0)}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-bold mb-4">Lien Releases</h3>
        {liens.length === 0 ? <p className="text-sm text-muted">No lien releases yet.</p> : (
          <div className="space-y-2">
            {liens.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5">
                <div className="min-w-0 flex-1"><div className="font-semibold text-sm truncate">{l.sub_name || l.id}</div><div className="text-xs text-muted">{l.project} · {l.status}</div></div>
                <div className="text-right shrink-0 ml-4"><div className="font-bold">{fmtMoney(l.amount || 0)}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
