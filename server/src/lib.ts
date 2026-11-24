import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type Status = 'pending' | 'paid' | 'overdue';
export interface Txn {
  id: string; vendor: string; invoiceNo: string; date: string; dueDate: string;
  amount: number; currency: string; category: string; type: 'expense' | 'income';
  status: Status; notes: string; flags: string[]; createdAt: string;
}
export type TxnInput = Omit<Txn, 'id' | 'flags' | 'createdAt'>;

export const CATEGORIES = ['Software & Cloud', 'Office & Supplies', 'Travel', 'Food & Meals', 'Utilities', 'Marketing', 'Professional Services', 'Inventory', 'Other'];
const RULES: [RegExp, string][] = [
  [/aws|azure|google cloud|github|vercel|figma|notion|saas|software|hosting|domain/i, 'Software & Cloud'],
  [/stationery|office|paper|printer|furniture/i, 'Office & Supplies'],
  [/uber|ola|flight|airlines|hotel|irctc|travel|fuel|petrol/i, 'Travel'],
  [/restaurant|cafe|swiggy|zomato|food|meal|coffee/i, 'Food & Meals'],
  [/electric|bescom|internet|broadband|airtel|jio|water|utility/i, 'Utilities'],
  [/ads|marketing|campaign|promotion|seo/i, 'Marketing'],
  [/consult|legal|audit|accounting|design services|freelance/i, 'Professional Services'],
  [/wholesale|stock|inventory|supplier|goods/i, 'Inventory'],
];
export const categorize = (s: string) => RULES.find(([re]) => re.test(s))?.[1] ?? 'Other';

// ---------- storage (JSON file; swap for a real DB later) ----------
const FILE = path.join(process.cwd(), 'data', 'db.json');
let txns: Txn[] = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : [];
const save = () => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(txns, null, 2)); };
const today = () => new Date().toISOString().slice(0, 10);
const view = (t: Txn): Txn => ({ ...t, status: t.status === 'pending' && t.dueDate && t.dueDate < today() ? 'overdue' : t.status });

// ---------- rule-based checks: items for review, never "fraud" ----------
export function check(t: TxnInput & { id?: string }, all: Txn[]): string[] {
  const f: string[] = [];
  const same = all.filter(o => o.id !== t.id && o.vendor.toLowerCase() === t.vendor.toLowerCase());
  if (same.some(o => (t.invoiceNo && o.invoiceNo === t.invoiceNo) || (o.amount === t.amount && o.date === t.date)))
    f.push('Possible duplicate: same vendor with a matching invoice number, or the same amount and date');
  if (t.dueDate && t.date && t.dueDate < t.date) f.push('Due date is earlier than the invoice date');
  if (t.date > today()) f.push('Invoice date is in the future');
  if (same.length >= 2) {
    const avg = same.reduce((s, o) => s + o.amount, 0) / same.length;
    if (t.amount > 3 * avg) f.push(`Amount is over 3x this vendor's usual ${avg.toFixed(0)}`);
  }
  return f;
}
const recheck = () => { txns = txns.map(t => ({ ...t, flags: check(t, txns) })); };

export const list = () => txns.map(view).sort((a, b) => b.date.localeCompare(a.date));
export function create(i: TxnInput): Txn {
  const t: Txn = { ...i, id: crypto.randomUUID(), flags: [], createdAt: new Date().toISOString() };
  txns.push(t); recheck(); save(); return view(txns.find(x => x.id === t.id)!);
}
export function update(id: string, i: Partial<TxnInput>): Txn | null {
  const idx = txns.findIndex(t => t.id === id); if (idx < 0) return null;
  txns[idx] = { ...txns[idx], ...i }; recheck(); save(); return view(txns[idx]);
}
export function remove(id: string) { const n = txns.length; txns = txns.filter(t => t.id !== id); recheck(); save(); return txns.length < n; }

