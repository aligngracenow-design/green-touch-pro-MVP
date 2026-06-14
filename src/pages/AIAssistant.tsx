import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { PageHeader } from '../components/ui';
import { toast } from '../components/Toaster';
import { useSpeechToText, speak, stopSpeaking, speechSupported, ttsSupported } from '../lib/voice';
import { Bot, Send, Sparkles, Mic, MicOff, Volume2, VolumeX, MessagesSquare, FileText, Square, Copy } from 'lucide-react';

interface Msg { role: 'user' | 'ai'; text: string; }

const SUGGESTIONS = [
  'What are my biggest project risks right now?',
  'How is my budget tracking across all projects?',
  'Give me a summary of my sales pipeline.',
  "What's the schedule status for active jobs?",
];

type Tab = 'chat' | 'meeting';

export default function AIAssistant() {
  const [tab, setTab] = useState<Tab>('chat');

  // chat state
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: "Hi Graham 👋 I'm your Green Touch AI assistant. Ask me anything — or tap the mic to talk. I can also run Meeting Mode to transcribe and summarize." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false);
  const [aiInfo, setAiInfo] = useState<{ provider: string; model: string | null } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const chatStt = useSpeechToText({ continuous: false });
  const meetStt = useSpeechToText({ continuous: true });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { api.aiStatus().then((s) => setAiInfo({ provider: s.provider, model: s.model })).catch(() => {}); }, []);

  // When single-shot dictation finalizes, drop it into the input box.
  useEffect(() => {
    if (tab === 'chat' && chatStt.transcript) setInput(chatStt.transcript);
  }, [chatStt.transcript, tab]);

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    const history = messages.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    chatStt.reset();
    setLoading(true);
    try {
      const { answer } = await api.askAi(q, undefined, history);
      setMessages((m) => [...m, { role: 'ai', text: answer }]);
      if (voiceOut) speak(answer, true);
    } catch {
      setMessages((m) => [...m, { role: 'ai', text: 'Sorry — I had trouble reaching the assistant. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  function toggleChatMic() {
    if (chatStt.listening) chatStt.stop();
    else { chatStt.reset(); chatStt.start(); }
  }

  function toggleVoiceOut() {
    if (voiceOut) { stopSpeaking(); setVoiceOut(false); }
    else { setVoiceOut(true); toast('Voice replies on'); }
  }

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        subtitle={aiInfo ? `Powered by ${aiInfo.provider}${aiInfo.model ? ` · ${aiInfo.model.split('/').pop()}` : ''}` : 'Talk, type, or run a meeting'}
        action={
          <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
            <button onClick={() => setTab('chat')} className={`btn ${tab === 'chat' ? 'btn-primary' : 'btn-ghost'} !py-1.5`}>
              <MessagesSquare className="w-4 h-4" /> Chat
            </button>
            <button onClick={() => setTab('meeting')} className={`btn ${tab === 'meeting' ? 'btn-primary' : 'btn-ghost'} !py-1.5`}>
              <FileText className="w-4 h-4" /> Meeting Mode
            </button>
          </div>
        }
      />

      {tab === 'chat' ? (
        <div className="card flex flex-col h-[calc(100vh-240px)] min-h-[460px]">
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex gap-3'}>
                {m.role === 'ai' && (
                  <div className="w-8 h-8 rounded-lg bg-gold/15 text-gold flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div className={m.role === 'user'
                  ? 'bg-gold text-bg rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm font-medium whitespace-pre-wrap'
                  : 'bg-surface-2 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap'}>
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

          {chatStt.listening && (
            <div className="text-xs text-gold mb-2 flex items-center gap-2 animate-pulse">
              <Mic className="w-3.5 h-3.5" /> Listening… {chatStt.interim && <span className="text-muted italic">"{chatStt.interim}"</span>}
            </div>
          )}
          {chatStt.error && <div className="text-xs text-red mb-2">{chatStt.error}</div>}

          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2 mt-2">
            {speechSupported() && (
              <button type="button" onClick={toggleChatMic} title="Speak"
                className={`btn px-3 ${chatStt.listening ? 'btn-primary' : 'btn-ghost'}`}>
                {chatStt.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
            {ttsSupported() && (
              <button type="button" onClick={toggleVoiceOut} title="Voice replies"
                className={`btn px-3 ${voiceOut ? 'btn-primary' : 'btn-ghost'}`}>
                {voiceOut ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}
            <input className="input" placeholder="Ask your assistant…" value={input} onChange={(e) => setInput(e.target.value)} />
            <button type="submit" className="btn btn-primary px-4" disabled={loading}><Send className="w-4 h-4" /></button>
          </form>
        </div>
      ) : (
        <MeetingMode stt={meetStt} />
      )}
    </div>
  );
}

function MeetingMode({ stt }: { stt: ReturnType<typeof useSpeechToText> }) {
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const fullText = (stt.transcript + ' ' + stt.interim).trim();

  async function summarize() {
    if (!stt.transcript.trim()) { toast('Record something first', 'error'); return; }
    if (stt.listening) stt.stop();
    setSummarizing(true);
    try {
      const { summary } = await api.meetingSummary(stt.transcript);
      setSummary(summary);
      toast('Meeting summarized');
    } catch {
      toast('Could not summarize', 'error');
    } finally {
      setSummarizing(false);
    }
  }

  function copySummary() {
    navigator.clipboard.writeText(summary);
    toast('Copied to clipboard');
  }

  if (!speechSupported()) {
    return <div className="card text-muted">Voice transcription needs Chrome or Edge. You can still type notes in Chat mode.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card flex flex-col h-[calc(100vh-240px)] min-h-[460px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold flex items-center gap-2"><Mic className="w-4 h-4 text-gold" /> Live Transcript</h3>
          <div className="flex gap-2">
            {!stt.listening ? (
              <button className="btn btn-primary !py-1.5" onClick={() => stt.start()}><Mic className="w-4 h-4" /> Record</button>
            ) : (
              <button className="btn btn-ghost !py-1.5" onClick={() => stt.stop()}><Square className="w-4 h-4" /> Stop</button>
            )}
            <button className="btn btn-ghost !py-1.5" onClick={() => { stt.reset(); setSummary(''); }}>Clear</button>
          </div>
        </div>
        {stt.listening && (
          <div className="text-xs text-gold mb-2 flex items-center gap-2 animate-pulse">
            <span className="w-2 h-2 bg-red rounded-full" /> Recording…
          </div>
        )}
        {stt.error && <div className="text-xs text-red mb-2">{stt.error}</div>}
        <div className="flex-1 overflow-y-auto bg-bg/40 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
          {fullText || <span className="text-muted">Tap Record and start your meeting. Words appear here live…</span>}
          {stt.interim && <span className="text-muted italic"> {stt.interim}</span>}
        </div>
        <button className="btn btn-primary mt-3" onClick={summarize} disabled={summarizing || !stt.transcript.trim()}>
          <Sparkles className="w-4 h-4" /> {summarizing ? 'Summarizing…' : 'Summarize & Extract Action Items'}
        </button>
      </div>

      <div className="card flex flex-col h-[calc(100vh-240px)] min-h-[460px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-gold" /> Meeting Notes</h3>
          {summary && <button className="btn btn-ghost !py-1.5" onClick={copySummary}><Copy className="w-4 h-4" /> Copy</button>}
        </div>
        <div className="flex-1 overflow-y-auto bg-bg/40 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
          {summary || <span className="text-muted">Your structured summary — decisions, action items, and risks — appears here after summarizing.</span>}
        </div>
      </div>
    </div>
  );
}
