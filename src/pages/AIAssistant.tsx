import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { PageHeader } from '../components/ui';
import { Bot, Send, Sparkles } from 'lucide-react';

interface Msg { role: 'user' | 'ai'; text: string; }

const SUGGESTIONS = [
  'What are my biggest project risks right now?',
  'How is my budget tracking across all projects?',
  'Give me a summary of my sales pipeline.',
  "What's the schedule status for active jobs?",
];

export default function AIAssistant() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: "Hi Graham 👋 I'm your Green Touch AI assistant. Ask me about project risks, budgets, schedules, or your sales pipeline." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    const { answer } = await api.askAi(q);
    setMessages((m) => [...m, { role: 'ai', text: answer }]);
    setLoading(false);
  }

  return (
    <div>
      <PageHeader title="AI Assistant" subtitle="Ask anything about your projects, budgets & pipeline" />

      <div className="card flex flex-col h-[calc(100vh-220px)] min-h-[480px]">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-3'}>
              {m.role === 'ai' && (
                <div className="w-8 h-8 rounded-lg bg-gold/15 text-gold flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div className={m.role === 'user'
                ? 'bg-gold text-bg rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm font-medium'
                : 'bg-surface-2 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%] text-sm'}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gold/15 text-gold flex items-center justify-center"><Bot className="w-4 h-4" /></div>
              <div className="bg-surface-2 rounded-2xl px-4 py-3 flex gap-1">
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 my-4">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)}
                className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-gold/10 hover:text-gold border border-border transition-colors flex items-center gap-1">
                <Sparkles className="w-3 h-3" />{s}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2 mt-4">
          <input className="input" placeholder="Ask your assistant…" value={input} onChange={(e) => setInput(e.target.value)} />
          <button type="submit" className="btn btn-primary px-4" disabled={loading}>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
