import type { Project, Lead, Invoice, Notification, DashboardData, User, ChatMessage, Todo } from './types';
import {
  MOCK_USER, MOCK_PROJECTS, MOCK_INVOICES, MOCK_LEADS, MOCK_NOTIFICATIONS,
  buildMockDashboard, mockAiRespond,
} from './mockData';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'gtp_token';

// When true, the app runs entirely on seeded mock data (no backend needed).
// Auto-enabled when no backend is reachable (e.g. Lovable preview).
let MOCK_MODE = false;

export function isMockMode() {
  return MOCK_MODE;
}
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// Probe backend once; fall back to mock mode if unreachable.
export async function detectBackend(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    MOCK_MODE = !res.ok;
  } catch {
    MOCK_MODE = true;
  }
  return !MOCK_MODE;
}

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export const api = {
  // ─── Auth ───
  async login(email: string, password: string): Promise<{ user: User }> {
    if (MOCK_MODE) {
      await delay();
      if (email.trim().toLowerCase() === MOCK_USER.email && password === 'demo123') {
        setToken('mock-token');
        return { user: MOCK_USER };
      }
      throw new Error('Invalid email or password');
    }
    const data = await request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return { user: data.user };
  },

  async me(): Promise<{ user: User }> {
    if (MOCK_MODE) {
      await delay(100);
      return { user: MOCK_USER };
    }
    return request<{ user: User }>('/auth/me');
  },

  // ─── Dashboard ───
  async dashboard(): Promise<DashboardData> {
    if (MOCK_MODE) {
      await delay();
      return buildMockDashboard();
    }
    return request<DashboardData>('/dashboard');
  },

  // ─── Projects ───
  async projects(): Promise<Project[]> {
    if (MOCK_MODE) {
      await delay();
      return MOCK_PROJECTS;
    }
    return request<Project[]>('/projects');
  },

  async project(id: string): Promise<Project> {
    if (MOCK_MODE) {
      await delay();
      const p = MOCK_PROJECTS.find((x) => x.id === id);
      if (!p) throw new Error('not found');
      return p;
    }
    return request<Project>(`/projects/${id}`);
  },

  async addTodo(projectId: string, body: Partial<Todo>): Promise<Todo> {
    if (MOCK_MODE) {
      await delay(150);
      const todo: Todo = {
        id: 'TODO-' + Math.random().toString(36).slice(2, 8),
        project_id: projectId, task: body.task || '', assignee: body.assignee || '',
        priority: (body.priority as Todo['priority']) || 'med', status: 'open', due_date: body.due_date || '',
      };
      const p = MOCK_PROJECTS.find((x) => x.id === projectId);
      p?.todos.push(todo);
      return todo;
    }
    return request<Todo>(`/projects/${projectId}/todos`, { method: 'POST', body: JSON.stringify(body) });
  },

  async toggleTodo(id: string): Promise<{ id: string; status: string }> {
    if (MOCK_MODE) {
      await delay(100);
      for (const p of MOCK_PROJECTS) {
        const t = p.todos.find((x) => x.id === id);
        if (t) {
          t.status = t.status === 'open' ? 'done' : 'open';
          return { id, status: t.status };
        }
      }
      return { id, status: 'open' };
    }
    return request(`/todos/${id}/toggle`, { method: 'POST' });
  },

  async deleteTodo(id: string): Promise<void> {
    if (MOCK_MODE) {
      await delay(100);
      for (const p of MOCK_PROJECTS) {
        const i = p.todos.findIndex((x) => x.id === id);
        if (i >= 0) p.todos.splice(i, 1);
      }
      return;
    }
    await request(`/todos/${id}`, { method: 'DELETE' });
  },

  async addLog(projectId: string, text: string): Promise<void> {
    if (MOCK_MODE) {
      await delay(150);
      const p = MOCK_PROJECTS.find((x) => x.id === projectId);
      p?.daily_logs.unshift({
        id: 'l' + Math.random().toString(36).slice(2, 6),
        project_id: projectId, date: new Date().toISOString().slice(0, 10),
        text, photos: 0, submitted_by: MOCK_USER.name, category: 'general',
      });
      return;
    }
    await request(`/projects/${projectId}/logs`, { method: 'POST', body: JSON.stringify({ text }) });
  },

  // ─── Leads ───
  async leads(): Promise<Lead[]> {
    if (MOCK_MODE) {
      await delay();
      return MOCK_LEADS;
    }
    return request<Lead[]>('/leads');
  },

  async updateLead(id: string, field: string, value: string): Promise<void> {
    if (MOCK_MODE) {
      await delay(120);
      const l = MOCK_LEADS.find((x) => x.id === id) as Record<string, unknown> | undefined;
      if (l) l[field] = value;
      return;
    }
    await request(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
  },

  // ─── Invoices ───
  async invoices(): Promise<Invoice[]> {
    if (MOCK_MODE) {
      await delay();
      return MOCK_INVOICES;
    }
    return request<Invoice[]>('/invoices');
  },

  async sendInvoice(id: string): Promise<void> {
    if (MOCK_MODE) {
      await delay(150);
      const inv = MOCK_INVOICES.find((x) => x.id === id);
      if (inv && inv.status === 'draft') inv.status = 'sent';
      return;
    }
    await request(`/invoices/${id}/send`, { method: 'POST' });
  },

  async payInvoice(id: string): Promise<void> {
    if (MOCK_MODE) {
      await delay(150);
      const inv = MOCK_INVOICES.find((x) => x.id === id);
      if (inv) { inv.status = 'paid'; inv.paid_date = new Date().toISOString().slice(0, 10); }
      return;
    }
    await request(`/invoices/${id}/pay`, { method: 'POST' });
  },

  // ─── AI ───
  async askAi(question: string, projectId?: string, history?: { role: string; content: string }[]): Promise<{ answer: string; provider?: string }> {
    if (MOCK_MODE) {
      await delay(600);
      return { answer: mockAiRespond(question), provider: 'Green Touch AI (demo)' };
    }
    return request<{ answer: string; provider?: string }>('/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, project_id: projectId, history }),
    });
  },

  async aiHistory(): Promise<ChatMessage[]> {
    if (MOCK_MODE) { await delay(100); return []; }
    return request<ChatMessage[]>('/ai/history');
  },

  // ─── Comms ───
  async notify(message: string, channels: string[], projectId?: string): Promise<void> {
    if (MOCK_MODE) {
      await delay(200);
      channels.forEach((ch) =>
        MOCK_NOTIFICATIONS.unshift({
          id: 'n' + Math.random().toString(36).slice(2, 6),
          project_id: projectId || 'ALL', channel: ch, message,
          sent_at: new Date().toISOString().slice(0, 16).replace('T', ' '), status: 'sent',
        }),
      );
      return;
    }
    await request('/notify', { method: 'POST', body: JSON.stringify({ message, channels, project_id: projectId }) });
  },

  async notifications(): Promise<Notification[]> {
    if (MOCK_MODE) { await delay(100); return MOCK_NOTIFICATIONS; }
    return request<Notification[]>('/notifications');
  },

  // ─── Settings ───
  async users(): Promise<User[]> {
    if (MOCK_MODE) {
      await delay(100);
      return [MOCK_USER, { id: 'user-demo', email: 'demo@greentouch.pro', name: 'Demo Viewer', role: 'viewer', company: 'Green Touch Pro Guest' }];
    }
    return request<User[]>('/users');
  },

  async stats(): Promise<Record<string, number>> {
    if (MOCK_MODE) {
      await delay(100);
      return { projects: 5, leads: 5, invoices: 5, daily_logs: 9, documents: 4, notifications: 3, ai_chat: 0, transactions: 1, subs: 9, todos: 5, users: 2 };
    }
    return request<Record<string, number>>('/stats');
  },
};
