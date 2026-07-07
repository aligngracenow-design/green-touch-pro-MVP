import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { PageHeader, Spinner, Modal } from './ui';
import { Plus, Search, Check, Trash2, Pencil, RefreshCw } from 'lucide-react';

export type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'textarea' | 'select';
  options?: string[];
  required?: boolean;
  hideInTable?: boolean;
};

export type ActionDef = {
  label: string;
  status: string;         // status value to set
  color?: string;         // tailwind text color class
  when?: (row: any) => boolean; // show only when predicate true
};

export type ResourceConfig = {
  table: string;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  fields: FieldDef[];
  badge?: (row: any) => { text: string; cls: string } | null;
  actions?: ActionDef[];      // status-transition buttons per row (uses /action endpoint)
  primaryKey?: string;
};

const STATUS_CLS: Record<string, string> = {
  open: 'bg-blue/15 text-blue', pending: 'bg-amber/15 text-amber',
  active: 'bg-green/15 text-green', scheduled: 'bg-blue/15 text-blue',
  approved: 'bg-green/15 text-green', closed: 'bg-muted/20 text-muted',
  done: 'bg-green/15 text-green', completed: 'bg-green/15 text-green',
  resolved: 'bg-green/15 text-green', signed: 'bg-green/15 text-green',
  rejected: 'bg-red/15 text-red', expired: 'bg-red/15 text-red',
  passed: 'bg-green/15 text-green', failed: 'bg-red/15 text-red',
};

function statusBadge(row: any) {
  const s = (row.status || '').toLowerCase();
  if (!s) return null;
  return { text: row.status, cls: STATUS_CLS[s] || 'bg-white/10 text-muted' };
}

export default function ResourcePage(cfg: ResourceConfig) {
  const pk = cfg.primaryKey || 'id';
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.list(cfg.table)
      .then((r) => { setRows(Array.isArray(r) ? r : []); setError(''); })
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [cfg.table]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditing(null); setForm({}); setModal(true); }
  function openEdit(row: any) { setEditing(row); setForm({ ...row }); setModal(true); }

  async function save() {
    setSaving(true);
    try {
      if (editing) await api.update(cfg.table, editing[pk], form);
      else await api.create(cfg.table, form);
      setModal(false);
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  }

  async function runAction(row: any, status: string) {
    try { await api.action(cfg.table, row[pk], { status }); load(); }
    catch (e) { alert((e as Error).message); }
  }

  async function del(row: any) {
    if (!confirm('Delete this item?')) return;
    try { await api.remove(cfg.table, row[pk]); load(); }
    catch (e) { alert((e as Error).message); }
  }

  const badgeFn = cfg.badge || statusBadge;
  const tableFields = cfg.fields.filter((f) => !f.hideInTable);
  const filtered = q
    ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        action={
          <div className="flex items-center gap-2">
            <button onClick={load} className="btn btn-ghost !px-3" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={openCreate} className="btn btn-primary"><Plus className="w-4 h-4" /> New</button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input !pl-9" placeholder={`Search ${cfg.title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? <Spinner /> : error ? (
        <div className="card text-center py-10 text-muted">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          {cfg.icon && <cfg.icon className="w-8 h-8 text-muted mx-auto mb-3" />}
          <div className="font-semibold mb-1">No {cfg.title.toLowerCase()} yet</div>
          <div className="text-sm text-muted mb-4">Create the first one, or add it from the Green Touch Bot.</div>
          <button onClick={openCreate} className="btn btn-primary mx-auto"><Plus className="w-4 h-4" /> New {cfg.title.replace(/s$/, '')}</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card !p-0 overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    {tableFields.map((f) => <th key={f.key} className="px-4 py-3 font-semibold">{f.label}</th>)}
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const b = badgeFn(row);
                    return (
                      <tr key={row[pk]} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                        {tableFields.map((f) => (
                          <td key={f.key} className="px-4 py-3">
                            {f.key === 'status' && b
                              ? <span className={`badge ${b.cls}`}>{b.text}</span>
                              : <span className="text-text/90">{String(row[f.key] ?? '—')}</span>}
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {cfg.actions?.filter((a) => !a.when || a.when(row)).map((a) => (
                              <button key={a.label} onClick={() => runAction(row, a.status)}
                                className={`btn btn-ghost !py-1.5 !px-2.5 !min-h-0 text-xs ${a.color || ''}`}>
                                <Check className="w-3.5 h-3.5" /> {a.label}
                              </button>
                            ))}
                            <button onClick={() => openEdit(row)} className="btn btn-ghost !py-1.5 !px-2 !min-h-0" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => del(row)} className="btn btn-ghost !py-1.5 !px-2 !min-h-0 text-red" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((row) => {
              const b = badgeFn(row);
              return (
                <div key={row[pk]} className="card">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-semibold text-sm">{String(row[tableFields[0]?.key] ?? '—')}</div>
                    {b && <span className={`badge ${b.cls} shrink-0`}>{b.text}</span>}
                  </div>
                  <div className="space-y-1 text-xs text-muted">
                    {tableFields.slice(1).map((f) => (
                      f.key !== 'status' && <div key={f.key}><span className="text-muted/60">{f.label}:</span> {String(row[f.key] ?? '—')}</div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/50 flex-wrap">
                    {cfg.actions?.filter((a) => !a.when || a.when(row)).map((a) => (
                      <button key={a.label} onClick={() => runAction(row, a.status)} className={`btn btn-ghost !py-2 !px-3 !min-h-0 text-xs ${a.color || ''}`}>
                        <Check className="w-3.5 h-3.5" /> {a.label}
                      </button>
                    ))}
                    <button onClick={() => openEdit(row)} className="btn btn-ghost !py-2 !px-3 !min-h-0 text-xs"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                    <button onClick={() => del(row)} className="btn btn-ghost !py-2 !px-3 !min-h-0 text-xs text-red"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Edit ${cfg.title.replace(/s$/, '')}` : `New ${cfg.title.replace(/s$/, '')}`}>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {cfg.fields.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}{f.required && <span className="text-red"> *</span>}</label>
              {f.type === 'textarea' ? (
                <textarea className="input min-h-[80px]" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              ) : f.type === 'select' ? (
                <select className="input" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                  <option value="">Select…</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
        <button onClick={save} disabled={saving} className="btn btn-primary w-full mt-4">
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
        </button>
      </Modal>
    </div>
  );
}
