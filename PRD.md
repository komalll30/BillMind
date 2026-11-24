# BillMind: Product Requirements Document

**Version:** 1.0 (MVP) **Domain:** AI / FinTech **Author:** Komal N Gowda, REVA University (AIML B)

## 1. Overview
BillMind is a web platform where small businesses, freelancers and independent professionals upload invoices and receipts, have the details read automatically with OCR, and see their income, expenses, vendors and payment status in one place. An AI assistant answers questions about the user's own records.

## 2. Problem
Financial documents arrive through many channels and are tracked by hand in paper files and spreadsheets. As volume grows this causes data-entry errors, inconsistent categories, duplicate entries and missed payments. Users also lack a clear view of where money goes, which vendors cost the most, or whether a transaction looks unusual.

## 3. Goals and non-goals
**Goals**
- G1. Cut the manual effort of recording an invoice to a review-and-save step.
- G2. Keep income and expenses organised in consistent categories.
- G3. Surface possible duplicates and inconsistencies for the user to review.
- G4. Give a single view of transactions, vendors and payment status.
- G5. Show spending trends and let users ask questions in plain language.

**Non-goals (MVP):** tax filing or GST compliance, bank-feed sync, payments, multi-user teams, accounting-grade ledgers. Flags are review prompts, never accusations of fraud or compliance violations.

## 4. Users
| Persona | Needs |
|---|---|
| Small business owner (shop, agency, local services) | Track supplier invoices, vendor totals and what is still unpaid |
| Freelancer (developer, designer, consultant) | Log receipts and work expenses, see income against spending |

## 5. Functional requirements
| ID | Requirement | Priority |
|---|---|---|
| F1 | Upload a PDF, PNG or JPG; extract vendor, invoice number, dates, total and currency with OCR / PDF text | Must |
| F2 | Show extracted fields in an editable form; nothing is saved until the user confirms | Must |
| F3 | Auto-suggest a category from keywords; user can override | Must |
| F4 | Create, edit, delete, search and filter transactions (income or expense) | Must |
| F5 | Payment status: unpaid, paid, overdue (unpaid and past due date, computed); one-click "Mark paid" | Must |
| F6 | Duplicate detection: same vendor with the same invoice number, or the same amount and date | Must |
| F7 | Consistency checks: due date before invoice date, future-dated invoice, amount over 3x the vendor's average | Must |
| F8 | Vendor view: record count, total spend, unpaid amount, items for review | Must |
| F9 | Dashboard: review queue, income / expenses / net / unpaid, spend by category, month and vendor | Must |
| F10 | AI assistant answering only from the user's records; works without an API key via rule-based answers | Should |
| F11 | Authentication and per-user data | Should (next) |
| F12 | Recurring-invoice reminders by email | Could |
| F13 | CSV / Excel export | Could |

## 6. Non-functional requirements
- Responsive layout from phone to desktop; keyboard focus visible; form errors announced.
- Typical PDF extraction under 2 s; first image OCR under about 30 s.
- Uploads limited to 10 MB; files are processed in memory and not stored.
- The AI assistant receives only the signed-in user's data and must say when data cannot answer a question.

## 7. Architecture
- **Frontend:** React 18, TypeScript, Vite.
- **Backend:** Node.js, Express, TypeScript. OCR with tesseract.js; PDF text with pdf.js.
- **Storage:** JSON file for the MVP (`server/data/db.json`); replace with PostgreSQL or SQLite when auth lands.
- **AI:** Anthropic Messages API when `ANTHROPIC_API_KEY` is set; otherwise keyword-based answers.

### Data model: Transaction
`id, vendor, invoiceNo, date, dueDate, amount, currency, category, type (expense|income), status (pending|paid|overdue), notes, flags[], createdAt`

### API
| Method | Path | Purpose |
|---|---|---|
| POST | /api/extract | Upload file, return extracted fields and raw text |
| GET / POST | /api/transactions | List / create |
| PUT / DELETE | /api/transactions/:id | Update / delete |
| GET | /api/summary | Totals and grouped spend |
| GET | /api/vendors | Per-vendor roll-up |
| POST | /api/assistant | Ask a question |
| POST | /api/seed | Load sample data for demos |

## 8. Success metrics
- Median time to record an invoice under 30 s.
- At least 85% of extracted fields accepted without edits on clean invoices.
- All seeded duplicates flagged with no false flag on distinct invoices.
- 5 of 5 demo questions answered correctly from the data.

## 9. Risks
| Risk | Mitigation |
|---|---|
| OCR misreads totals or dates | Mandatory review step; raw text shown |
| Scanned PDFs have no text layer | Ask for an image upload; server-side PDF rasterising on the roadmap |
| AI gives wrong or invented figures | Answer only from supplied data; figures are computed server-side |
| Flags read as accusations | Wording says "possible" and "review" |
| Financial data privacy | Auth, per-user data and encryption at rest before any real use |

## 10. Roadmap
1. **MVP (this repo):** F1 to F10.
2. **Next:** login and per-user data (F11), database, scanned-PDF OCR, CSV export (F13).
3. **Later:** email reminders (F12), bank-statement import, multi-currency reporting, team accounts.
