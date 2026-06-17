<img width="1774" height="887" alt="project-lead-image" src="https://github.com/user-attachments/assets/8d6bf34d-7990-4863-89b1-94225c4d63a5" />

# 💊 MedCount - 
### A medication manager by Justin McKay

--- 

**A privacy-first medication tracker that lives entirely on your phone.**

MedCount is a installable Progressive Web App (PWA) for keeping tabs on your pills, supplements, and prescriptions — how much you have left, when to take them, when to refill, and how consistent you've been. No accounts, no servers, no cloud database. Your health data never leaves your device.

---

## 🩺 What It Does

MedCount answers the four questions every medication routine runs into:

- **"How many do I have left?"** — Live quantity tracking with one-tap dose logging.
- **"Did I take it today?"** — A daily schedule view that checks off doses as you take them.
- **"When do I need a refill?"** — Automatic days-of-supply estimates and refill alerts before you run out.
- **"Am I actually staying on track?"** — Adherence streaks, percentages, and visual history so you can see patterns over time, not just guess at them.

---

## 🔐 Privacy Fist Mentality & Security

- **No accounts. No backend database. No analytics.**
- 100% of medication data stays in your browser's IndexedDB
- Optional client-side AES-256-GCM encryption with a user-chosen PIN
- Open source under MPL-2.0 — inspect exactly what it does

---

## ⚙️ How It Works

MedCount is **local-first**: all of your data — medications, dose history, settings — is stored in your browser's IndexedDB. The Python backend is intentionally "dumb": it only serves the static HTML/JS/CSS app shell. There is no API, no server-side database, and nothing about your medications is ever transmitted anywhere.

```
┌──────────────────────────────┐
│        Your Browser          │
│  ┌─────────────────────────┐ │
│  │   MedCount PWA (UI)     │ |
│  ├─────────────────────────┤ │
│  │  IndexedDB (Dexie.js)   │ │  ← all data lives here, on-device
│  ├─────────────────────────┤ │
│  │  Service Worker         │ │  ← offline caching + notifications
│  └─────────────────────────┘ │
└──────────────┬───────────────┘
               │  static files only
               ▼
      FastAPI (serves the app shell)
```

Because it's a PWA, you can "Add to Home Screen" on iOS or Android and it behaves like a native app — its own icon, full-screen, and fully functional offline once loaded.

---

## ✨ Features

### A simple. intuitive interface. Easy configuration makes for simple usage with powerful features available.
- Powerful features and statistics are *available* but not required, use as few as you need.
- Built in medication database fills in information as meds are entered.
- Optional reminders, no requests for notifications unless desired.

### 📋 Medication Management
- Track name, strength, form, dosage, prescriber, pharmacy, Rx number, and instructions (SIG)
- Color-coded cards for quick visual scanning
- Quantity-per-dose tracking with one-tap "Take" / "Refill" actions

### 📅 Today View
- A chronological schedule of every dose due today, grouped by time of day
- Tap to mark a dose taken — quantities and history update instantly
- Unscheduled / as-needed (PRN) medications shown separately

### 📊 Stats & Visualizations
- Adherence ring chart with overall percentage
- Current streak tracking (consecutive days with all doses logged)
- 7-day dose history bar chart
- Per-medication adherence breakdown
- Quantity-over-time line chart with refill markers
- Low-stock and expiring-soon alerts surfaced automatically

### 🔔 Smart Reminders
- Scheduled dose alerts by time of day and day of week
- Refill reminders N days before you're projected to run out
- "Did you forget to log this?" nudges if a scheduled dose goes unrecorded
- All notifications run through the Service Worker — no third-party push service required

### 🔒 Optional Encryption
- PIN-protected, on-device AES-256-GCM encryption (Web Crypto API)
- PIN is never stored — only a verification hash
- Fully optional; the app works the same with or without it

### 🗂️ History, Export & Print
- Full dose-by-dose audit trail per medication
- One-click JSON export of all data (for backups or sharing with a provider)
- Print-friendly history view

### 🔍 Search, Sort & Filter
- Instant search across all medications
- Sort by name, quantity, refill date, or days-of-supply remaining
- Filter chips by category (chronic, PRN, OTC, supplement, etc.)

### 📱 Installable & Offline-Ready
- Full PWA: installable on Android/iOS, works with no internet connection
- Material Design 3 UI with automatic light/dark theming

---


## 🛠️ Tech Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI + Uvicorn (serves static files only) |
| Storage | Dexie.js over IndexedDB |
| UI | Vanilla JS + Material Web Components (M3) |
| Charts | Hand-built inline SVG (no chart library) |
| Offline / Notifications | Service Worker + Notification API |
| Encryption | Web Crypto API (AES-GCM + PBKDF2) |
| Hosting | Render.com (free tier, automatic HTTPS) |

---

## 🚀 Running Locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Then open `http://localhost:8000` in a mobile-width browser window (or your phone, on the same network) to try the full experience.

## ☁️ Deployment

MedCount ships with a `render.yaml` for one-click deploys to [Render.com](https://render.com), which provides free HTTPS — required for service workers and notifications to work.

---

## 📰 Project Log

### 🔒 June 2026 — Security hardening pass

Before opening this project up publicly, I went through the entire codebase and the full git history, commit by commit, looking for anything that shouldn't be there — API keys, tokens, hardcoded passwords, that sort of thing. Good news: it was clean. Nothing sensitive was ever committed.

While I was in there, though, I found a real issue in the "Print History" feature. It built the printable page by writing the medication name and dose notes directly into a new browser window — without checking what was actually inside those strings first. Normally that's harmless, since I'm the only one typing those fields. But MedCount also has a JSON import feature that loads a backup file straight into the database, and that file could come from anywhere — another device, a shared backup, a friend's export. If a malicious medication name or note ever made it in through an imported file, it could have run as actual code the next time someone hit "Print." I fixed that by making sure those values are always treated as plain text no matter what's inside them, and patched the same issue in the reminder-time editor while I was at it.

Nothing about how the app looks or behaves changed — printing and reminders work exactly the same as before. It just can't be turned against itself anymore.

See the full [CHANGELOG](CHANGELOG.md) for the version-by-version history.

---

## 📄 License

Released under the [Mozilla Public License 2.0](LICENSE).
