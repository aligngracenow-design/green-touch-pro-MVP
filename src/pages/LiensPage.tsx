import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';
import { fmtMoney } from '../lib/utils';
import { AlertCircle, Shield } from 'lucide-react';

export default function LiensPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.liens().then(setItems).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div className="card text-center py-12"><AlertCircle className="w-8 h-8 text-amber mx-auto mb-3" /><div className="font-semibold">{error}</div></div>;

  return (
    <div>
      <PageHeader title="Lien Releases" subtitle="Subcontractor lien status" />
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-brand" /> All Liens</h3>
        {items.length === 0 ? <p className="text-sm text-muted">No lien releases on file. Add via Telegram bot.</p> : (
          <div className="space-y-2">
            {items.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5">
                <div className="min-w-0 flex-1"><div className="font-semibold text-sm">{l.sub_name}</div><div className="text-xs text-muted">{l.project} · Draw {l.draw} · {l.status}</div></div>
                <div className="text-right shrink-0 ml-4"><div className="font-bold">{fmtMoney(l.amount || 0)}</div><div className="text-xs text-muted">{l.signed_date || 'Unsigned'}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
