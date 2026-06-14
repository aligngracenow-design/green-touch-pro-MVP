import type { Project, Lead, Invoice, Notification, DashboardData, User } from './types';

export const MOCK_USER: User = {
  id: 'user-graham',
  email: 'assignedvisionary@gmail.com',
  name: 'Graham Morris',
  role: 'owner',
  company: 'Green Touch Builders',
};

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'GTB-2024-001', name: 'Woodhouse Day Spa — Leesburg', client: 'Woodhouse Day Spa',
    status: 'completed', sqft: 5500, budget: 425000, spent: 418000, start: '2024-01-15',
    completion: '2024-05-20', progress: 100, phase: 'Completed', health: 'excellent',
    address: '102 Harrison St SE, Leesburg, VA 20175', permit: 'BP-2024-0012',
    budget_pct: 98.4, remaining: 7000,
    daily_logs: [
      { id: 'l1', project_id: 'GTB-2024-001', date: '2024-05-20', text: 'Final walkthrough completed. Keys handed to client.', photos: 5, submitted_by: 'Graham', category: 'closeout' },
    ],
    documents: [], subs: [],
    invoices: [], todos: [],
  },
  {
    id: 'GTB-2024-002', name: 'Black Squirrel — Vienna', client: 'Black Squirrel Restaurant',
    status: 'active', sqft: 3460, budget: 380000, spent: 295000, start: '2024-03-01',
    completion: '2024-07-15', progress: 78, phase: 'Interior Finishes', health: 'good',
    address: '170 Maple Ave W, Vienna, VA 22180', permit: 'BP-2024-0045',
    budget_pct: 77.6, remaining: 85000,
    daily_logs: [
      { id: 'l2', project_id: 'GTB-2024-002', date: '2024-06-14', text: 'Bar countertops installed. Final plumbing connections complete.', photos: 3, submitted_by: 'Mike', category: 'construction' },
      { id: 'l3', project_id: 'GTB-2024-002', date: '2024-06-13', text: 'Kitchen hood system tested and passed inspection.', photos: 2, submitted_by: 'Mike', category: 'inspection' },
      { id: 'l4', project_id: 'GTB-2024-002', date: '2024-06-12', text: 'Flooring complete in dining area. Wall tiles grouted.', photos: 4, submitted_by: 'Jose', category: 'construction' },
    ],
    documents: [
      { id: 'd1', project_id: 'GTB-2024-002', name: 'Lease Agreement — Black Squirrel', type: 'pdf', uploaded_at: '2024-03-01', size: '1.2 MB' },
      { id: 'd2', project_id: 'GTB-2024-002', name: 'Structural Drawings Set 2', type: 'pdf', uploaded_at: '2024-03-10', size: '4.8 MB' },
    ],
    subs: [
      { id: 's1', name: 'Mega Mechanical (HVAC)', trade: 'HVAC', phone: '703-555-0188', email: 'mike@megamech.com', project_id: 'GTB-2024-002', status: 'active', rate: 52000 },
      { id: 's2', name: 'Premier Plumbing (Plumbing)', trade: 'Plumbing', phone: '703-555-0199', email: 'jose@premierplumb.com', project_id: 'GTB-2024-002', status: 'active', rate: 38000 },
      { id: 's3', name: 'Elite Electric (Electrical)', trade: 'Electrical', phone: '703-555-0177', email: 'sarah@eliteelec.com', project_id: 'GTB-2024-002', status: 'active', rate: 44000 },
    ],
    invoices: [],
    todos: [
      { id: 't1', project_id: 'GTB-2024-002', task: 'Schedule final health inspection', assignee: 'Graham', priority: 'high', status: 'open', due_date: '2024-06-25' },
      { id: 't2', project_id: 'GTB-2024-002', task: 'Order custom bar stools (lead time 3wk)', assignee: 'Mike', priority: 'med', status: 'open', due_date: '2024-06-30' },
    ],
  },
  {
    id: 'GTB-2024-003', name: 'Pure Sweat Float — Georgetown', client: 'Pure Sweat LLC',
    status: 'active', sqft: 2000, budget: 210000, spent: 145000, start: '2024-04-01',
    completion: '2024-08-01', progress: 65, phase: 'MEP Rough-In', health: 'good',
    address: '3333 M St NW, Washington, DC 20007', permit: 'BP-2024-0078',
    budget_pct: 69.0, remaining: 65000,
    daily_logs: [
      { id: 'l5', project_id: 'GTB-2024-003', date: '2024-06-14', text: 'HVAC ductwork complete. Electrical rough-in inspected.', photos: 3, submitted_by: 'Jose', category: 'construction' },
      { id: 'l6', project_id: 'GTB-2024-003', date: '2024-06-13', text: 'Float room waterproofing tested — passed.', photos: 2, submitted_by: 'Mike', category: 'inspection' },
    ],
    documents: [
      { id: 'd3', project_id: 'GTB-2024-003', name: 'Permit Approval — Georgetown', type: 'pdf', uploaded_at: '2024-04-01', size: '0.9 MB' },
    ],
    subs: [
      { id: 's4', name: 'Mega Mechanical (HVAC)', trade: 'HVAC', phone: '703-555-0188', email: 'mike@megamech.com', project_id: 'GTB-2024-003', status: 'active', rate: 41000 },
    ],
    invoices: [],
    todos: [
      { id: 't3', project_id: 'GTB-2024-003', task: 'Confirm float tank delivery date', assignee: 'Jose', priority: 'med', status: 'open', due_date: '2024-07-01' },
    ],
  },
  {
    id: 'GTB-2024-004', name: 'Alloy Personal Training — Alexandria', client: 'Alloy Franchise Group',
    status: 'active', sqft: 2495, budget: 195000, spent: 82000, start: '2024-05-15',
    completion: '2024-09-01', progress: 42, phase: 'Demo & Framing', health: 'warning',
    address: '701 N Washington St, Alexandria, VA 22314', permit: 'BP-2024-0101',
    budget_pct: 42.1, remaining: 113000,
    daily_logs: [
      { id: 'l7', project_id: 'GTB-2024-004', date: '2024-06-14', text: 'New wall framing underway. Door openings marked.', photos: 3, submitted_by: 'Jose', category: 'construction' },
      { id: 'l8', project_id: 'GTB-2024-004', date: '2024-06-11', text: 'Demo 95% complete. Dumpster scheduled for pickup.', photos: 2, submitted_by: 'Mike', category: 'demolition' },
    ],
    documents: [
      { id: 'd4', project_id: 'GTB-2024-004', name: 'Demolition Permit (Approved)', type: 'pdf', uploaded_at: '2024-05-15', size: '0.7 MB' },
    ],
    subs: [],
    invoices: [],
    todos: [
      { id: 't4', project_id: 'GTB-2024-004', task: 'Submit revised framing plan to county', assignee: 'Graham', priority: 'high', status: 'open', due_date: '2024-06-20' },
    ],
  },
  {
    id: 'GTB-2024-005', name: 'Serotonin Anti-Aging — Sterling', client: 'Serotonin Med Spa',
    status: 'planning', sqft: 4500, budget: 350000, spent: 15000, start: '2024-07-01',
    completion: '2024-11-15', progress: 5, phase: 'Preconstruction', health: 'good',
    address: '46900 Cedar Lakes Plaza, Sterling, VA 20164', permit: 'Pending',
    budget_pct: 4.3, remaining: 335000,
    daily_logs: [
      { id: 'l9', project_id: 'GTB-2024-005', date: '2024-06-10', text: 'Preconstruction walkthrough completed. Scope drafted.', photos: 1, submitted_by: 'Graham', category: 'planning' },
    ],
    documents: [], subs: [], invoices: [],
    todos: [
      { id: 't5', project_id: 'GTB-2024-005', task: 'Finalize preconstruction budget', assignee: 'Graham', priority: 'high', status: 'open', due_date: '2024-06-22' },
    ],
  },
];