export function seed() {
  const d = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const rows: [string, string, number, number, number, Status, 'expense' | 'income'][] = [
    ['AWS', 'AWS-1001', 4200, 70, 55, 'paid', 'expense'], ['AWS', 'AWS-1002', 4500, 40, 25, 'paid', 'expense'],
    ['AWS', 'AWS-1003', 19800, 8, -7, 'pending', 'expense'], ['Airtel Broadband', 'AB-778', 1180, 35, 20, 'paid', 'expense'],
    ['Swiggy', 'SW-5521', 640, 12, 12, 'paid', 'expense'], ['IndiGo Airlines', 'IG-9902', 8900, 50, 50, 'paid', 'expense'],
    ['Pixel Labs Design Services', 'PL-31', 32000, 25, 10, 'pending', 'expense'], ['Acme Corp', 'INV-204', 85000, 30, 15, 'paid', 'income'],
    ['Acme Corp', 'INV-219', 60000, 5, -10, 'pending', 'income'], ['Office Depot Stationery', 'OD-88', 2150, 3, -12, 'pending', 'expense'],
    ['Swiggy', 'SW-5521', 640, 12, 12, 'paid', 'expense'],
  ];
  for (const [vendor, invoiceNo, amount, ago, due, status, type] of rows)
    create({ vendor, invoiceNo, amount, date: d(ago), dueDate: d(due), currency: 'INR', category: categorize(vendor), type, status, notes: '' });
}

// ---------- OCR text -> fields ----------
const iso = (s: string) => {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return s;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); if (!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // dd/mm/yyyy
};
export function parseInvoice(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const vendor = lines.find(l => /[A-Za-z]{3}/.test(l) && !/invoice|receipt|bill|tax|gst/i.test(l)) ?? '';
  const invoiceNo = text.match(/(?:invoice|inv|bill|receipt)[ \t]*(?:no\.?|number|#)?[ \t]*[:#\-]?[ \t]*((?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{2,})/i)?.[1] ?? '';
  const dates = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/g)].map(m => iso(m[1])).filter(Boolean);
  const totals = [...text.matchAll(/total[^\d\n]{0,18}([\d,]+(?:\.\d{1,2})?)/gi)].map(m => parseFloat(m[1].replace(/,/g, '')));
  const date = dates[0] ?? today();
  return {
    vendor, invoiceNo, date, dueDate: dates[1] ?? date, amount: totals.at(-1) ?? 0,
    currency: /\$|usd/i.test(text) ? 'USD' : 'INR', category: categorize(text), type: 'expense' as const,
    status: 'pending' as Status, notes: '',
  };
}

// ---------- summaries + assistant ----------
export function summary() {
  const all = list(), exp = all.filter(t => t.type === 'expense'), inc = all.filter(t => t.type === 'income');
  const group = (rows: Txn[], key: (t: Txn) => string) => Object.entries(rows.reduce<Record<string, number>>((a, t) => (a[key(t)] = (a[key(t)] ?? 0) + t.amount, a), {})).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  const sum = (r: Txn[]) => r.reduce((s, t) => s + t.amount, 0);
  return {
    income: sum(inc), expenses: sum(exp), net: sum(inc) - sum(exp),
    pending: sum(all.filter(t => t.status === 'pending')), overdueCount: all.filter(t => t.status === 'overdue').length,
    flaggedCount: all.filter(t => t.flags.length).length, count: all.length,
    byCategory: group(exp, t => t.category), byVendor: group(exp, t => t.vendor),
    byMonth: group(exp, t => t.date.slice(0, 7)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export async function ask(q: string): Promise<string> {
  const s = summary();
  if (!s.count) return 'There is no data yet. Upload an invoice or load the sample data, then ask again.';
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', max_tokens: 800,
          system: "You are BillMind's finance assistant. Answer ONLY from the JSON data provided. Be concise. Flagged items are for the user's review; never call them fraud or compliance violations. If the data cannot answer, say so.",
          messages: [{ role: 'user', content: `Data:\n${JSON.stringify({ summary: s, transactions: list().slice(0, 100) })}\n\nQuestion: ${q}` }],
        }),
      });
      const j: any = await r.json();
      const text = j.content?.find((c: any) => c.type === 'text')?.text;
      if (text) return text;
    } catch { /* fall through to rule-based answer */ }
  }
  if (/categor|spend|where/i.test(q)) return 'Spending by category: ' + s.byCategory.slice(0, 5).map(c => `${c.name} ${fmt(c.total)}`).join(', ') + '.';
  if (/vendor|supplier|who/i.test(q)) return 'Top vendors by spend: ' + s.byVendor.slice(0, 5).map(c => `${c.name} ${fmt(c.total)}`).join(', ') + '.';
  if (/pending|due|unpaid|overdue/i.test(q)) return `${fmt(s.pending)} is pending and ${s.overdueCount} invoice(s) are past their due date.`;
  if (/flag|duplicate|unusual|review/i.test(q)) return `${s.flaggedCount} transaction(s) are marked for review. Open Transactions to see why.`;
  return `You have ${s.count} records: income ${fmt(s.income)}, expenses ${fmt(s.expenses)}, net ${fmt(s.net)}. Set ANTHROPIC_API_KEY on the server for open-ended answers.`;
}
