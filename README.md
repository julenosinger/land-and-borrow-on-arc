# ⚡ ArcFi — Global Decentralized Lending Platform

> **Production-grade DeFi lending protocol on Arc Testnet (Chain ID: 5042002)**  
> Hybrid RWA + Crypto collateral · USDC payments · AI-powered agent · Dark/Light mode

![ArcFi Banner](https://img.shields.io/badge/Arc%20Testnet-Chain%205042002-06b6d4?style=for-the-badge&logo=ethereum)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Stack](https://img.shields.io/badge/Stack-Hono%20%2B%20Solidity%20%2B%20ethers.js-8b5cf6?style=for-the-badge)

---

## 🌐 Live Demo

**🚀 Production:** [https://arcfi.pages.dev](https://arcfi.pages.dev)  
**🔀 Latest Deploy:** [https://316d6a9a.arcfi.pages.dev](https://316d6a9a.arcfi.pages.dev)  
**🏥 Health Check:** [https://arcfi.pages.dev/api/health](https://arcfi.pages.dev/api/health)

---

## 📋 Features

### 🏦 Core Lending
| Feature | Description |
|---|---|
| **Loan Creation** | Full 4-step wizard: personal info, loan amount, collateral, review & sign |
| **Fixed Interest** | Max 5%/month — no compounding, no tricks |
| **Installments** | 1–10 installments with automated due-date schedule |
| **Global Support** | Borrowers and lenders from any country, individuals and companies |

### 🛡️ Hybrid Collateral System
| Type | Enforcement | Details |
|---|---|---|
| **RWA (Real-World Asset)** | Off-chain (legal) | Car, house, jewelry, land, custom — notarized doc hash on-chain via IPFS |
| **Crypto Escrow** | On-chain (automatic) | USDC / ERC-20 locked in contract — min 120% ratio — auto-release on repayment |

### 💰 Payment Infrastructure
- Per-installment USDC payments with one click
- Full loan repayment with batch execution
- Payment history with tx hashes
- On-chain receipt generation after every payment
- Wallet balance display (real-time USDC)

### 🤖 AI Agent (Chatbot)
Natural language commands executed on-chain:
```
"Pay next installment"      → confirms → executes on-chain
"Pay full loan"             → iterates all pending → confirms → pays
"How much do I owe?"        → reads contract state
"Show my payment history"   → lists all paid installments
"Check my loan status"      → full loan details
"When is my next payment?"  → due date + amount
```

### 🏛️ Lender Dashboard
- View all loan requests in a sortable table
- Filter by: All / Pending / Active / Completed
- Approve loans: set interest rate (≤ 5%) + installment interval
- Reject loans (returns crypto collateral)
- Verify RWA documents on-chain
- Disburse USDC directly to borrower

### 🎨 UI/UX
- **Dark mode** (default) + **Light mode** toggle
- Responsive design — works on mobile
- Real-time toast notifications
- Animated progress bars
- On-chain receipt modal with explorer links
- Modern DeFi aesthetic with gradient accents

---

## 🏗️ Architecture

```
arcfi/
├── contracts/
│   └── LoanPlatform.sol          # Main smart contract (Solidity 0.8.20)
├── src/
│   └── index.tsx                 # Hono backend (API routes + HTML)
├── public/static/
│   ├── style.css                 # Global styles + dark/light CSS vars
│   ├── contractABI.js            # Contract ABI + Arc Testnet config
│   ├── web3Manager.js            # Wallet connection + contract interactions
│   ├── ui.js                     # UI utilities (toast, modal, badges)
│   ├── chatbot.js                # AI agent + intent classification
│   └── app.js                   # Main application logic (SPA)
├── ecosystem.config.cjs          # PM2 config for local dev
├── wrangler.jsonc                # Cloudflare Pages config
├── vite.config.ts                # Vite build config
└── package.json
```

---

## ⛓️ Smart Contract

**`contracts/LoanPlatform.sol`** — Deployed on Arc Testnet

### Key Functions
| Function | Role | Description |
|---|---|---|
| `createLoanWithRWA()` | Borrower | Creates loan with real-world asset collateral |
| `createLoanWithCrypto()` | Borrower | Creates loan + locks ERC-20 collateral in escrow |
| `approveLoan()` | Lender | Approves + sets rate + generates installment schedule |
| `rejectLoan()` | Lender | Rejects request, releases crypto collateral |
| `verifyRWA()` | Lender | Marks RWA document as verified on-chain |
| `disburseLoan()` | Lender | Sends USDC principal to borrower |
| `payInstallment()` | Borrower | Pays specific installment + generates receipt hash |
| `payNextInstallment()` | Borrower | Convenience — pays next pending installment |
| `liquidateCollateral()` | Lender | Seizes crypto collateral after 3-day grace period |
| `cancelLoan()` | Borrower | Cancels pending loan, returns collateral |

### Loan Lifecycle
```
PENDING → APPROVED → ACTIVE → COMPLETED
                    ↘ DEFAULTED
         REJECTED
CANCELLED
```

### Interest Formula
```
totalInterest = principal × (rate/10000) × months
installmentAmount = (principal + totalInterest) / n
// NO compounding — fixed linear interest only
```

---

## 🚀 Setup & Deployment

### Prerequisites
- Node.js 18+
- MetaMask or compatible Web3 wallet
- Arc Testnet configured in wallet

### Add Arc Testnet to MetaMask
| Field | Value |
|---|---|
| Network Name | Arc Testnet |
| RPC URL | `https://rpc.arc.fun` |
| Chain ID | `5042002` |
| Currency Symbol | ARC |
| Block Explorer | `https://explorer.arc.fun` |

### Local Development
```bash
# Clone
git clone https://github.com/julenosinger/land-and-borrow-on-arc.git
cd land-and-borrow-on-arc

# Install
npm install

# Build
npm run build

# Start (PM2)
pm2 start ecosystem.config.cjs

# Or without PM2
npx wrangler pages dev dist --port 3000
```

### Deploy to Cloudflare Pages
```bash
# Build
npm run build

# Deploy
npx wrangler pages deploy dist --project-name arcfi

# Set secrets (if needed)
npx wrangler pages secret put PINATA_API_KEY --project-name arcfi
```

### Deploy Smart Contract
1. Open `contracts/LoanPlatform.sol` in [Remix IDE](https://remix.ethereum.org)
2. Compile with Solidity `^0.8.20`
3. Connect MetaMask to Arc Testnet (Chain ID: 5042002)
4. Deploy with USDC token address as constructor argument
5. Copy the deployed contract address
6. In the app → **Settings** → paste the contract address and USDC address

---

## ⚙️ Configuration (Settings Page)

After deploying the contract, go to the **Settings** page in the app and fill in:

| Field | Description |
|---|---|
| **LoanPlatform Contract** | Deployed address on Arc Testnet |
| **USDC Token Address** | USDC contract address on Arc Testnet |
| **Pinata API Key** | Optional — for IPFS document uploads |
| **Pinata Secret Key** | Optional — for IPFS document uploads |

---

## 🔐 Security Model

| Layer | Mechanism |
|---|---|
| **Wallet auth** | All write operations require wallet signature |
| **Interest cap** | Hard-coded 5%/month maximum in contract |
| **Collateral safety** | Min 120% ratio required for crypto collateral |
| **Overpayment prevention** | Contract validates installment status before payment |
| **Duplicate doc prevention** | `usedDocumentHashes` mapping blocks reuse |
| **Non-custodial** | Platform never holds user funds — only smart contract escrow |
| **Liquidation grace** | 3-day grace period before lender can liquidate |

---

## ⚖️ Legal Disclaimer

- **RWA enforcement is off-chain** — subject to local laws and requires legal proceedings
- **Crypto enforcement is on-chain** — automatic, trustless, no human intervention
- ArcFi is a non-custodial protocol — the platform never controls user funds
- This is deployed on **testnet** — not financial advice, no real money involved

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Smart Contract** | Solidity 0.8.20 |
| **Blockchain** | Arc Testnet (Chain ID: 5042002) |
| **Payments** | USDC (ERC-20) |
| **Web3** | ethers.js v5 |
| **Backend** | Hono (Cloudflare Workers) |
| **Build** | Vite + @hono/vite-build |
| **Deployment** | Cloudflare Pages |
| **Frontend** | Vanilla JS + CSS Variables (dark/light) |
| **Icons** | Font Awesome 6 |
| **AI Agent** | Custom intent classifier (no external LLM) |

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

## 🤝 Contributing

Pull requests welcome. Please open an issue first to discuss major changes.

---

*Built with ⚡ on Arc Testnet*
