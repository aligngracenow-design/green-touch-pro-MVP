import type { ResourceConfig } from '../components/ResourcePage';
import {
  FileQuestion, FileCheck2, AlertTriangle, Truck, Contact, ShieldAlert,
  Megaphone, FileStack, ClipboardList, HardHat,
  DollarSign, ClipboardCheck, ListTodo, Shield, Bell, Clock, Calendar, MessageSquare,
} from 'lucide-react';

// ─── Declarative page definitions mirroring the bot's data domains ──
// Each maps a hermes.db table to a full CRUD + action management page.

export const RFIS: ResourceConfig = {
  table: 'rfis', title: 'RFIs', subtitle: 'Requests for information — ask, track, and close',
  icon: FileQuestion,
  fields: [
    { key: 'title', label: 'Title', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'description', label: 'Question', type: 'textarea', hideInTable: true },
    { key: 'assigned_to', label: 'Assigned To' },
    { key: 'due_date', label: 'Due', type: 'date' },
    { key: 'status', label: 'Status' },
  ],
  actions: [{ label: 'Close', status: 'closed', color: 'text-green', when: (r) => r.status !== 'closed' }],
};

export const SUBMITTALS: ResourceConfig = {
  table: 'submittals', title: 'Submittals', subtitle: 'Material & product submittals for review',
  icon: FileCheck2,
  fields: [
    { key: 'description', label: 'Description', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'type', label: 'Type' },
    { key: 'submitted_date', label: 'Submitted', type: 'date' },
    { key: 'due_date', label: 'Due', type: 'date' },
    { key: 'status', label: 'Status' },
    { key: 'reviewed_by', label: 'Reviewed By', hideInTable: true },
    { key: 'rejection_reason', label: 'Rejection Reason', type: 'textarea', hideInTable: true },
  ],
  actions: [
    { label: 'Approve', status: 'approved', color: 'text-green', when: (r) => r.status !== 'approved' },
    { label: 'Reject', status: 'rejected', color: 'text-red', when: (r) => r.status !== 'rejected' },
  ],
};

export const BLOCKERS: ResourceConfig = {
  table: 'blockers', title: 'Blockers', subtitle: 'What is stopping work — resolve fast',
  icon: AlertTriangle,
  fields: [
    { key: 'description', label: 'Blocker', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'blocks_what', label: 'Blocks What' },
    { key: 'status', label: 'Status' },
    { key: 'resolved_by', label: 'Resolved By', hideInTable: true },
  ],
  actions: [{ label: 'Resolve', status: 'resolved', color: 'text-green', when: (r) => r.status !== 'resolved' }],
};

export const DELIVERIES: ResourceConfig = {
  table: 'deliveries', title: 'Deliveries', subtitle: 'Scheduled material deliveries',
  icon: Truck,
  fields: [
    { key: 'material', label: 'Material', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'supplier', label: 'Supplier' },
    { key: 'scheduled_date', label: 'Date', type: 'date' },
    { key: 'scheduled_time', label: 'Time' },
    { key: 'status', label: 'Status' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInTable: true },
  ],
  actions: [{ label: 'Received', status: 'received', color: 'text-green', when: (r) => r.status !== 'received' }],
};

