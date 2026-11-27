import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import * as db from './lib';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.use(cors());
app.use(express.json());

const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/health', (_q, r) => { r.json({ ok: true }); });
app.get('/api/categories', (_q, r) => { r.json(db.CATEGORIES); });
app.get('/api/transactions', (_q, r) => { r.json(db.list()); });
app.get('/api/summary', (_q, r) => { r.json(db.summary()); });
app.get('/api/vendors', (_q, r) => {
  const m = new Map<string, { name: string; count: number; total: number; pending: number; flagged: number }>();
  for (const t of db.list()) {
    const v = m.get(t.vendor) ?? { name: t.vendor, count: 0, total: 0, pending: 0, flagged: 0 };
    v.count++; v.total += t.amount; if (t.status !== 'paid') v.pending += t.amount; if (t.flags.length) v.flagged++;
    m.set(t.vendor, v);
  }
  r.json([...m.values()].sort((a, b) => b.total - a.total));
});

function valid(b: any): string | null {
  if (!b?.vendor?.trim()) return 'Vendor is required';
  if (!(Number(b.amount) > 0)) return 'Amount must be greater than 0';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '')) return 'Date must be YYYY-MM-DD';
  return null;
}
const clean = (b: any): db.TxnInput => ({
  vendor: String(b.vendor).trim(), invoiceNo: String(b.invoiceNo ?? '').trim(), date: b.date, dueDate: b.dueDate || b.date,
  amount: Number(b.amount), currency: b.currency || 'INR', category: b.category || db.categorize(b.vendor),
  type: b.type === 'income' ? 'income' : 'expense', status: ['paid', 'pending'].includes(b.status) ? b.status : 'pending', notes: String(b.notes ?? ''),
});
app.post('/api/transactions', (req, res) => { const e = valid(req.body); if (e) return void res.status(400).json({ error: e }); res.status(201).json(db.create(clean(req.body))); });
app.put('/api/transactions/:id', (req, res) => {
  const e = valid(req.body); if (e) return void res.status(400).json({ error: e });
  const t = db.update(req.params.id, clean(req.body)); t ? res.json(t) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/transactions/:id', (req, res) => { db.remove(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'Not found' }); });
app.post('/api/seed', (_q, r) => { db.seed(); r.json({ ok: true }); });

// Text layer of a PDF via pdf.js (scanned PDFs have none; those need an image upload for OCR).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
async function readPdf(buf: Buffer): Promise<string> {
   const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const { items } = await (await doc.getPage(i)).getTextContent();
    let y: number | undefined;
    for (const it of items as { str: string; transform: number[] }[]) {
      if (y !== undefined && Math.abs(it.transform[5] - y) > 2) out += '\n'; else if (out && !out.endsWith('\n')) out += ' ';
      out += it.str; y = it.transform[5];
    }
    out += '\n';
  }
  return out;
}

// Upload an invoice/receipt: PDF (text layer) or image (OCR). Returns fields to review; nothing is saved yet.
app.post('/api/extract', upload.single('file'), wrap(async (req, res) => {
  const f = req.file; if (!f) return void res.status(400).json({ error: 'Attach a file in the "file" field' });
  let text = '';
  if (f.mimetype === 'application/pdf') {
    try { text = await readPdf(f.buffer); } catch { return void res.status(422).json({ error: 'This PDF could not be read. Upload a screenshot or photo of it instead, or enter the details by hand.' }); }
  }
  else if (f.mimetype.startsWith('image/')) {
    const { createWorker } = await import('tesseract.js');
    const w = await createWorker('eng'); text = (await w.recognize(f.buffer)).data.text; await w.terminate();
  } else return void res.status(415).json({ error: 'Upload a PDF, PNG or JPG' });
  if (!text.trim()) return void res.status(422).json({ error: 'No text found. Scanned PDFs are not supported yet; upload an image instead.' });
  res.json({ fields: db.parseInvoice(text), rawText: text });
}));

app.post('/api/assistant', wrap(async (req, res) => {
  const q = String(req.body?.question ?? '').trim(); if (!q) return void res.status(400).json({ error: 'Ask a question' });
  res.json({ answer: await db.ask(q) });
}));

const dist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (_q, r) => { r.sendFile(path.join(dist, 'index.html')); }); }

app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { console.error(err); res.status(500).json({ error: err.message }); });
const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`BillMind API on http://localhost:${port}`));
