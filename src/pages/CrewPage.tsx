import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';
import { AlertCircle, Users2, Clock } from 'lucide-react';

export default function CrewPage() {
  const [crew, setCrew] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.crew().then(setCrew).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div className="card text-center py-12"><AlertCircle className="w-8 h-8 text-amber mx-auto mb-3" /><div className="font-semibold">{error}</div></div>;

  const onSite = crew.filter((c: any) => !c.clock_out);
  return (
    <div>
      <PageHeader title="Crew" subtitle="Who's on site right now" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card"><div className="text-xs text-muted uppercase font-semibold mb-1">On Site Now</div><div className="text-3xl font-extrabold text-green">{onSite.length}</div></div>
        <div className="card"><div className="text-xs text-muted uppercase font-semibold mb-1">Today Total</div><div className="text-3xl font-extrabold text-brand">{crew.length}</div></div>
      </div>
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Users2 className="w-4 h-4 text-brand" /> Time Entries</h3>
        {crew.length === 0 ? <p className="text-sm text-muted">No crew clocked in today. Use /clockin via Telegram bot.</p> : (
          <div className="space-y-2">
            {crew.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5">
                <div className="min-w-0 flex-1"><div className="font-semibold text-sm">{c.worker_name}</div><div className="text-xs text-muted">{c.trade} · {c.project}</div></div>
                <div className="text-right shrink-0 ml-4 flex items-center gap-2">
                  {!c.clock_out ? <span className="badge bg-green/20 text-green text-xs">On Site</span> : <span className="text-xs text-muted flex items-center gap-1"><Clock className="w-3 h-3" />{c.hours || '?'}h</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
