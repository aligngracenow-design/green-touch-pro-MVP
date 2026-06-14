// AI assistant LLM integration.
// Uses an OpenAI-compatible Chat Completions endpoint when configured,
// otherwise falls back to a deterministic rule-based responder so the
// demo always works with zero setup.

const LLM_BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/$/, '');
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

// Ollama's OpenAI-compatible endpoint doesn't require a key.
const isOllama = LLM_BASE_URL.includes('11434');
export const llmEnabled = Boolean(LLM_BASE_URL && (LLM_API_KEY || isOllama));

export function llmStatus() {
  return {
    enabled: llmEnabled,
    provider: llmEnabled ? providerName() : 'rule-based',
    model: llmEnabled ? LLM_MODEL : null,
  };
}

function providerName() {
  if (LLM_BASE_URL.includes('openrouter')) return 'OpenRouter';
  if (LLM_BASE_URL.includes('groq')) return 'Groq';
  if (LLM_BASE_URL.includes('together')) return 'Together';
  if (LLM_BASE_URL.includes('11434')) return 'Ollama (local)';
  if (LLM_BASE_URL.includes('openai')) return 'OpenAI';
  return 'Custom LLM';
}

const SYSTEM_PROMPT = `You are the Green Touch Pro AI assistant — an expert construction operations advisor for Green Touch Builders, a commercial construction company in Northern Virginia & DC.

You help the owner (Graham Morris) manage projects, budgets, schedules, subcontractors, leads, and invoicing. Be concise, direct, and professional. Use specific numbers from the provided context when available. When discussing risks or recommendations, be actionable. Format with short paragraphs or tight bullet points. Never invent project data that isn't in the context — if you don't have it, say so.`;

// Build a compact context string from live DB data.
export function buildContext(db, projectId) {
  const projects = db.prepare('SELECT id,name,status,budget,spent,progress,phase,health,completion FROM projects').all();
  const leads = db.prepare("SELECT name,company,status,project_desc FROM leads").all();
  const invoices = db.prepare('SELECT id,amount,status,client_name,due_date FROM invoices').all();

  let ctx = 'CURRENT PORTFOLIO:\n';
  for (const p of projects) {
    const pct = p.budget ? Math.round((p.spent / p.budget) * 100) : 0;
    ctx += `- ${p.name} [${p.status}, health: ${p.health}] — ${p.progress}% complete, phase: ${p.phase}, budget $${p.budget.toLocaleString()} ($${p.spent.toLocaleString()} spent / ${pct}%), target completion ${p.completion}\n`;
  }
  ctx += '\nSALES PIPELINE:\n';
  for (const l of leads) ctx += `- ${l.name} (${l.company}) [${l.status}] — ${l.project_desc}\n`;
  ctx += '\nINVOICES:\n';
  for (const i of invoices) ctx += `- ${i.id}: $${i.amount.toLocaleString()} [${i.status}] — ${i.client_name}, due ${i.due_date}\n`;

  if (projectId) {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (p) {
      const logs = db.prepare('SELECT date,text FROM daily_logs WHERE project_id = ? ORDER BY date DESC LIMIT 5').all(projectId);
      const todos = db.prepare("SELECT task,priority,status FROM todos WHERE project_id = ?").all(projectId);
      ctx += `\nFOCUS PROJECT — ${p.name}:\nRecent logs:\n`;
      for (const l of logs) ctx += `  • ${l.date}: ${l.text}\n`;
      ctx += 'Open tasks:\n';
      for (const t of todos.filter((x) => x.status === 'open')) ctx += `  • [${t.priority}] ${t.task}\n`;
    }
  }
  return ctx;
}

// Call the OpenAI-compatible chat endpoint. `history` is [{role,content}, ...].
export async function llmChat(question, context, history = []) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: context },
    ...history.slice(-6),
    { role: 'user', content: question },
  ];

  const headers = { 'Content-Type': 'application/json' };
  if (LLM_API_KEY) headers.Authorization = `Bearer ${LLM_API_KEY}`;
  // OpenRouter prefers these (optional, harmless elsewhere).
  if (LLM_BASE_URL.includes('openrouter')) {
    headers['HTTP-Referer'] = 'https://greentouch.pro';
    headers['X-Title'] = 'Green Touch Pro';
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0.4, max_tokens: 600 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('Empty LLM response');
    return answer;
  } finally {
    clearTimeout(timer);
  }
}

// Deterministic fallback used when no LLM is configured (or on error).
export function ruleBasedRespond(question, project) {
  const q = (question || '').toLowerCase();
  const ctx = project
    ? `For ${project.name} (${project.phase}, ${project.progress}% complete, $${project.spent.toLocaleString()}/$${project.budget.toLocaleString()} spent): `
    : '';
  if (q.includes('budget') || q.includes('cost') || q.includes('over'))
    return `${ctx}Budget utilization is tracking within plan. ${project ? `Remaining budget is $${(project.budget - project.spent).toLocaleString()} (${Math.round(100 - (project.spent / project.budget) * 100)}% headroom).` : 'Across all active projects you have healthy margin. Watch Alloy Personal Training — it is flagged for schedule review.'}`;
  if (q.includes('risk') || q.includes('concern') || q.includes('delay'))
    return `${ctx}Top risks: (1) Alloy Personal Training framing approval is pending with the county — submit revised plans before 6/20 to avoid a 2-week slip. (2) Long-lead items (custom bar stools, float tanks) should be ordered now. (3) Keep an eye on inspection scheduling for Black Squirrel.`;
  if (q.includes('schedule') || q.includes('timeline') || q.includes('when'))
    return `${ctx}Black Squirrel is on track for 7/15 completion. Pure Sweat targets 8/1. Alloy is the at-risk project — current trajectory pushes completion if framing approval slips.`;
  if (q.includes('lead') || q.includes('sales') || q.includes('pipeline'))
    return `You have 1 hot lead (Cyxtera — data center reno, 8,000 sqft), 2 warm (Bloom Yoga, CorePower Yoga) and 2 new. Priority follow-up: Cyxtera RFP and Wilson Dental site visit (referred by M&T Bank).`;
  return `${ctx}Summary: 3 active projects, 1 completed, 1 in preconstruction. $1.56M total budget under management. Ask me about budget, risks, schedule, or your sales pipeline for specifics.`;
}
