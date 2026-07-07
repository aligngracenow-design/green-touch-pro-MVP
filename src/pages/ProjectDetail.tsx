import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Project } from '../lib/types';
import { Spinner, Modal } from '../components/ui';
import { toast } from '../components/Toaster';
import { fmtMoney, statusColors, healthColors, priorityColors, cx } from '../lib/utils';
import {
  ArrowLeft, MapPin, FileText, Users, CheckSquare, Square, Trash2, Plus, Calendar, Hammer,
} from 'lucide-react';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<'overview' | 'todos' | 'logs' | 'subs' | 'docs'>('overview');
  const [todoModal, setTodoModal] = useState(false);
  const [logText, setLogText] = useState('');
  const [newTodo, setNewTodo] = useState<{ task: string; assignee: string; priority: 'high' | 'med' | 'low'; due_date: string }>({ task: '', assignee: 'Graham', priority: 'med', due_date: '' });

  async function load() {
    if (id) setProject(await api.project(id));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!project) return <Spinner />;

  async function addTodo() {
    if (!newTodo.task.trim() || !id) return;
    await api.addTodo(id, newTodo);
    setTodoModal(false);
    setNewTodo({ task: '', assignee: 'Graham', priority: 'med', due_date: '' });
    toast('Task added');
    load();
  }
  async function toggleTodo(tid: string) {
    await api.toggleTodo(tid);
    load();
  }
  async function delTodo(tid: string) {
    await api.deleteTodo(tid);
    toast('Task deleted');
    load();
  }
  async function addLog() {
    if (!logText.trim() || !id) return;
    await api.addLog(id, logText);
    setLogText('');
    toast('Log entry added');
    load();
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'todos', label: `Tasks (${project.todos.length})` },
    { key: 'logs', label: `Daily Logs (${project.daily_logs.length})` },
    { key: 'subs', label: `Subs (${project.subs.length})` },
    { key: 'docs', label: `Docs (${project.documents.length})` },
  ] as const;

  return (
    <div>
      <button onClick={() => navigate('/projects')} className="flex items-center gap-2 text-muted hover:text-text text-sm mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Projects
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cx('badge', statusColors[project.status])}>{project.status}</span>
            <span className={cx('text-xs font-bold uppercase', healthColors[project.health])}>{project.health}</span>
          </div>
          <h1 className="text-3xl font-extrabold">{project.name}</h1>
          <div className="text-muted mt-1 flex items-center gap-1"><MapPin className="w-4 h-4" />{project.address}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted">Permit</div>
          <div className="font-mono font-semibold">{project.permit}</div>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card"><div className="text-xs text-muted uppercase">Budget</div><div className="text-2xl font-extrabold mt-1">{fmtMoney(project.budget, true)}</div></div>
        <div className="card"><div className="text-xs text-muted uppercase">Spent</div><div className="text-2xl font-extrabold mt-1 text-brand">{fmtMoney(project.spent, true)}</div><div className="text-xs text-muted">{project.budget_pct}% used</div></div>
        <div className="card"><div className="text-xs text-muted uppercase">Remaining</div><div className="text-2xl font-extrabold mt-1 text-green">{fmtMoney(project.remaining, true)}</div></div>
        <div className="card"><div className="text-xs text-muted uppercase">Progress</div><div className="text-2xl font-extrabold mt-1">{project.progress}%</div><div className="text-xs text-muted">{project.phase}</div></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cx('px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors',
              tab === t.key ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-text')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card">
            <h3 className="font-bold mb-3">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Start</span><span>{project.start}</span></div>
              <div className="flex justify-between"><span className="text-muted">Target Completion</span><span>{project.completion}</span></div>
              <div className="flex justify-between"><span className="text-muted">Client</span><span>{project.client}</span></div>
              <div className="flex justify-between"><span className="text-muted">Square Footage</span><span>{project.sqft.toLocaleString()} sq ft</span></div>
            </div>
          </div>
          <div className="card">
            <h3 className="font-bold mb-3">Recent Activity</h3>
            {project.daily_logs.slice(0, 3).map((l) => (
              <div key={l.id} className="text-sm py-2 border-b border-border last:border-0">
                <div className="text-muted text-xs">{l.date} · {l.submitted_by}</div>
                <div>{l.text}</div>
              </div>
            ))}
            {project.daily_logs.length === 0 && <div className="text-muted text-sm">No activity yet.</div>}
          </div>
        </div>
      )}

      {tab === 'todos' && (
        <div>
          <div className="flex justify-end mb-4">
            <button className="btn btn-primary" onClick={() => setTodoModal(true)}><Plus className="w-4 h-4" /> Add Task</button>
          </div>
          <div className="space-y-2">
            {project.todos.map((t) => (
              <div key={t.id} className="card flex items-center gap-3 py-3">
                <button onClick={() => toggleTodo(t.id)} className="text-brand shrink-0">
                  {t.status === 'done' ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-muted" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={cx('font-medium', t.status === 'done' && 'line-through text-muted')}>{t.task}</div>
                  <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                    <span>{t.assignee}</span>
                    {t.due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t.due_date}</span>}
                  </div>
                </div>
                <span className={cx('badge', priorityColors[t.priority])}>{t.priority}</span>
                <button onClick={() => delTodo(t.id)} className="text-muted hover:text-red shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {project.todos.length === 0 && <div className="card text-muted text-sm text-center">No tasks yet. Add one to get started.</div>}
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div>
          <div className="card mb-4">
            <h3 className="font-bold mb-3 flex items-center gap-2"><Hammer className="w-4 h-4 text-brand" /> Add Daily Log</h3>
            <textarea className="input min-h-[80px] mb-3" placeholder="What happened on site today?" value={logText} onChange={(e) => setLogText(e.target.value)} />
            <button className="btn btn-primary" onClick={addLog}><Plus className="w-4 h-4" /> Add Entry</button>
          </div>
          <div className="space-y-2">
            {project.daily_logs.map((l) => (
              <div key={l.id} className="card py-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted">{l.date} · {l.submitted_by}</div>
                  <span className="badge bg-white/5 text-muted">{l.category}</span>
                </div>
                <div className="mt-1">{l.text}</div>
                {l.photos > 0 && <div className="text-xs text-muted mt-1">📷 {l.photos} photos</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'subs' && (
        <div className="space-y-2">
          {project.subs.map((s) => (
            <div key={s.id} className="card flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0"><Users className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-muted">{s.email}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm">{fmtMoney(s.rate, true)}</div>
                <span className={cx('badge', statusColors[s.status] || 'bg-white/5 text-muted')}>{s.status}</span>
              </div>
            </div>
          ))}
          {project.subs.length === 0 && <div className="card text-muted text-sm text-center">No subcontractors assigned.</div>}
        </div>
      )}

      {tab === 'docs' && (
        <div className="space-y-2">
          {project.documents.map((d) => (
            <div key={d.id} className="card flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-lg bg-blue/15 text-blue flex items-center justify-center shrink-0"><FileText className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{d.name}</div>
                <div className="text-xs text-muted uppercase">{d.type} · {d.size}</div>
              </div>
            </div>
          ))}
          {project.documents.length === 0 && <div className="card text-muted text-sm text-center">No documents uploaded.</div>}
        </div>
      )}

      <Modal open={todoModal} onClose={() => setTodoModal(false)} title="Add Task">
        <label className="label">Task</label>
        <input className="input mb-3" value={newTodo.task} onChange={(e) => setNewTodo({ ...newTodo, task: e.target.value })} placeholder="e.g. Schedule final inspection" />
        <label className="label">Assignee</label>
        <input className="input mb-3" value={newTodo.assignee} onChange={(e) => setNewTodo({ ...newTodo, assignee: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Priority</label>
            <select className="input" value={newTodo.priority} onChange={(e) => setNewTodo({ ...newTodo, priority: e.target.value as 'high' | 'med' | 'low' })}>
              <option value="high">High</option><option value="med">Medium</option><option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="label">Due Date</label>
            <input className="input" type="date" value={newTodo.due_date} onChange={(e) => setNewTodo({ ...newTodo, due_date: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary w-full mt-4" onClick={addTodo}>Add Task</button>
      </Modal>
    </div>
  );
}
