import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';
import { AlertCircle, Camera } from 'lucide-react';

export default function PhotosPage() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.photos().then(setPhotos).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div className="card text-center py-12"><AlertCircle className="w-8 h-8 text-amber mx-auto mb-3" /><div className="font-semibold">{error}</div></div>;

  return (
    <div>
      <PageHeader title="Photos" subtitle="Project photo timeline" />
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Camera className="w-4 h-4 text-brand" /> Recent Photos</h3>
        {photos.length === 0 ? <p className="text-sm text-muted">No photos yet. Send photos via Telegram bot or /eod command.</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p: any) => (
              <div key={p.id} className="rounded-lg overflow-hidden bg-surface-2 border border-border">
                <div className="aspect-square bg-white/5 flex items-center justify-center text-muted text-xs">
                  📸 {p.caption || p.id}
                </div>
                <div className="p-2 text-xs"><div className="truncate font-semibold">{p.project}</div><div className="text-muted">{p.uploaded_by}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
