# ⚡ ArcFi — Global Decentralized Loan Marketplace

[![Arc Testnet](https://img.shields.io/badge/Arc%20Testnet-Chain%205042002-06b6d4?style=for-the-badge&logo=ethereum)](https://arc.fun)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Stack](https://img.shields.io/badge/Stack-Hono%20%2B%20Solidity%20%2B%20ethers.js-8b5cf6?style=for-the-badge)](https://hono.dev)

Production-grade, fully decentralized lending protocol on Arc Testnet (Chain ID: 5042002). Supports hybrid RWA + Crypto collateral, USDC payments, a live loan marketplace, AI-powered agent, and automated installments — all non-custodial.

---

## 🌐 Live URLs

| Environment | URL |
|---|---|
| **Production (Cloudflare)** | https://arcfi.pages.dev |
| **Latest Deployment** | https://1bc0867a.arcfi.pages.dev |
| **GitHub** | https://github.com/julenosinger/land-and-borrow-on-arc |
| **API Health** | https://arcfi.pages.dev/api/health |
| **Sandbox Dev** | https://3000-i1q3eb8rzfef64ns18bvp-3844e1b6.sandbox.novita.ai |

---

## ✅ Completed Features

### 🏪 Loan Marketplace (NEW)
- Browse active lender offers with real-time on-chain data
- Filter by: amount range, interest rate, installments, collateral type, lender type
- Each listing shows: lender name/wallet, rate, max installments, liquidity, collateral, risk indicator, utilization
- "Apply for Loan" CTA pre-fills the borrow wizard with offer terms

### 🏦 Lender Offer Creation (NEW)
- Lender identity: name/company, type (individual/company), auto-detected wallet
- Liquidity lock: deposit USDC into smart contract escrow
- Terms: interest rate (≤5%/month), max installments (1–10), loan amount range
- Collateral preferences: RWA only / Crypto only / Both, min collateral ratio
- Geographic restrictions, borrower profile preferences
- Liquidity management: add, withdraw unused, pause, resume, close offer

### 💧 Liquidity Lock Mechanism (NEW)
- USDC locked on-chain in `LoanMarketplace.sol`
- Available vs. allocated liquidity tracked per offer
- Prevents over-allocation / double-spending
- Auto-releases repaid amounts back to available pool

### 📊 My Lending Activity (NEW)
- Summary stats: active offers, total deployed, total repaid, active loans
- Offers table with utilization bars, action buttons (add/withdraw/pause/resume/close)
- Active loans table from all my offers with borrower info and progress
- ROI calculation via on-chain data

### 🤖 AI Agent Marketplace Commands (NEW)
- "Browse marketplace" — navigates to marketplace
- "Create a loan offer" — guided offer creation flow
- "Show my offers" — lists all lender offers with details
- "How much liquidity do I have?" — full liquidity breakdown
- "Pause my offer" — guides to My Lending page
- "Resume my offer" — same

### 🏠 Core Lending Platform
- 4-step Borrow Wizard (personal info, loan details, collateral, review)
- RWA collateral: SHA-256 document hash, IPFS upload, on-chain storage
- Crypto collateral: USDC/ERC-20 escrow, ≥120% ratio, auto-release/liquidation
- Lender Dashboard: view requests, approve/reject, set rate, disburse USDC
- My Dashboard: loan stats, progress, payment shortcuts
- Payment Center: installment schedule, pay buttons, full repayment
- Receipt system: tx hash, amounts, Explorer link, API storage
- Dark/Light mode toggle, persisted in localStorage

### 🤖 AI Chatbot (Extended)
All previous + new marketplace commands:
- "Pay next installment", "Pay full loan", "Pay installment #2"
- "How much do I owe?", "Check my loan status", "Show payment history"
- "Browse marketplace", "Create a loan offer", "Show my offers"
- "How much liquidity do I have?", "Pause my offer"

---

## 🏗️ Architecture

### Smart Contracts (Arc Testnet)

| Contract | Description |
|---|---|
| `LoanPlatform.sol` | Core loan lifecycle, collateral, installments, receipts |
| `LoanMarketplace.sol` | Offer creation, liquidity lock, allocation, repayment routing |

**Deploying with Remix:**
1. Open https://remix.ethereum.org
2. Connect MetaMask to Arc Testnet (Chain ID: 5042002, RPC: https://rpc.arc.fun)
3. Deploy `LoanPlatform.sol` with USDC address as constructor arg
4. Deploy `LoanMarketplace.sol` with USDC address
5. Call `setLoanPlatform(address)` on Marketplace with LoanPlatform address
6. Enter both addresses in ArcFi Settings

### Frontend Architecture

```
public/static/
├── contractABI.js     — LoanPlatform + LoanMarketplace + ERC20 ABIs
├── web3Manager.js     — Wallet + blockchain operations (marketplace methods added)
├── marketplace.js     — Marketplace page, offer creation, My Lending Activity
├── app.js             — Navigation, borrow wizard, payments, settings
├── chatbot.js         — AI agent with marketplace intent classification
├── ui.js              — Shared UI utilities
└── style.css          — Dark/light theme, offer cards, marketplace styles
```

### Backend (Hono on Cloudflare Workers)

| Route | Description |
|---|---|
| `GET /` | SPA entry point |
| `GET /api/health` | Status check (marketplace: true) |
| `POST /api/receipts` | Store payment receipt |
| `GET /api/receipts/:id` | Retrieve receipt |
| `POST /api/loans/meta` | Cache loan off-chain metadata |
| `GET /api/loans/meta/:id` | Retrieve loan metadata |
| `POST /api/offers/meta` | Cache offer off-chain metadata |
| `GET /api/offers/meta/:id` | Retrieve offer metadata |

---

## 📋 Data Models

### LenderOffer (on-chain)
```solidity
struct LenderOffer {
  uint256 id;
  address lender;
  string  lenderName;
  LenderType lenderType;           // Individual | Company
  uint256 totalLiquidity;          // USDC deposited (6 dec)
  uint256 availableLiquidity;      // Unallocated
  uint256 allocatedLiquidity;      // In active loans
  uint256 interestRateBps;         // e.g. 300 = 3%/month
  uint256 maxInstallments;         // 1-10
  uint256 minLoanAmount;           // USDC (6 dec)
  uint256 maxLoanAmount;           // USDC (6 dec)
  uint8   acceptedCollateral;      // 1=RWA, 2=Crypto, 3=Both
  uint256 minCollateralRatioBps;   // e.g. 12000 = 120%
  string  geoRestrictions;         // "US,EU" or "GLOBAL"
  string  borrowerPreferences;     // free text
  OfferStatus status;              // ACTIVE | PAUSED | CLOSED
  uint256 createdAt;
  uint256 totalLoansIssued;
  uint256 totalRepaid;
  uint256[] activeLoanIds;
}
```

### LoanPlatform Core (existing)
- Borrower info (name, email, country, city, employment)
- Loan terms (principal, rate bps, installments, total repayable)
- Collateral (RWA: hash/URI/value/jurisdiction | CRYPTO: token/amount/ratio)
- Installment schedule with due dates, paid dates, tx hashes
- Lifecycle: PENDING → APPROVED → ACTIVE → COMPLETED / DEFAULTED

---

## 🚀 Setup Guide

### 1. Add Arc Testnet to MetaMask
- Network: Arc Testnet
- Chain ID: 5042002
- RPC: https://rpc.arc.fun
- Explorer: https://explorer.arc.fun
- Currency: ARC

Or click "Add Arc Network to Wallet" in Settings.

### 2. Deploy Smart Contracts
```
Remix IDE → Deploy LoanPlatform.sol (pass USDC address)
Remix IDE → Deploy LoanMarketplace.sol (pass USDC address)
LoanMarketplace.setLoanPlatform(loanPlatformAddress)
```

### 3. Configure ArcFi
- Go to Settings
- Enter LoanPlatform address
- Enter LoanMarketplace address
- Enter USDC token address
- (Optional) Enter Pinata API keys for IPFS

### 4. For Lenders
1. Go to **Lend** → Create Offer
2. Enter name, liquidity (USDC), rate (≤5%), terms
3. Click "Lock Liquidity & Create Offer" → approve USDC + tx
4. Monitor in **My Lending** page

### 5. For Borrowers
1. Go to **Marketplace** → browse offers
2. Click "Apply for Loan" on desired offer
3. Complete 4-step wizard (personal info, amount, collateral, review)
4. Sign & submit → loan enters PENDING state
5. Lender approves from their dashboard → USDC disbursed
6. Make payments in **Payments** page

---

## ⚖️ Legal Disclaimer

ArcFi is a **non-custodial, decentralized protocol**. By using ArcFi:
- Lenders assume full capital risk
- RWA collateral enforcement is **off-chain** (legal jurisdiction of asset)
- Crypto collateral enforcement is **on-chain** (automatic smart contract)
- Interest is fixed, non-compounding, maximum 5%/month
- ArcFi does not provide financial, legal, or investment advice

---

## 🛡️ Security Features
- Input validation on all forms (client + contract-level)
- Wallet connection required for all transactions
- USDC approval → transfer atomic flow
- Liquidity allocation prevents over-spending
- Collateral ratio enforcement (≥120% for crypto)
- Non-custodial: contracts hold funds, not platform

---

*Last updated: April 2026 — Arc Testnet Chain ID 5042002*
