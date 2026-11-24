# BillMind

AI-powered financial intelligence for small businesses and freelancers. Upload invoices, extract details with OCR, track vendors and payments, spot possible duplicates, and ask questions about your spending. Full requirements are in [PRD.md](PRD.md).

**Stack:** React + TypeScript (Vite) · Node + Express + TypeScript · tesseract.js · pdf.js

## Run it
Requires Node 20 or newer.
```bash
npm run setup     # installs root, server and client dependencies
npm run dev       # API on :3001, web app on http://localhost:5173
```
Open the app and choose **Load sample data** to see the dashboard filled in.

Production build: `npm start` builds the client and serves everything from http://localhost:3001.

## AI assistant
Works out of the box with simple rule-based answers. For open-ended answers set a key before starting the server:
```bash
export ANTHROPIC_API_KEY=sk-ant-...      # Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
# optional: ANTHROPIC_MODEL=claude-sonnet-5-5
```

## Structure
```
PRD.md          product requirements
server/src/     index.ts (routes, upload, OCR) · lib.ts (storage, parsing, checks, summaries, assistant)
client/src/     App.tsx (all screens) · api.ts (typed API client) · styles.css
```

## Known limits
- No login yet; data is one shared JSON file (`server/data/db.json`). Do not use with real financial data.
- Image OCR downloads English language data on first use, so it needs internet once.
- Scanned (image-only) PDFs are not read; upload a screenshot or photo instead.