export const MOCK_INVOICES: Invoice[] = [
  { id: 'INV-2024-001', project_id: 'GTB-2024-001', amount: 425000, status: 'paid', due_date: '2024-06-01', paid_date: '2024-05-28', created_at: '2024-05-21', client_name: 'Woodhouse Day Spa', client_email: 'billing@woodhouse.com', description: 'Final payment — Woodhouse Day Spa buildout' },
  { id: 'INV-2024-002', project_id: 'GTB-2024-002', amount: 150000, status: 'sent', due_date: '2024-06-20', paid_date: null, created_at: '2024-06-01', client_name: 'Black Squirrel', client_email: 'accounts@blacksquirrel.com', description: 'Progress billing — Interior finishes milestone' },
  { id: 'INV-2024-003', project_id: 'GTB-2024-003', amount: 85000, status: 'sent', due_date: '2024-06-25', paid_date: null, created_at: '2024-06-05', client_name: 'Pure Sweat LLC', client_email: 'finance@puresweat.com', description: 'MEP rough-in completion payment' },
  { id: 'INV-2024-004', project_id: 'GTB-2024-004', amount: 65000, status: 'draft', due_date: '2024-07-05', paid_date: null, created_at: '2024-06-12', client_name: 'Alloy Franchise Group', client_email: 'ap@alloyfitness.com', description: 'Demo & framing milestone' },
  { id: 'INV-2024-005', project_id: 'GTB-2024-005', amount: 35000, status: 'draft', due_date: '2024-07-15', paid_date: null, created_at: '2024-06-14', client_name: 'Serotonin Med Spa', client_email: 'billing@serotoninmed.com', description: 'Preconstruction consulting retainer' },
];

