# DaatFI — Vercel/Next.js Deployment

## Project Overview

DaatFI is a decentralized lending platform built on Arc Testnet.
This folder contains the **Vercel/Next.js** version of the project.

- **Original (Cloudflare Pages)**: https://daatfi.pages.dev  
- **GitHub branch**: `vercel` at https://github.com/julenosinger/land-and-borrow-on-arc/tree/vercel

---

## Project Structure

```
daatfi-vercel/
├── pages/
│   ├── index.tsx               # SPA entry — serves full app HTML
│   └── api/
│       ├── health.ts           # GET /api/health
│       ├── receipts/
│       │   ├── index.ts        # POST/GET /api/receipts
│       │   └── [id].ts         # GET /api/receipts/:id
│       ├── loans/
│       │   ├── meta.ts         # POST/GET /api/loans/meta
│       │   └── [loanId].ts     # GET /api/loans/meta/:loanId
│       ├── offers/
│       │   ├── meta.ts         # POST/GET /api/offers/meta
│       │   └── [offerId].ts    # GET /api/offers/meta/:offerId
│       ├── circle/
│       │   ├── faucet.ts       # POST /api/circle/faucet
│       │   ├── balance.ts      # GET  /api/circle/balance
│       │   └── wallets.ts      # GET  /api/circle/wallets
│       ├── ipfs/
│       │   └── upload.ts       # POST /api/ipfs/upload
│       └── security/
│           └── events.ts       # GET  /api/security/events
├── public/
│   ├── app.html                # Full SPA HTML (served at /)
│   ├── _headers                # Cloudflare-compatible headers (ignored on Vercel)
│   └── static/                 # All frontend JS/CSS assets
│       ├── app.js
│       ├── marketplace.js
│       ├── web3Manager.js
│       ├── receipt.js
│       ├── docs-viewer.js
│       ├── chatbot.js
│       ├── contractABI.js
│       ├── security.js
│       ├── ui.js
│       ├── style.css
│       └── favicon.svg
├── next.config.js              # Security headers + Next.js config
├── vercel.json                 # Vercel deployment config
├── tsconfig.json
├── package.json
├── .env.local                  # Local secrets (not committed)
└── .env.example                # Template for required env vars
```

---

## Required Environment Variables

| Variable | Description | Where to get it |
|---|---|---|
| `CIRCLE_API_KEY` | Circle API key for USDC faucet/balance on Arc Testnet | [Circle Developer Console](https://console.circle.com) |
| `PINATA_JWT` | Pinata JWT for IPFS document upload | [Pinata Cloud](https://app.pinata.cloud/keys) |

---

## Step-by-Step: GitHub Upload + Vercel Connection

### 1. Create a new GitHub repository (if needed)

The Vercel code has been pushed to the **`vercel` branch** of the existing repo:
```
https://github.com/julenosinger/land-and-borrow-on-arc/tree/vercel
```

Alternatively, create a new repo `daatfi-vercel` on GitHub and push:
```bash
git remote set-url origin https://github.com/julenosinger/daatfi-vercel.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select **`land-and-borrow-on-arc`** repository
4. Set **Root Directory** to: *(leave blank — root of branch)*
5. Set **Branch** to: `vercel`
6. Framework Preset: **Next.js** (auto-detected)
7. Build Command: `npm run build` (auto)
8. Output Directory: `.next` (auto)
9. Click **"Add Environment Variables"** and add:
   - `CIRCLE_API_KEY` = your Circle API key
   - `PINATA_JWT` = your Pinata JWT

### 3. Deploy

Click **"Deploy"** — Vercel will:
- Install dependencies (`npm install`)
- Build Next.js (`npm run build`)
- Deploy serverless functions under `/api/*`
- Serve static assets under `/static/*`
- Serve the full SPA at `/`

### 4. Set custom domain (optional)

In Vercel dashboard → Settings → Domains → add your domain.

---

## Local Development

```bash
cd daatfi-vercel

# Install dependencies
npm install

# Create .env.local with your secrets
cp .env.example .env.local
# Edit .env.local and fill in values

# Start development server
npm run dev
# Visit http://localhost:3000

# Production build test
npm run build
npm start
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/receipts` | Store receipt |
| `GET` | `/api/receipts/:id` | Retrieve receipt |
| `POST` | `/api/loans/meta` | Store loan metadata |
| `GET` | `/api/loans/meta/:loanId` | Get loan metadata |
| `POST` | `/api/offers/meta` | Store offer metadata |
| `GET` | `/api/offers/meta/:offerId` | Get offer metadata |
| `POST` | `/api/circle/faucet` | Request testnet USDC |
| `GET` | `/api/circle/balance` | Get USDC balance |
| `GET` | `/api/circle/wallets` | List Circle wallets |
| `POST` | `/api/ipfs/upload` | Upload document to IPFS (Pinata) |

---

## Security Headers Applied

All responses include:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy` (full CSP)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, mic, geolocation disabled)
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

---

## Notes

- **In-memory storage**: `receipts`, `loanMeta`, `offerMeta` are stored in-memory per serverless instance. On Vercel's serverless architecture, each function invocation may use a fresh instance. For production at scale, replace with [Vercel KV](https://vercel.com/docs/storage/vercel-kv) or [Upstash Redis](https://upstash.com/).
- **IPFS uploads**: Fully functional via Pinata when `PINATA_JWT` is set.
- **Web3 / Wallet**: Fully client-side (MetaMask, ethers.js) — no server changes needed.
- **Arc Testnet RPC**: `https://rpc.testnet.arc.network` — direct from browser.
