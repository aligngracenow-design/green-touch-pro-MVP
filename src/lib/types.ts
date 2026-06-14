export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'viewer';
  company?: string;
}

export interface DailyLog {
  id: string;
  project_id: string;
  date: string;
  text: string;
  photos: number;
  submitted_by: string;
  category: string;
}

export interface Document {
  id: string;
  project_id: string;
  name: string;
  type: string;
  uploaded_at: string;
  size: string;
}

export interface Sub {
  id: string;
  name: string;
  trade: string;
  phone: string;
  email: string;
  project_id: string;
  status: string;
  rate: number;
}

export interface Todo {
  id: string;
  project_id: string;
  task: string;
  assignee: string;
  priority: 'high' | 'med' | 'low';
  status: 'open' | 'done';
  due_date: string;
}

export interface Invoice {
  id: string;
  project_id: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid';
  due_date: string;
  paid_date: string | null;
  created_at: string;
  client_name: string;
  client_email: string;
  description: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  status: 'active' | 'completed' | 'planning';
  sqft: number;
  budget: number;
  spent: number;
  start: string;
  completion: string;
  progress: number;
  phase: string;
  health: 'excellent' | 'good' | 'warning' | 'critical';
  address: string;
  permit: string;
  budget_pct: number;
  remaining: number;
  daily_logs: DailyLog[];
  documents: Document[];
  subs: Sub[];
  invoices: Invoice[];
  todos: Todo[];
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  project_desc: string;
  sqft: number;
  status: 'hot' | 'warm' | 'new' | 'won' | 'lost';
  date: string;
  notes: string;
  source: string;
}

export interface Notification {
  id: string;
  project_id: string;
  channel: string;
  message: string;
  sent_at: string;
  status: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  question: string;
  answer: string;
  created_at: string;
}

export interface DashboardData {
  projects: { total: number; active: number; completed: number; planning: number };
  financial: { total_budget: number; total_spent: number; paid: number; pending: number; budget_util: number };
  leads: { total: number; hot: number; warm: number; new: number };
  health_scores: Record<string, { score: number; budget_pct: number }>;
  stats: { notifications: number; ai_chats: number; invoices: number };
}