export const MOCK_LEADS: Lead[] = [
  { id: 'LD-001', name: 'Michael Miller', company: 'Cyxtera Technologies', phone: '(703) 555-0142', email: 'mmiller@cyxtera.com', project_desc: 'Data center office renovation — 8,000 sq ft', sqft: 8000, status: 'hot', date: '2024-06-08', notes: 'Existing client. Needs quick turnaround on RFP.', source: 'referral' },
  { id: 'LD-002', name: 'Sarah Chen', company: 'Bloom Yoga Studio', phone: '(571) 555-0189', email: 'sarah@bloomyoga.com', project_desc: 'New yoga studio buildout — Reston', sqft: 3200, status: 'warm', date: '2024-06-07', notes: 'Looking at 3 spaces. Needs budget range by Friday.', source: 'website' },
  { id: 'LD-003', name: 'James Wilson', company: 'Wilson Dental Group', phone: '(202) 555-0223', email: 'jwilson@wilsondental.com', project_desc: 'Dental office expansion — 1,500 sq ft', sqft: 1500, status: 'new', date: '2024-06-10', notes: 'Referred by M&T Bank. Call ASAP for site visit.', source: 'referral' },
  { id: 'LD-004', name: 'Lisa Park', company: 'CorePower Yoga', phone: '(703) 555-0345', email: 'lisa@corepower.com', project_desc: 'New studio — 3,500 sq ft, Tysons Corner', sqft: 3500, status: 'warm', date: '2024-06-12', notes: 'National account. Submit as preferred vendor.', source: 'rfi' },
  { id: 'LD-005', name: 'Tom Richards', company: 'Bold Fork Restaurant', phone: '(202) 555-0456', email: 'tom@boldfork.com', project_desc: 'Full restaurant buildout — 2,800 sq ft', sqft: 2800, status: 'new', date: '2024-06-14', notes: 'Smith Group referred. Fire suppression needed.', source: 'referral' },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', project_id: 'GTB-2024-002', channel: 'telegram', message: '📄 Invoice INV-2024-002 for $150,000 sent to accounts@blacksquirrel.com', sent_at: '2024-06-14 09:12', status: 'sent' },
  { id: 'n2', project_id: 'ALL', channel: 'email', message: '🆕 New lead: Tom Richards from Bold Fork Restaurant', sent_at: '2024-06-14 08:40', status: 'sent' },
  { id: 'n3', project_id: 'GTB-2024-004', channel: 'slack', message: '⚠️ Alloy Personal Training flagged for schedule review', sent_at: '2024-06-13 16:22', status: 'sent' },
];

export function buildMockDashboard(): DashboardData {
  const projects = MOCK_PROJECTS;
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0);
  const health: Record<string, { score: number; budget_pct: number }> = {};
  for (const p of projects) {
    const b = p.budget > 0 ? (1 - p.spent / p.budget) * 40 : 40;
    const score = Math.round(Math.min(b + (p.progress / 100) * 30 + 30, 100));
    health[p.id] = { score, budget_pct: p.budget ? +(p.spent / p.budget * 100).toFixed(1) : 0 };
  }
  return {
    projects: {
      total: projects.length,
      active: projects.filter((p) => p.status === 'active').length,
      completed: projects.filter((p) => p.status === 'completed').length,
      planning: projects.filter((p) => p.status === 'planning').length,
    },
    financial: {
      total_budget: totalBudget,
      total_spent: totalSpent,
      paid: MOCK_INVOICES.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
      pending: MOCK_INVOICES.filter((i) => i.status === 'sent').reduce((s, i) => s + i.amount, 0),
      budget_util: +(totalSpent / totalBudget * 100).toFixed(1),
    },
    leads: {
      total: MOCK_LEADS.length,
      hot: MOCK_LEADS.filter((l) => l.status === 'hot').length,
      warm: MOCK_LEADS.filter((l) => l.status === 'warm').length,
      new: MOCK_LEADS.filter((l) => l.status === 'new').length,
    },
    health_scores: health,
    stats: { notifications: MOCK_NOTIFICATIONS.length, ai_chats: 0, invoices: MOCK_INVOICES.length },
  };
}

export function mockAiRespond(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('budget') || q.includes('cost') || q.includes('over'))
    return 'Budget utilization is tracking within plan across all active projects. You have healthy margin overall — watch Alloy Personal Training, which is flagged for schedule review. Total remaining budget across active jobs is $263,000.';
  if (q.includes('risk') || q.includes('concern') || q.includes('delay'))
    return 'Top risks: (1) Alloy Personal Training framing approval is pending with the county — submit revised plans before 6/20 to avoid a 2-week slip. (2) Long-lead items (custom bar stools, float tanks) should be ordered now. (3) Keep an eye on inspection scheduling for Black Squirrel.';
  if (q.includes('schedule') || q.includes('timeline') || q.includes('when'))
    return 'Black Squirrel is on track for 7/15 completion. Pure Sweat targets 8/1. Alloy is the at-risk project — current trajectory pushes completion if framing approval slips.';
  if (q.includes('lead') || q.includes('sales') || q.includes('pipeline'))
    return 'You have 1 hot lead (Cyxtera — data center reno, 8,000 sqft), 2 warm (Bloom Yoga, CorePower Yoga) and 2 new. Priority follow-up: Cyxtera RFP and Wilson Dental site visit (referred by M&T Bank).';
  return 'Summary: 3 active projects, 1 completed, 1 in preconstruction. $1.56M total budget under management. Ask me about budget, risks, schedule, or your sales pipeline for specifics.';
}
