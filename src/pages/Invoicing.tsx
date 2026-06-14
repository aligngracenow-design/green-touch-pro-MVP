import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Invoice } from '../lib/types';
import { PageHeader, StatCard, Spinner } from '../components/ui';
import { toast } from '../components/Toaster';
import { fmtMoney, statusColors, cx } from '../lib/utils';
import { Send, CheckCircle } from 'lucide-react';

export default function Invoicing() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() { setInvoices(await api.invoices()); }
  useEffect(() => { load(); }, []);

  if (!invoices) return <Spinner />;

  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const paid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const outstanding = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);

  async function send(id: string) {
    setBusy(id);
    await api.sendInvoice(id);
    toast('Invoice sent to client');
    await load();
    setBusy(null);
  }
  async function pay(id: string) {
    setBusy(id);
    await api.payInvoice(id);
    toast('Payment recorded');
    await load();
    setBusy(null);
  }

  return (
    <div>
      <PageHeader title="Invoicing" subtitle="Billing, payments & collections" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Invoiced" value={fmtMoney(total, true)} accent="text-gold" />
        <StatCard label="Collected" value={fmtMoney(paid, true)} accent="text-green" />
        <StatCard label="Outstanding" value={fmtMoney(outstanding, true)} accent="text-amber" />
      </div>

      <div className="space-y-3">
        {invoices.map((inv) => (
          <div key={inv.id} className="card flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold">{inv.id}</span>
                <span className={cx('badge', statusColors[inv.status])}>{inv.status}</span>
              </div>
              <div className="text-sm mt-1">{inv.description}</div>
              <div className="text-xs text-muted mt-0.5">{inv.client_name} · {inv.client_email} · Due {inv.due_date}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold">{fmtMoney(inv.amount)}</div>
              {inv.paid_date && <div className="text-xs text-green">Paid {inv.paid_date}</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              {inv.status === 'draft' && (
                <button className="btn btn-ghost" disabled={busy === inv.id} onClick={() => send(inv.id)}>
                  <Send className="w-4 h-4" /> Send
                </button>
              )}
              {inv.status !== 'paid' && (
                <button className="btn btn-primary" disabled={busy === inv.id} onClick={() => pay(inv.id)}>
                  <CheckCircle className="w-4 h-4" /> Mark Paid
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
