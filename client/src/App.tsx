import { useEffect, useState, FormEvent } from 'react';
import { api, money, Fields, Txn, Summary, Vendor, Row } from './api';

type Tab = 'dashboard' | 'add' | 'transactions' | 'vendors' | 'assistant';
const TABS: [Tab, string][] = [['dashboard', 'Dashboard'], ['add', 'Add invoice'], ['transactions', 'Transactions'], ['vendors', 'Vendors'], ['assistant', 'Ask BillMind']];
const EMPTY: Fields = { vendor: '', invoiceNo: '', date: new Date().toISOString().slice(0, 10), dueDate: '', amount: 0, currency: 'INR', category: 'Other', type: 'expense', status: 'pending', notes: '' };

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [txns, setTxns] = useState<Txn[]>([]);
  const [sum, setSum] = useState<Summary | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [err, setErr] = useState('');

  const reload = async () => {
    try { const [t, s, v] = await Promise.all([api.list(), api.summary(), api.vendors()]); setTxns(t); setSum(s); setVendors(v); setErr(''); }
    catch (e) { setErr(`Cannot reach the server (${(e as Error).message}). Start it with "npm run dev" in /server.`); }
  };
  useEffect(() => { void reload(); api.categories().then(setCats).catch(() => undefined); }, []);

  return (
    <div className="shell">
      <nav className="side">
        <h1>BillMind</h1>
        {TABS.map(([k, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
      </nav>
      <main>
        {err && <p className="banner">{err}</p>}
        {tab === 'dashboard' && sum && <Dashboard s={sum} txns={txns} go={setTab} reload={reload} />}
        {tab === 'add' && <Add cats={cats} done={async () => { await reload(); setTab('transactions'); }} />}
        {tab === 'transactions' && <Transactions txns={txns} cats={cats} reload={reload} />}
        {tab === 'vendors' && <Vendors rows={vendors} />}
        {tab === 'assistant' && <Assistant />}
      </main>
    </div>
  );
}

function Bars({ rows, fmt }: { rows: Row[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(r => r.total));
  return <ul className="bars">{rows.map(r => <li key={r.name}><span>{r.name}</span><i style={{ width: `${(r.total / max) * 100}%` }} /><b>{(fmt ?? money)(r.total)}</b></li>)}</ul>;
}

function Dashboard({ s, txns, go, reload }: { s: Summary; txns: Txn[]; go: (t: Tab) => void; reload: () => Promise<void> }) {
  if (!s.count) return (
    <section className="empty"><h2>No invoices yet</h2><p>Upload an invoice or receipt and BillMind will read it, sort it and keep track of what you owe.</p>
      <button className="primary" onClick={() => go('add')}>Add your first invoice</button>
      <button onClick={async () => { await api.seed(); await reload(); }}>Load sample data</button></section>);
  const review = txns.filter(t => t.flags.length || t.status === 'overdue');
  return (<>
    <h2>Dashboard</h2>
    <section className="panel attention">
      <h3>Needs your review ({review.length})</h3>
      {review.length === 0 && <p className="muted">Nothing to review. Every invoice looks consistent.</p>}
      <ul>{review.map(t => <li key={t.id}><b>{t.vendor}</b> {t.invoiceNo} · {money(t.amount, t.currency)}
        {t.status === 'overdue' && <span className="tag bad">Overdue since {t.dueDate}</span>}
        {t.flags.map(f => <span key={f} className="tag warn">{f}</span>)}</li>)}</ul>
    </section>
    <div className="stats">
      <div><span>Income</span><b>{money(s.income)}</b></div><div><span>Expenses</span><b>{money(s.expenses)}</b></div>
      <div><span>Net</span><b>{money(s.net)}</b></div><div><span>Unpaid</span><b>{money(s.pending)}</b></div>
    </div>
    <div className="cols">
      <section className="panel"><h3>Spending by category</h3><Bars rows={s.byCategory} /></section>
      <section className="panel"><h3>Spending by month</h3><Bars rows={s.byMonth} /></section>
      <section className="panel"><h3>Top vendors</h3><Bars rows={s.byVendor.slice(0, 6)} /></section>
    </div>
  </>);
}

function TxnForm({ initial, cats, label, onSave, onCancel }: { initial: Fields; cats: string[]; label: string; onSave: (f: Fields) => Promise<void>; onCancel?: () => void }) {
  const [f, setF] = useState<Fields>(initial);
  const [err, setErr] = useState('');
  useEffect(() => setF(initial), [initial]);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF(p => ({ ...p, [k]: v }));
  const submit = async (e: FormEvent) => { e.preventDefault(); try { await onSave(f); setErr(''); } catch (x) { setErr((x as Error).message); } };
  return (
    <form className="form panel" onSubmit={submit}>
      <label>Vendor<input value={f.vendor} onChange={e => set('vendor', e.target.value)} required /></label>
      <label>Invoice number<input value={f.invoiceNo} onChange={e => set('invoiceNo', e.target.value)} /></label>
      <label>Invoice date<input type="date" value={f.date} onChange={e => set('date', e.target.value)} required /></label>
      <label>Due date<input type="date" value={f.dueDate} onChange={e => set('dueDate', e.target.value)} /></label>
      <label>Amount<input type="number" step="0.01" min="0" value={f.amount || ''} onChange={e => set('amount', Number(e.target.value))} required /></label>
      <label>Currency<select value={f.currency} onChange={e => set('currency', e.target.value)}><option>INR</option><option>USD</option></select></label>
      <label>Category<select value={f.category} onChange={e => set('category', e.target.value)}>{cats.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Type<select value={f.type} onChange={e => set('type', e.target.value as Fields['type'])}><option value="expense">Expense</option><option value="income">Income</option></select></label>
      <label>Payment status<select value={f.status === 'overdue' ? 'pending' : f.status} onChange={e => set('status', e.target.value as Fields['status'])}><option value="pending">Unpaid</option><option value="paid">Paid</option></select></label>
      <label className="wide">Notes<input value={f.notes} onChange={e => set('notes', e.target.value)} /></label>
      {err && <p className="error wide" role="alert">{err}</p>}
      <div className="wide row"><button className="primary">{label}</button>{onCancel && <button type="button" onClick={onCancel}>Cancel</button>}</div>
    </form>);
}

function Add({ cats, done }: { cats: string[]; done: () => Promise<void> }) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMsg('Reading the document. The first image can take about 20 seconds.');
    try { const r = await api.extract(file); setFields({ ...EMPTY, ...r.fields }); setRaw(r.rawText); setMsg('Check the details below, fix anything that looks wrong, then save.'); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (<>
    <h2>Add invoice</h2>
    <section className="panel drop">
      <label>Upload a PDF, PNG or JPG<input type="file" accept="application/pdf,image/*" disabled={busy} onChange={e => void pick(e.target.files?.[0])} /></label>
      <p className="muted" aria-live="polite">{msg || 'Or fill in the form by hand.'}</p>
    </section>
    {raw && <details className="panel"><summary>Text BillMind read</summary><pre>{raw}</pre></details>}
    <TxnForm initial={fields} cats={cats} label="Save invoice" onSave={async f => { await api.create(f); await done(); }} />
  </>);
}

function Transactions({ txns, cats, reload }: { txns: Txn[]; cats: string[]; reload: () => Promise<void> }) {
  const [q, setQ] = useState(''); const [st, setSt] = useState('all'); const [edit, setEdit] = useState<Txn | null>(null);
  const rows = txns.filter(t => (st === 'all' || (st === 'review' ? t.flags.length > 0 : t.status === st)) && `${t.vendor} ${t.invoiceNo} ${t.category}`.toLowerCase().includes(q.toLowerCase()));
  return (<>
    <h2>Transactions</h2>
    {edit && <TxnForm initial={edit} cats={cats} label="Save changes" onCancel={() => setEdit(null)} onSave={async f => { await api.update(edit.id, f); setEdit(null); await reload(); }} />}
    <div className="row"><input placeholder="Search vendor, invoice or category" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
      <select value={st} onChange={e => setSt(e.target.value)} aria-label="Filter"><option value="all">All</option><option value="pending">Unpaid</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="review">Needs review</option></select></div>
    {rows.length === 0 ? <p className="muted">No transactions match.</p> :
      <div className="scroll"><table><thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
        {rows.map(t => <tr key={t.id}><td>{t.date}</td><td>{t.vendor}<small>{t.invoiceNo}</small>{t.flags.map(f => <span key={f} className="tag warn">{f}</span>)}</td><td>{t.category}</td>
          <td className={t.type}>{t.type === 'income' ? '+' : ''}{money(t.amount, t.currency)}</td><td><span className={`tag ${t.status}`}>{t.status === 'pending' ? 'unpaid' : t.status}</span></td>
          <td className="acts">{t.status !== 'paid' && <button onClick={async () => { await api.update(t.id, { ...t, status: 'paid' }); await reload(); }}>Mark paid</button>}
            <button onClick={() => setEdit(t)}>Edit</button>
            <button onClick={async () => { if (confirm(`Delete the ${t.vendor} record?`)) { await api.remove(t.id); await reload(); } }}>Delete</button></td></tr>)}
      </tbody></table></div>}
  </>);
}

function Vendors({ rows }: { rows: Vendor[] }) {
  if (!rows.length) return <><h2>Vendors</h2><p className="muted">Vendors appear here once you add an invoice.</p></>;
  return (<><h2>Vendors</h2><div className="scroll"><table><thead><tr><th>Vendor</th><th>Records</th><th>Total</th><th>Unpaid</th><th>For review</th></tr></thead><tbody>
    {rows.map(v => <tr key={v.name}><td>{v.name}</td><td>{v.count}</td><td>{money(v.total)}</td><td>{money(v.pending)}</td><td>{v.flagged || '-'}</td></tr>)}</tbody></table></div></>);
}

function Assistant() {
  const [log, setLog] = useState<{ role: 'you' | 'bm'; text: string }[]>([]); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  const send = async (text: string) => {
    if (!text.trim() || busy) return; setLog(l => [...l, { role: 'you', text }]); setQ(''); setBusy(true);
    try { const r = await api.ask(text); setLog(l => [...l, { role: 'bm', text: r.answer }]); } catch (e) { setLog(l => [...l, { role: 'bm', text: (e as Error).message }]); } finally { setBusy(false); }
  };
  return (<>
    <h2>Ask BillMind</h2>
    <p className="muted">Answers come only from the invoices in your account.</p>
    <div className="row wrap">{['Where am I spending the most?', 'Which vendors cost the most?', 'What is unpaid or overdue?', 'What should I review?'].map(s => <button key={s} onClick={() => void send(s)}>{s}</button>)}</div>
    <div className="chat" aria-live="polite">{log.map((m, i) => <p key={i} className={m.role}>{m.text}</p>)}{busy && <p className="bm muted">Thinking</p>}</div>
    <form className="row" onSubmit={e => { e.preventDefault(); void send(q); }}><input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about your spending" aria-label="Question" /><button className="primary">Ask</button></form>
  </>);
}