export const CONTACTS: ResourceConfig = {
  table: 'contacts', title: 'Contacts', subtitle: 'People & companies across your projects',
  icon: Contact,
  fields: [
    { key: 'name', label: 'Name', required: true },
    { key: 'company', label: 'Company' },
    { key: 'role', label: 'Role' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
  ],
};

export const INCIDENTS: ResourceConfig = {
  table: 'safety_incidents', title: 'Safety Incidents', subtitle: 'Log & track safety incidents',
  icon: ShieldAlert,
  fields: [
    { key: 'description', label: 'Description', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'severity', label: 'Severity', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
    { key: 'reported_by', label: 'Reported By' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInTable: true },
  ],
  badge: (r) => r.severity ? {
    text: r.severity,
    cls: r.severity === 'critical' || r.severity === 'high' ? 'bg-red/15 text-red' : r.severity === 'medium' ? 'bg-amber/15 text-amber' : 'bg-blue/15 text-blue',
  } : null,
};

export const TOOLBOX: ResourceConfig = {
  table: 'toolbox_talks', title: 'Toolbox Talks', subtitle: 'Daily safety briefings & attendance',
  icon: Megaphone,
  fields: [
    { key: 'topic', label: 'Topic', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'presenter', label: 'Presenter' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'talk_date', label: 'Date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInTable: true },
  ],
};

export const PLANREVS: ResourceConfig = {
  table: 'plan_revisions', title: 'Plan Revisions', subtitle: 'Drawing revisions & issue tracking',
  icon: FileStack,
  fields: [
    { key: 'description', label: 'Description', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'revision_number', label: 'Rev #' },
    { key: 'issued_date', label: 'Issued', type: 'date' },
    { key: 'received_date', label: 'Received', type: 'date' },
    { key: 'status', label: 'Status' },
  ],
};

export const DAILYREPORTS: ResourceConfig = {
  table: 'daily_reports', title: 'Daily Reports', subtitle: 'Field reports & progress logs',
  icon: ClipboardList,
  fields: [
    { key: 'project', label: 'Project', required: true },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'reported_by', label: 'Reported By' },
    { key: 'workers', label: 'Workers' },
    { key: 'progress', label: 'Progress', type: 'textarea', hideInTable: true },
    { key: 'issues', label: 'Issues', type: 'textarea', hideInTable: true },
    { key: 'safety_notes', label: 'Safety Notes', type: 'textarea', hideInTable: true },
  ],
};

export const SUBS: ResourceConfig = {
  table: 'subs', title: 'Subcontractors', subtitle: 'Your vetted subcontractor directory',
  icon: HardHat,
  fields: [
    { key: 'name', label: 'Name', required: true },
    { key: 'trade', label: 'Trade' },
    { key: 'company', label: 'Company', hideInTable: true },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email', hideInTable: true },
    { key: 'license_number', label: 'License #' },
    { key: 'license_status', label: 'License Status' },
    { key: 'vet_color', label: 'Rating' },
  ],
  badge: (r) => r.vet_color ? {
    text: r.vet_color === 'green' ? '✓ Vetted' : r.vet_color === 'yellow' ? 'Review' : 'Caution',
    cls: r.vet_color === 'green' ? 'bg-green/15 text-green' : r.vet_color === 'yellow' ? 'bg-amber/15 text-amber' : 'bg-red/15 text-red',
  } : null,
};

// ─── Missing parity pages (backend supports, frontend was missing) ───

export const CHANGE_ORDERS: ResourceConfig = {
  table: 'change_orders', title: 'Change Orders', subtitle: 'Approve, reject & track cost impact',
  icon: DollarSign,
  fields: [
    { key: 'description', label: 'Description', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'cost', label: 'Cost ($)', type: 'number' },
    { key: 'requested_by', label: 'Requested By' },
    { key: 'status', label: 'Status' },
    { key: 'approved_by', label: 'Approved By' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInTable: true },
  ],
  actions: [
    { label: 'Approve', status: 'approved', color: 'text-green', when: (r) => r.status === 'pending' },
    { label: 'Reject', status: 'rejected', color: 'text-red', when: (r) => r.status === 'pending' },
  ],
};

export const ASSIGNMENTS: ResourceConfig = {
  table: 'assignments', title: 'Tasks', subtitle: 'Assign work, track completion & acknowledgments',
  icon: ListTodo,
  fields: [
    { key: 'task', label: 'Task', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'assignee', label: 'Assignee' },
    { key: 'due_date', label: 'Due', type: 'date' },
    { key: 'status', label: 'Status' },
    { key: 'assigned_by', label: 'Assigned By' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInTable: true },
  ],
  actions: [
    { label: 'Complete', status: 'completed', color: 'text-green', when: (r) => r.status !== 'completed' },
  ],
};

export const PUNCHLIST: ResourceConfig = {
  table: 'punchlist', title: 'Punch List', subtitle: 'Site walk items — log, assign, close',
  icon: ClipboardCheck,
  fields: [
    { key: 'item', label: 'Item', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'location', label: 'Location' },
    { key: 'assignee', label: 'Assignee' },
    { key: 'priority', label: 'Priority', type: 'select', options: ['high','medium','low'] },
    { key: 'status', label: 'Status' },
  ],
  actions: [
    { label: 'Done', status: 'done', color: 'text-green', when: (r) => r.status !== 'done' },
  ],
};

export const LIENS: ResourceConfig = {
  table: 'lien_releases', title: 'Lien Releases', subtitle: 'Track & sign lien waivers',
  icon: Shield,
  fields: [
    { key: 'sub_name', label: 'Subcontractor', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'amount', label: 'Amount ($)', type: 'number' },
    { key: 'draw', label: 'Draw #' },
    { key: 'status', label: 'Status' },
    { key: 'signed_date', label: 'Signed', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInTable: true },
  ],
  actions: [
    { label: 'Sign', status: 'signed', color: 'text-green', when: (r) => r.status !== 'signed' },
  ],
};

export const REMINDERS: ResourceConfig = {
  table: 'reminders', title: 'Reminders', subtitle: 'Scheduled nudges for yourself & crew',
  icon: Bell,
  fields: [
    { key: 'message', label: 'Message', required: true },
    { key: 'project', label: 'Project' },
    { key: 'remind_at', label: 'Remind At', required: true },
    { key: 'status', label: 'Status' },
  ],
};

export const TIME_ENTRIES: ResourceConfig = {
  table: 'time_entries', title: 'Time Clock', subtitle: 'Clock in/out, hours, on-site roster',
  icon: Clock,
  fields: [
    { key: 'worker_name', label: 'Worker', required: true },
    { key: 'trade', label: 'Trade' },
    { key: 'project', label: 'Project' },
    { key: 'clock_in', label: 'Clock In' },
    { key: 'clock_out', label: 'Clock Out' },
    { key: 'hours', label: 'Hours', type: 'number' },
  ],
};

export const MEETINGS: ResourceConfig = {
  table: 'meetings', title: 'Meetings', subtitle: 'Meeting minutes, attendees & action items',
  icon: Calendar,
  fields: [
    { key: 'topic', label: 'Topic', required: true },
    { key: 'project', label: 'Project', required: true },
    { key: 'attendees', label: 'Attendees' },
    { key: 'started_by', label: 'Started By' },
    { key: 'started_at', label: 'Started' },
    { key: 'status', label: 'Status' },
    { key: 'minutes', label: 'Minutes', type: 'textarea', hideInTable: true },
    { key: 'action_items', label: 'Action Items', type: 'textarea', hideInTable: true },
  ],
  actions: [
    { label: 'End', status: 'ended', color: 'text-amber', when: (r) => r.status !== 'ended' },
  ],
};

export const CONVERSATIONS: ResourceConfig = {
  table: 'conversations', title: 'Chat History', subtitle: 'All bot conversations — searchable log',
  icon: MessageSquare,
  fields: [
    { key: 'sender', label: 'Sender' },
    { key: 'project', label: 'Project' },
    { key: 'channel', label: 'Channel' },
    { key: 'classification', label: 'Category' },
    { key: 'raw_message', label: 'Message', type: 'textarea' },
    { key: 'created_at', label: 'When' },
  ],
};
