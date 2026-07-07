import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';
import { AlertCircle, ClipboardCheck } from 'lucide-react';

export default function InspectionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.inspections().then(setItems).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div className="card text-center py-12"><AlertCircle className="w-8 h-8 text-amber mx-auto mb-3" /><div className="font-semibold">{error}</div></div>;

  return (
    <div>
      <PageHeader title="Inspections" subtitle="Schedule, status & results" />
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-brand" /> All Inspections</h3>
        {items.length === 0 ? <p className="text-sm text-muted">No inspections scheduled. Add via Telegram bot with /addinspection.</p> : (
          <div className="space-y-2">
            {items.map((i: any) => (
              <div key={i.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5">
                <div><div className="font-semibold text-sm">{i.type}</div><div className="text-xs text-muted">{i.project} · {i.scheduled_date}</div></div>
                <span className={`badge text-xs ${i.status === 'passed' ? 'bg-green/20 text-green' : i.status === 'failed' ? 'bg-red/20 text-red' : 'bg-amber/20 text-amber'}`}>{i.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
