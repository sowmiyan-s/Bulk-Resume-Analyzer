# 🎯 Resume Radiance — Bulk AI Resume Screener & Talent Ranking Platform

**Resume Radiance** is an enterprise-grade, high-throughput AI resume screening and applicant tracking platform designed for university placement cells, recruitment teams, and hiring managers. It extracts, audits, scores, and ranks batches of resumes (PDF, DOCX, ZIP) against custom Job Descriptions (JDs) or calibrated **Global SDE Benchmarks** with zero-downtime multi-cloud rate-limit failovers.

---

## ⚡ Key Capabilities & Features

- 📦 **Bulk Extraction Engine**: Upload individual `.pdf`, `.docx` files or entire `.zip` archives. In-browser client-side extraction powered by `pdfjs-dist`, `mammoth`, and optional OCR via `tesseract.js`.
- 📊 **Calibrated 5-Pillar ATS Engine**: Deterministic, unbiased scoring (0–100%) grounded in:
  1. **Contact Details & Online Proof** (20 pts): Machine-readable email, phone, LinkedIn, and GitHub/portfolio.
  2. **Skills & JD Matching** (30 pts): Exact & semantic alignment with target tech stack.
  3. **Technical Projects Depth** (25 pts): $\ge$ 2 projects with architecture, tools, and quantified outcomes.
  4. **Experience with Dates** (15 pts): Structured internship/work history with clear date ranges.
  5. **Summary & Typo Hygiene** (10 pts): Tailored career summary and spelling cleanliness.
- 🎯 **Optional Sections Philosophy**: Sections like `Education`, `Certifications`, and `Achievements` are strictly optional. Resumes are **never penalized** for omitting them.
- 🛡️ **Zero-Downtime 2-Tiered Failover**:
  - **Intra-Provider Sibling Cascade**: If Groq's 70B model hits a rate limit during 50-resume parallel screening, the proxy instantly shifts to `llama-3.1-8b-instant` or `mixtral-8x7b`.
  - **Cross-Provider Hot-Standby Vault**: Automatically cascades across providers in your vault (`Groq` $\rightarrow$ `Cerebras` $\rightarrow$ `Qwen` $\rightarrow$ `Gemini` $\rightarrow$ `OpenRouter` $\rightarrow$ `NVIDIA`).
  - **Deterministic Safety Net**: High-precision ATS engine finishes the assessment under any API outage so batches never freeze.
- 🏆 **Interactive Candidate Leaderboard**: Sort, filter by readiness tier (`Tier 1: Shortlist Ready`, `Tier 2: Needs Minor Polish`, `Tier 3: Overhaul Required`), export to CSV or Markdown, and inspect full candidate dossiers in real time.
- 🔐 **Admin Management Hub (`/admin`)**:
  - Encrypted MongoDB Atlas key vault with live connection testing.
  - Global Default Role & Default Job Description configuration.
  - Complete resume audit history with soft-delete tracking, permanent purge, and one-click restoration to the Home dashboard.
- 📄 **Executive PDF Scorecard Export**: Generate beautifully formatted candidate assessment reports directly in the browser via `jspdf` and `html2canvas`.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [TanStack Start](https://tanstack.com/start) with Nitro SSR |
| **Routing & Client** | [TanStack Router](https://tanstack.com/router) & React 19 |
| **Styling & UI** | Tailwind CSS, Radix UI primitives, Lucide Icons, Sonner |
| **Database** | [MongoDB Atlas](https://www.mongodb.com/atlas) (Native Node Driver) |
| **Document Parsing** | `pdfjs-dist`, `mammoth`, `tesseract.js`, `fflate` |
| **PDF Reporting** | `jspdf`, `html2canvas` |
| **Supported AI Providers** | Groq Cloud, Cerebras Wafer-Scale, Qwen DashScope, Google Gemini, OpenRouter, NVIDIA NIM, Local Ollama |

---

## 🚀 Getting Started & Installation

### 1. Prerequisites
- **Node.js**: `v20.x` or higher (or Bun)
- **MongoDB Atlas Database**: Free M0 cluster connection URI

### 2. Clone Repository & Install Dependencies
```bash
git clone <repository-url>
cd "BULK RESUME ANALYSER"
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and fill in your values:
```ini
# Required: MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/resume_radiance?retryWrites=true&w=majority

# Required: Admin Panel passcode
ADMIN_PASSWORD=123321

# Optional: Server-side API key defaults (can also be saved via /admin UI)
GROQ_API_KEY=gsk_...
CEREBRAS_API_KEY=csk_...
QWEN_API_KEY=sk-...
GEMINI_API_KEY=AIzaSy...
OPENROUTER_API_KEY=sk-or-v1-...
NVIDIA_API_KEY=nvapi-...

PORT=3000
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Environment Variables Reference

| Variable | Required | Description |
| :--- | :---: | :--- |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string for persistent settings & candidate history. |
| `ADMIN_PASSWORD` | **Yes** | Passcode required to unlock the `/admin` portal (default: `123321`). |
| `ENCRYPTION_SECRET` | No | 32-byte hex string used for AES-256 encryption of vault keys in MongoDB. |
| `GROQ_API_KEY` | No | Groq Cloud API key ([console.groq.com](https://console.groq.com/keys)). |
| `CEREBRAS_API_KEY` | No | Cerebras Wafer-Scale API key ([cloud.cerebras.ai](https://cloud.cerebras.ai)). |
| `QWEN_API_KEY` | No | Alibaba Cloud DashScope API key ([qwencloud.com](https://home.qwencloud.com/benefits)). |
| `GEMINI_API_KEY` | No | Google Gemini API key ([aistudio.google.com](https://aistudio.google.com)). |
| `OPENROUTER_API_KEY`| No | OpenRouter API key for free models pool ([openrouter.ai](https://openrouter.ai/keys)). |
| `NVIDIA_API_KEY` | No | NVIDIA NIM TensorRT API key ([build.nvidia.com](https://build.nvidia.com)). |
| `PORT` | No | Port for local server (default: `3000`). |

---

## 📋 Recommended Fast Non-Thinking Models

To achieve maximum throughput during 50+ resume batches without thinking-mode delays:

| Provider | Model ID | Speed / Throughput | Best Used For |
| :--- | :--- | :--- | :--- |
| **Groq** | `llama-3.3-70b-versatile` *(Default)* | **330 tok/s (~600ms)** | Flagship 70B evaluation at sub-second latency |
| **Groq** | `llama-3.1-8b-instant` | **850+ tok/s (~280ms)** | Lightning-fast mass campus placement screening |
| **Cerebras** | `llama3.3-70b` | **1,800 tok/s (~400ms)** | Wafer-scale instant screening |
| **Qwen** | `qwen-turbo` | **60+ tok/s (~800ms)** | High-throughput direct recruiter scoring |
| **Google** | `gemini-2.0-flash` | **150+ tok/s (~750ms)** | Fast multimodal & structural evaluation |
| **OpenRouter** | `meta-llama/llama-3.3-70b-instruct:free` | High Throughput | 100% Free permanent pool |

---

## 🏗️ Production Build & Deployment

To compile and produce an optimized Nitro SSR production build:

```bash
# Verify TypeScript types
npx tsc --noEmit

# Build production bundle
npm run build

# Start production server
node .output/server/index.mjs
```

---

## 🔒 Security & Privacy
- **Client-Side Text Extraction**: Resume text extraction happens directly in the client browser.
- **AES-256 Encrypted Vault**: API keys stored in MongoDB Atlas are encrypted with AES-256 before write.
- **Passcode Protection**: Admin actions (purging, key updates, master database reset) require authenticated admin credentials.

