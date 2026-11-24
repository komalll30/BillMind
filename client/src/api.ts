export type Status = 'pending' | 'paid' | 'overdue';
export interface Fields {
  vendor: string; invoiceNo: string; date: string; dueDate: string; amount: number; currency: string;
  category: string; type: 'expense' | 'income'; status: Status; notes: string;
}
export interface Txn extends Fields { id: string; flags: string[]; createdAt: string }
export interface Row { name: string; total: number }
export interface Summary {
  income: number; expenses: number; net: number; pending: number; overdueCount: number; flaggedCount: number; count: number;
  byCategory: Row[]; byVendor: Row[]; byMonth: Row[];
}
export interface Vendor { name: string; count: number; total: number; pending: number; flagged: number }

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? r.statusText);
  return (r.status === 204 ? null : await r.json()) as T;
}
const body = (method: string, data: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

export const api = {
  list: () => j<Txn[]>('/api/transactions'),
  summary: () => j<Summary>('/api/summary'),
  vendors: () => j<Vendor[]>('/api/vendors'),
  categories: () => j<string[]>('/api/categories'),
  create: (f: Fields) => j<Txn>('/api/transactions', body('POST', f)),
  update: (id: string, f: Fields) => j<Txn>(`/api/transactions/${id}`, body('PUT', f)),
  remove: (id: string) => j<null>(`/api/transactions/${id}`, { method: 'DELETE' }),
  seed: () => j<{ ok: true }>('/api/seed', { method: 'POST' }),
  ask: (question: string) => j<{ answer: string }>('/api/assistant', body('POST', { question })),
  extract: (file: File) => { const fd = new FormData(); fd.append('file', file); return j<{ fields: Fields; rawText: string }>('/api/extract', { method: 'POST', body: fd }); },
};
export const money = (n: number, cur = 'INR') => new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
