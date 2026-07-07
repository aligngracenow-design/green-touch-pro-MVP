import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-md relative animate-rise" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-text transition-colors">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6 sm:mb-8 gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-1 text-sm sm:text-base">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, accent, icon: Icon, trend }: {
  label: string; value: ReactNode; sub?: string; accent?: string;
  icon?: React.ComponentType<{ className?: string }>; trend?: 'up' | 'down' | 'flat';
}) {
  const trendColor = trend === 'up' ? 'text-green' : trend === 'down' ? 'text-red' : 'text-muted';
  return (
    <div className="card card-hover overflow-hidden">
      {/* subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-brand-gradient opacity-60" />
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-muted font-semibold">{label}</div>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-brand/12 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-brand" />
          </div>
        )}
      </div>
      <div className={`text-2xl sm:text-3xl font-extrabold mt-2 ${accent || ''}`}>{value}</div>
      {sub && <div className={`text-sm mt-1 ${trend ? trendColor : 'text-muted'}`}>{sub}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
    </div>
  );
}
