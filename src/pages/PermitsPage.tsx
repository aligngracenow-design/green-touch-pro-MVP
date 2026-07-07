import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';
import { AlertCircle, FileCheck } from 'lucide-react';

export default function PermitsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.permits().then(setItems).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div className="card text-center py-12"><AlertCircle className="w-8 h-8 text-amber mx-auto mb-3" /><div className="font-semibold">{error}</div></div>;

  return (
    <div>
      <PageHeader title="Permits" subtitle="Active & expiring permits" />
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><FileCheck className="w-4 h-4 text-brand" /> All Permits</h3>
        {items.length === 0 ? <p className="text-sm text-muted">No permits on file. Add via Telegram bot.</p> : (
          <div className="space-y-2">
            {items.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5">
                <div className="min-w-0 flex-1"><div className="font-semibold text-sm">{p.type} {p.permit_number ? `#${p.permit_number}` : ''}</div><div className="text-xs text-muted">{p.project} · {p.jurisdiction} · Expires {p.expiration_date}</div></div>
                <span className={`badge text-xs ${p.status === 'issued' ? 'bg-green/20 text-green' : 'bg-amber/20 text-amber'}`}>{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
