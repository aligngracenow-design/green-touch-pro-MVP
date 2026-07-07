import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Notification } from '../lib/types';
import { PageHeader, Spinner } from '../components/ui';
import { toast } from '../components/Toaster';
import { cx } from '../lib/utils';
import { Send, MessageSquare, Mail, Hash, Smartphone, Building2 } from 'lucide-react';

const CHANNELS = [
  { key: 'telegram', label: 'Telegram', icon: MessageSquare },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'slack', label: 'Slack', icon: Hash },
  { key: 'sms', label: 'SMS', icon: Smartphone },
  { key: 'teams', label: 'Teams', icon: Building2 },
];

const CHANNEL_COLORS: Record<string, string> = {
  telegram: 'text-blue', email: 'text-brand', slack: 'text-green', sms: 'text-amber', teams: 'text-blue',
};

export default function Communications() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<string[]>(['telegram', 'email']);
  const [sending, setSending] = useState(false);

  async function load() { setNotifications(await api.notifications()); }
  useEffect(() => { load(); }, []);

  function toggle(ch: string) {
    setSelected((s) => (s.includes(ch) ? s.filter((x) => x !== ch) : [...s, ch]));
  }

  async function send() {
    if (!message.trim() || selected.length === 0) return;
    setSending(true);
    await api.notify(message, selected);
    toast(`Broadcast sent to ${selected.length} channel${selected.length > 1 ? 's' : ''}`);
    setMessage('');
    await load();
    setSending(false);
  }

  if (!notifications) return <Spinner />;

  return (
    <div>
      <PageHeader title="Communications" subtitle="Broadcast to clients & team across every channel at once" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-bold mb-4">Compose Broadcast</h3>
          <label className="label">Channels</label>
          <div className="flex flex-wrap gap-2 mb-4">
            {CHANNELS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => toggle(key)}
                className={cx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                  selected.includes(key) ? 'bg-brand/10 border-brand/40 text-brand' : 'bg-white/5 border-border text-muted hover:text-text')}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
          <label className="label">Message</label>
          <textarea className="input min-h-[120px] mb-4" placeholder="Type your update…" value={message} onChange={(e) => setMessage(e.target.value)} />
          <button className="btn btn-primary w-full" onClick={send} disabled={sending || !message.trim() || selected.length === 0}>
            <Send className="w-4 h-4" /> {sending ? 'Sending…' : `Send to ${selected.length} channel${selected.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        <div className="card">
          <h3 className="font-bold mb-4">Message History</h3>
          <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
            {notifications.map((n) => {
              const Icon = CHANNELS.find((c) => c.key === n.channel)?.icon || MessageSquare;
              return (
                <div key={n.id} className="flex gap-3 pb-3 border-b border-border last:border-0">
                  <div className={cx('w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0', CHANNEL_COLORS[n.channel])}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm">{n.message}</div>
                    <div className="text-xs text-muted mt-0.5 capitalize">{n.channel} · {n.sent_at}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
