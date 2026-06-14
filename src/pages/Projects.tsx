import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Project } from '../lib/types';
import { PageHeader, Spinner } from '../components/ui';
import { fmtMoney, statusColors, healthColors, cx } from '../lib/utils';
import { MapPin, ChevronRight } from 'lucide-react';

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.projects().then(setProjects);
  }, []);

  if (!projects) return <Spinner />;

  return (
    <div>
      <PageHeader title="Projects" subtitle={`${projects.length} projects across Northern Virginia & DC`} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {projects.map((p) => (
          <div key={p.id} onClick={() => navigate(`/project/${p.id}`)}
            className="card hover:border-gold/40 cursor-pointer transition-all group">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cx('badge', statusColors[p.status])}>{p.status}</span>
                  <span className={cx('text-xs font-bold uppercase', healthColors[p.health])}>{p.health}</span>
                </div>
                <h3 className="font-bold text-lg leading-tight">{p.name}</h3>
                <div className="text-sm text-muted mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />{p.address}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted group-hover:text-gold transition-colors shrink-0" />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3 text-center">
              <div>
                <div className="text-xs text-muted">Budget</div>
                <div className="font-bold text-sm">{fmtMoney(p.budget, true)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Spent</div>
                <div className="font-bold text-sm text-gold">{fmtMoney(p.spent, true)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Sq Ft</div>
                <div className="font-bold text-sm">{p.sqft.toLocaleString()}</div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>{p.phase}</span>
                <span>{p.progress}%</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${p.progress}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
