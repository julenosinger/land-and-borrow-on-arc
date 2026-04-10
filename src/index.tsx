import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

app.use('*', cors())
app.use('/static/*', serveStatic({ root: './' }))

// Favicon redirect
app.get('/favicon.ico', (c) => c.redirect('/static/favicon.svg', 301))

// ── Home page ─────────────────────────────────────────────────────────────────
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ArcFi — Decentralized Lending Platform</title>
  <meta name="description" content="Global decentralized lending on Arc Testnet. Hybrid RWA + crypto collateral, USDC payments, AI-powered agent." />

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
  <!-- Styles -->
  <link rel="stylesheet" href="/static/style.css" />
  <!-- Icons -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" crossorigin="anonymous" />

  <!-- Inline critical vars -->
  <script>
    // Restore saved theme before paint
    (function(){
      var t = localStorage.getItem('arcfi-theme') || 'dark';
      document.documentElement.className = t;
    })();
  </script>

  <style>
    /* contract config banner */
    #config-banner {
      position: fixed; top: 64px; left: 0; right: 0; z-index: 29;
      background: rgba(245,158,11,0.1);
      border-bottom: 1px solid rgba(245,158,11,0.25);
      padding: 8px 24px;
      display: flex; align-items: center; gap: 10px;
      font-size: 12px; color: var(--amber);
      transition: background-color var(--transition);
    }
    .main-with-banner { padding-top: 36px !important; }
    .col-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .col-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    @media(max-width:1024px){ .col-4 { grid-template-columns: repeat(2,1fr); } }
    @media(max-width: 768px){ .col-3,.col-4 { grid-template-columns: 1fr 1fr; } }
    @media(max-width: 480px){ .col-3,.col-4 { grid-template-columns: 1fr; } }
    .inline-flex { display: inline-flex; align-items: center; gap: 8px; }
    .gap-3 { gap: 12px; }
    .gap-4 { gap: 16px; }
    .mt-4  { margin-top: 16px; }
    .mt-6  { margin-top: 24px; }
    .mb-2  { margin-bottom: 8px; }
    .mb-4  { margin-bottom: 16px; }
    .mb-6  { margin-bottom: 24px; }
    .flex  { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .flex-col { flex-direction: column; }
    .flex-wrap { flex-wrap: wrap; }
    .w-full { width: 100%; }
    .relative { position: relative; }
    .overflow-hidden { overflow: hidden; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    .text-sm   { font-size: 13px; }
    .text-xs   { font-size: 11px; }
    .text-lg   { font-size: 18px; }
    .text-xl   { font-size: 20px; }
    .text-2xl  { font-size: 24px; }
    .truncate  { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .break-all { word-break: break-all; }
    .space-y-3 > * + * { margin-top: 12px; }
    .space-y-4 > * + * { margin-top: 16px; }
    .space-y-6 > * + * { margin-top: 24px; }
    .grid-auto { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media(max-width:640px){ .grid-2 { grid-template-columns: 1fr; } }
    .underline-link { color: var(--cyan); text-decoration: underline; font-size: 12px; }
    .p-2 { padding: 8px; }
    .p-3 { padding: 12px; }
    .p-4 { padding: 16px; }
    .px-3 { padding-left: 12px; padding-right: 12px; }
    .py-2 { padding-top: 8px; padding-bottom: 8px; }
    .rounded { border-radius: var(--radius-sm); }
    .rounded-lg { border-radius: var(--radius-lg); }
    .border { border: 1px solid var(--border); }
    .bg-surface { background: var(--bg-surface); }
    .bg-input   { background: var(--bg-input); }

    /* Loan detail row */
    .detail-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 0; border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: var(--text-muted); font-size: 12px; }
    .detail-value { color: var(--text-primary); font-weight: 500; }

    /* Token chips */
    .token-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .token-chip {
      padding: 6px 14px;
      border: 1.5px solid var(--border);
      border-radius: 20px;
      font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
      background: var(--bg-card);
      color: var(--text-secondary);
    }
    .token-chip:hover     { border-color: var(--cyan); color: var(--cyan); }
    .token-chip.selected  { border-color: var(--cyan); color: var(--cyan); background: rgba(6,182,212,0.08); }
    html.light .token-chip.selected { background: rgba(2,132,199,0.08); }

    /* Ratio slider */
    input[type="range"] {
      -webkit-appearance: none; appearance: none;
      width: 100%; height: 5px;
      border-radius: 3px;
      background: var(--border);
      outline: none; cursor: pointer;
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 18px; height: 18px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--cyan), var(--blue));
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(6,182,212,0.4);
    }
  </style>
</head>
<body>

<!-- ════ CONFIG BANNER ════ -->
<div id="config-banner">
  <i class="fa-solid fa-triangle-exclamation"></i>
  <span>
    <strong>Setup Required:</strong> Deploy the smart contract and set addresses in
    <button onclick="showPage('settings')" style="text-decoration:underline;background:none;border:none;cursor:pointer;color:inherit;font-weight:600;">Settings</button>
    to enable on-chain features. Arc Testnet — Chain ID: 5042002.
  </span>
  <button onclick="document.getElementById('config-banner').style.display='none'" style="margin-left:auto;background:none;border:none;cursor:pointer;color:inherit;font-size:16px;">&times;</button>
</div>

<!-- ════ HEADER ════ -->
<header class="top-header">
  <a class="header-logo" onclick="showPage('home')" style="text-decoration:none">
    <div class="logo-icon">⚡</div>
    <span class="logo-text">Arc<span class="logo-fi">Fi</span></span>
  </a>

  <nav class="header-nav">
    <button class="nav-btn active" data-page="home" onclick="showPage('home')">
      <i class="fa-solid fa-house"></i> Home
    </button>
    <button class="nav-btn" data-page="borrow" onclick="showPage('borrow')">
      <i class="fa-solid fa-hand-holding-dollar"></i> Borrow
    </button>
    <button class="nav-btn" data-page="lend" onclick="showPage('lend')">
      <i class="fa-solid fa-building-columns"></i> Lend
    </button>
    <button class="nav-btn" data-page="dashboard" onclick="showPage('dashboard')">
      <i class="fa-solid fa-chart-line"></i> Dashboard
    </button>
    <button class="nav-btn" data-page="payments" onclick="showPage('payments')">
      <i class="fa-solid fa-credit-card"></i> Payments
    </button>
    <button class="nav-btn" data-page="settings" onclick="showPage('settings')">
      <i class="fa-solid fa-gear"></i> Settings
    </button>
  </nav>

  <div class="header-actions">
    <div class="network-badge hide-mobile">
      <span class="dot"></span>Arc Testnet
    </div>

    <!-- Theme Toggle -->
    <button class="theme-toggle" id="theme-toggle-btn" title="Toggle dark/light mode" onclick="toggleTheme()">
      <svg id="icon-sun" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="display:none">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M5.64 18.36l-.71.71m12.73 0-.71-.71M5.64 5.64l-.71-.71M12 8a4 4 0 100 8 4 4 0 000-8z"/>
      </svg>
      <svg id="icon-moon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
      </svg>
    </button>

    <!-- Wallet -->
    <button class="wallet-btn disconnected" id="wallet-btn" onclick="connectWallet()">
      <i class="fa-solid fa-wallet"></i>
      <span id="wallet-label">Connect Wallet</span>
    </button>
  </div>
</header>

<!-- ════ MAIN ════ -->
<main class="main-content main-with-banner" id="main-content">

  <!-- ══ PAGE: HOME ═══════════════════════════════════════════════════════════ -->
  <div class="page active grid-bg" id="page-home" style="border-radius:20px; overflow:hidden; padding:0;">

    <div style="padding: 48px 40px 40px;" class="relative overflow-hidden">
      <!-- blobs -->
      <div class="hero-blob hero-blob-1"></div>
      <div class="hero-blob hero-blob-2"></div>
      <div class="hero-blob hero-blob-3"></div>

      <div class="relative" style="text-align:center; max-width:700px; margin:0 auto;">
        <div class="hero-eyebrow">
          <i class="fa-solid fa-bolt"></i>
          Arc Testnet — Chain ID 5042002 — Powered by USDC
        </div>
        <h1 class="hero-title">
          Global Decentralized<br/>
          <span class="hero-gradient">Lending Protocol</span>
        </h1>
        <p class="hero-sub">
          Hybrid collateral lending platform supporting Real-World Assets and Crypto.
          Fixed interest, transparent smart contracts, AI-powered agent — all on Arc Testnet.
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" onclick="showPage('borrow')">
            <i class="fa-solid fa-hand-holding-dollar"></i> Apply for a Loan
          </button>
          <button class="btn btn-secondary btn-lg" onclick="showPage('lend')">
            <i class="fa-solid fa-building-columns"></i> Lend &amp; Earn
          </button>
          <button class="btn btn-ghost btn-lg" onclick="showPage('dashboard')">
            <i class="fa-solid fa-chart-line"></i> Dashboard
          </button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="col-4" style="margin-top:48px; max-width:900px; margin-left:auto; margin-right:auto;">
        <div class="stat-card cyan">
          <div class="accent-blob" style="background:var(--cyan)"></div>
          <div class="stat-label">Total Loans</div>
          <div class="stat-value" id="home-stat-loans">—</div>
          <div class="stat-sub">Active on Arc Testnet</div>
        </div>
        <div class="stat-card blue">
          <div class="accent-blob" style="background:var(--blue)"></div>
          <div class="stat-label">Total Volume</div>
          <div class="stat-value" id="home-stat-vol">—</div>
          <div class="stat-sub">USDC disbursed</div>
        </div>
        <div class="stat-card" style="border-color:rgba(16,185,129,0.25)">
          <div class="accent-blob" style="background:var(--green)"></div>
          <div class="stat-label">Repayment Rate</div>
          <div class="stat-value" id="home-stat-rate">—</div>
          <div class="stat-sub">Completed loans</div>
        </div>
        <div class="stat-card">
          <div class="accent-blob" style="background:var(--purple)"></div>
          <div class="stat-label">Max Interest</div>
          <div class="stat-value">5%</div>
          <div class="stat-sub">Fixed / month</div>
        </div>
      </div>
    </div>

    <!-- Features -->
    <div style="padding: 0 40px 48px;">
      <div class="feature-grid">
        <div class="feature-card">
          <div class="feature-icon" style="background:rgba(6,182,212,0.1)">🏠</div>
          <div class="feature-title">Real-World Collateral</div>
          <div class="feature-desc">Use cars, houses, jewelry or any real asset as collateral. Notarized document hash stored on-chain via IPFS.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon" style="background:rgba(59,130,246,0.1)">🔐</div>
          <div class="feature-title">Crypto Escrow</div>
          <div class="feature-desc">Lock USDC, ETH or any ERC-20 token as collateral. Automatically released upon full repayment. Min 120% ratio.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon" style="background:rgba(16,185,129,0.1)">💵</div>
          <div class="feature-title">USDC Payments</div>
          <div class="feature-desc">Fixed installment schedule. No compounding. Max 5% interest per month. All payments executed on Arc Testnet.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon" style="background:rgba(139,92,246,0.1)">🤖</div>
          <div class="feature-title">AI Agent</div>
          <div class="feature-desc">Natural language commands. "Pay next installment", "Check my balance", "Show payment history" — all executed on-chain.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon" style="background:rgba(245,158,11,0.1)">🧾</div>
          <div class="feature-title">On-Chain Receipts</div>
          <div class="feature-desc">Every payment generates a tamper-proof receipt with tx hash, amount and parties — permanently stored on-chain.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon" style="background:rgba(239,68,68,0.1)">🌍</div>
          <div class="feature-title">Global Ready</div>
          <div class="feature-desc">Supports borrowers and lenders worldwide. Individuals and companies. Any country, any jurisdiction.</div>
        </div>
      </div>
    </div>

    <!-- Legal -->
    <div style="padding: 0 40px 40px;">
      <div class="legal-banner legal-banner-warning">
        <i class="fa-solid fa-scale-balanced" style="flex-shrink:0; margin-top:2px;"></i>
        <div>
          <strong>Legal Disclaimer:</strong> ArcFi is a non-custodial, decentralized protocol. Real-World Asset (RWA) collateral enforcement is <strong>off-chain</strong> and subject to applicable laws in your jurisdiction. Crypto collateral enforcement is <strong>on-chain</strong> and executed automatically by smart contracts. This platform does not provide financial, legal or investment advice. Use at your own risk.
        </div>
      </div>
    </div>
  </div>

  <!-- ══ PAGE: BORROW ══════════════════════════════════════════════════════════ -->
  <div class="page" id="page-borrow">
    <div class="section-title"><i class="fa-solid fa-hand-holding-dollar text-cyan" style="margin-right:8px;"></i>Apply for a Loan</div>
    <div class="section-sub">Complete the form below to submit your loan request on Arc Testnet.</div>

    <!-- Wizard Steps -->
    <div class="steps-bar" id="borrow-steps">
      <div class="step-node active" id="step-1">
        <div class="step-circle">1</div>
        <div class="step-label">Personal Info</div>
      </div>
      <div class="step-node" id="step-2">
        <div class="step-circle">2</div>
        <div class="step-label">Loan Details</div>
      </div>
      <div class="step-node" id="step-3">
        <div class="step-circle">3</div>
        <div class="step-label">Collateral</div>
      </div>
      <div class="step-node" id="step-4">
        <div class="step-circle">4</div>
        <div class="step-label">Review &amp; Submit</div>
      </div>
    </div>

    <!-- Step 1: Personal Info -->
    <div id="borrow-step-1" class="card card-lg">
      <div class="card-header">
        <div class="card-title"><i class="fa-solid fa-user text-cyan"></i>Personal Information</div>
        <span class="badge badge-active">Step 1 of 4</span>
      </div>
      <div class="form-section">
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Full Name <span class="req">*</span></label>
            <input id="b-fullname" class="form-control" type="text" placeholder="e.g. John Michael Smith" />
            <span class="field-error" id="b-fullname-err"></span>
          </div>
          <div class="form-group">
            <label class="form-label">Email Address <span class="req">*</span></label>
            <input id="b-email" class="form-control" type="email" placeholder="john@example.com" />
            <span class="field-error" id="b-email-err"></span>
          </div>
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Country <span class="req">*</span></label>
            <select id="b-country" class="form-control">
              <option value="">— Select country —</option>
              <option>United States</option><option>United Kingdom</option><option>Germany</option>
              <option>France</option><option>Japan</option><option>Brazil</option>
              <option>Canada</option><option>Australia</option><option>India</option>
              <option>China</option><option>Singapore</option><option>UAE</option>
              <option>Mexico</option><option>Argentina</option><option>Netherlands</option>
              <option>Spain</option><option>Italy</option><option>Portugal</option>
              <option>Switzerland</option><option>Sweden</option><option>Norway</option>
              <option>South Korea</option><option>Indonesia</option><option>Nigeria</option>
              <option>South Africa</option><option>Turkey</option><option>Other</option>
            </select>
            <span class="field-error" id="b-country-err"></span>
          </div>
          <div class="form-group">
            <label class="form-label">City <span class="req">*</span></label>
            <input id="b-city" class="form-control" type="text" placeholder="e.g. New York" />
            <span class="field-error" id="b-city-err"></span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Employment Status <span class="opt">(optional)</span></label>
          <select id="b-employment" class="form-control">
            <option value="">— Select status —</option>
            <option>Employed (Full-time)</option>
            <option>Employed (Part-time)</option>
            <option>Self-employed / Freelancer</option>
            <option>Business Owner</option>
            <option>Student</option>
            <option>Retired</option>
            <option>Unemployed</option>
            <option>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Borrower Type <span class="req">*</span></label>
          <div class="token-chips">
            <button class="token-chip selected" data-borrower-type="individual" onclick="selectBorrowerType(this,'individual')">👤 Individual</button>
            <button class="token-chip" data-borrower-type="company" onclick="selectBorrowerType(this,'company')">🏢 Company</button>
          </div>
        </div>
      </div>
      <div class="flex" style="justify-content:flex-end; margin-top:24px;">
        <button class="btn btn-primary" onclick="borrowStep(2)">
          Next: Loan Details <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>

    <!-- Step 2: Loan Details -->
    <div id="borrow-step-2" class="card card-lg" style="display:none;">
      <div class="card-header">
        <div class="card-title"><i class="fa-solid fa-file-invoice-dollar text-cyan"></i>Loan Details</div>
        <span class="badge badge-active">Step 2 of 4</span>
      </div>
      <div class="form-section">
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Loan Amount <span class="req">*</span></label>
            <div class="input-group">
              <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <input id="b-amount" class="form-control" type="number" min="1" step="0.01" placeholder="e.g. 5000" />
              <span class="input-suffix">USDC</span>
            </div>
            <span class="field-error" id="b-amount-err"></span>
          </div>
          <div class="form-group">
            <label class="form-label">Number of Installments <span class="req">*</span></label>
            <select id="b-installments" class="form-control" onchange="updateLoanPreview()">
              <option value="">— Select —</option>
              <option value="1">1 installment (lump sum)</option>
              <option value="2">2 installments</option>
              <option value="3">3 installments</option>
              <option value="4">4 installments</option>
              <option value="5">5 installments</option>
              <option value="6">6 installments</option>
              <option value="7">7 installments</option>
              <option value="8">8 installments</option>
              <option value="9">9 installments</option>
              <option value="10">10 installments</option>
            </select>
            <span class="field-hint">Maximum 10 installments</span>
            <span class="field-error" id="b-installments-err"></span>
          </div>
        </div>

        <!-- Loan preview -->
        <div id="loan-preview" class="card" style="background:var(--bg-input); display:none; border-color:rgba(6,182,212,0.2);">
          <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">
            <i class="fa-solid fa-calculator"></i> Loan Preview (estimated based on 5% max rate)
          </div>
          <div class="col-3" style="gap:12px;">
            <div>
              <div class="stat-label" style="font-size:10px;">Principal</div>
              <div style="font-size:16px; font-weight:700; color:var(--text-primary); font-family:'JetBrains Mono',monospace;" id="prev-principal">—</div>
            </div>
            <div>
              <div class="stat-label" style="font-size:10px;">Est. Total</div>
              <div style="font-size:16px; font-weight:700; color:var(--cyan); font-family:'JetBrains Mono',monospace;" id="prev-total">—</div>
            </div>
            <div>
              <div class="stat-label" style="font-size:10px;">Per Installment</div>
              <div style="font-size:16px; font-weight:700; color:var(--green); font-family:'JetBrains Mono',monospace;" id="prev-inst">—</div>
            </div>
          </div>
          <div class="legal-banner legal-banner-info" style="margin-top:12px; font-size:11px;">
            <i class="fa-solid fa-info-circle"></i>
            Final interest rate is set by the lender (≤ 5%/month). This preview uses the maximum rate.
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Loan Purpose <span class="opt">(optional)</span></label>
          <textarea id="b-purpose" class="form-control" rows="2" placeholder="Brief description of how you intend to use the loan..."></textarea>
        </div>
      </div>
      <div class="flex" style="justify-content:space-between; margin-top:24px; gap:12px;">
        <button class="btn btn-secondary" onclick="borrowStep(1)"><i class="fa-solid fa-arrow-left"></i> Back</button>
        <button class="btn btn-primary" onclick="borrowStep(3)">Next: Collateral <i class="fa-solid fa-arrow-right"></i></button>
      </div>
    </div>

    <!-- Step 3: Collateral -->
    <div id="borrow-step-3" class="card card-lg" style="display:none;">
      <div class="card-header">
        <div class="card-title"><i class="fa-solid fa-shield-halved text-cyan"></i>Collateral</div>
        <span class="badge badge-active">Step 3 of 4</span>
      </div>

      <!-- Collateral Type Selector -->
      <div class="grid-2" style="margin-bottom:24px;">
        <div class="collateral-option selected" id="col-rwa-card" onclick="selectCollateralType('rwa')">
          <div class="check-mark">
            <svg width="12" height="12" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
          </div>
          <div class="collateral-icon" style="background:rgba(245,158,11,0.1);">🏠</div>
          <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">Real-World Asset (RWA)</div>
          <div style="font-size:12px; color:var(--text-muted); line-height:1.5;">Car, house, jewelry, land, or custom asset. Notarized document uploaded to IPFS. Hash stored on-chain.</div>
          <div class="badge badge-rwa" style="margin-top:12px;">⚖️ Off-chain enforcement</div>
        </div>
        <div class="collateral-option" id="col-crypto-card" onclick="selectCollateralType('crypto')">
          <div class="check-mark">
            <svg width="12" height="12" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
          </div>
          <div class="collateral-icon" style="background:rgba(6,182,212,0.1);">🔐</div>
          <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">Crypto Asset</div>
          <div style="font-size:12px; color:var(--text-muted); line-height:1.5;">USDC, ERC-20 tokens or ETH-wrapped. Locked in smart contract escrow. Released on full repayment.</div>
          <div class="badge badge-crypto" style="margin-top:12px;">⚡ On-chain enforcement</div>
        </div>
      </div>

      <!-- RWA Form -->
      <div id="col-rwa-form" class="form-section">
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Asset Type <span class="req">*</span></label>
            <select id="rwa-asset-type" class="form-control" onchange="handleRwaCustom(this)">
              <option value="">— Select asset —</option>
              <option value="Car">🚗 Car</option>
              <option value="Motorcycle">🏍️ Motorcycle</option>
              <option value="House">🏠 House / Apartment</option>
              <option value="Land">🌍 Land / Real Estate</option>
              <option value="Jewelry">💍 Jewelry</option>
              <option value="Art">🎨 Artwork / Collectible</option>
              <option value="Equipment">🔧 Equipment / Machinery</option>
              <option value="Vehicle">🚛 Commercial Vehicle</option>
              <option value="custom">✏️ Custom (specify below)</option>
            </select>
            <span class="field-error" id="rwa-asset-type-err"></span>
          </div>
          <div class="form-group" id="rwa-custom-group" style="display:none;">
            <label class="form-label">Custom Asset Type <span class="req">*</span></label>
            <input id="rwa-asset-custom" class="form-control" type="text" placeholder="e.g. Vintage watch collection" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Asset Description <span class="req">*</span></label>
          <textarea id="rwa-description" class="form-control" rows="3" placeholder="Detailed description: make, model, year, condition, serial number, etc."></textarea>
          <span class="field-error" id="rwa-description-err"></span>
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Estimated Value (USD) <span class="req">*</span></label>
            <div class="input-group">
              <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <input id="rwa-value" class="form-control" type="number" min="1" placeholder="e.g. 15000" />
              <span class="input-suffix">USD</span>
            </div>
            <span class="field-error" id="rwa-value-err"></span>
          </div>
          <div class="form-group">
            <label class="form-label">Country / Jurisdiction <span class="req">*</span></label>
            <input id="rwa-jurisdiction" class="form-control" type="text" placeholder="e.g. United States — California" />
            <span class="field-error" id="rwa-jurisdiction-err"></span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notarized Ownership Document <span class="req">*</span></label>
          <div class="upload-zone" id="rwa-upload-zone">
            <input type="file" id="rwa-doc-file" accept=".pdf,.jpg,.jpeg,.png" onchange="handleDocUpload(this)" />
            <div class="upload-icon">📄</div>
            <div class="upload-text">Drop file here or click to browse</div>
            <div class="upload-sub">PDF, JPG, PNG — Max 10MB — Notarized documents required</div>
          </div>
          <div id="rwa-doc-info" style="display:none; margin-top:10px;" class="card card-sm">
            <div class="flex items-center gap-3">
              <span style="font-size:24px;">📎</span>
              <div style="flex:1;">
                <div id="rwa-doc-name" style="font-size:13px; font-weight:600; color:var(--text-primary);"></div>
                <div id="rwa-doc-hash" class="mono text-muted" style="font-size:10px; margin-top:3px; word-break:break-all;"></div>
              </div>
              <span class="badge badge-active">Hash Computed ✓</span>
            </div>
          </div>
          <span class="field-error" id="rwa-doc-err"></span>
        </div>
        <div class="legal-banner legal-banner-warning">
          <i class="fa-solid fa-gavel" style="flex-shrink:0; margin-top:2px;"></i>
          <div>
            <strong>Off-chain Enforcement Notice:</strong> RWA collateral is legally binding only in your jurisdiction. In case of default, lenders must pursue legal remedies via local courts. ArcFi facilitates the digital agreement but does not enforce physical asset seizure.
          </div>
        </div>
      </div>

      <!-- Crypto Collateral Form -->
      <div id="col-crypto-form" class="form-section" style="display:none;">
        <div class="form-group">
          <label class="form-label">Collateral Token <span class="req">*</span></label>
          <div class="token-chips" id="crypto-token-chips">
            <button class="token-chip selected" onclick="selectCryptoToken(this,'usdc')">💵 USDC</button>
            <button class="token-chip" onclick="selectCryptoToken(this,'custom')">🔷 Custom ERC-20</button>
          </div>
        </div>
        <div id="crypto-custom-addr-group" class="form-group" style="display:none;">
          <label class="form-label">Token Contract Address <span class="req">*</span></label>
          <input id="crypto-token-addr" class="form-control mono" type="text" placeholder="0x..." />
          <span class="field-hint">ERC-20 contract address on Arc Testnet</span>
        </div>
        <div class="form-group">
          <label class="form-label">Collateral Amount <span class="req">*</span></label>
          <div class="input-group">
            <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a1 1 0 001-1V8a1 1 0 00-.293-.707l-5-5A1 1 0 0015 2H5a1 1 0 00-1 1v15a1 1 0 001 1z"/></svg>
            <input id="crypto-amount" class="form-control" type="number" min="0" step="0.000001" placeholder="e.g. 6000" oninput="updateCollateralRatio()" />
            <span class="input-suffix" id="crypto-token-symbol">USDC</span>
          </div>
          <span class="field-error" id="crypto-amount-err"></span>
        </div>
        <div class="form-group">
          <label class="form-label">Collateralization Ratio — <span id="ratio-display" class="text-cyan font-mono">120%</span></label>
          <input type="range" id="crypto-ratio" min="120" max="300" step="10" value="120" oninput="updateRatioDisplay(this.value)" />
          <div class="flex" style="justify-content:space-between; margin-top:4px;">
            <span class="text-xs text-muted">120% (Min)</span>
            <span class="text-xs text-muted">300% (Max protection)</span>
          </div>
        </div>

        <!-- Ratio indicator -->
        <div id="collateral-ratio-indicator" class="card card-sm" style="background:var(--bg-input);">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted">Collateral Coverage</span>
            <span id="ratio-coverage-text" class="badge badge-active font-mono">—</span>
          </div>
          <div class="progress-track" style="margin-top:10px;">
            <div class="progress-fill" id="ratio-bar" style="width:0%"></div>
          </div>
          <div class="flex items-center justify-between" style="margin-top:8px;">
            <span class="text-xs text-muted">Loan: <span class="font-mono" id="ratio-loan-val">$0</span></span>
            <span class="text-xs text-muted">Collateral: <span class="font-mono text-cyan" id="ratio-col-val">$0</span></span>
          </div>
        </div>

        <div class="legal-banner legal-banner-info">
          <i class="fa-solid fa-lock" style="flex-shrink:0; margin-top:2px;"></i>
          <div>
            <strong>On-chain Escrow:</strong> Your tokens will be locked in the smart contract upon submission. They are automatically released when the loan is fully repaid. In case of default (3+ days overdue), the lender can trigger liquidation.
          </div>
        </div>
      </div>

      <div class="flex" style="justify-content:space-between; margin-top:24px; gap:12px;">
        <button class="btn btn-secondary" onclick="borrowStep(2)"><i class="fa-solid fa-arrow-left"></i> Back</button>
        <button class="btn btn-primary" onclick="borrowStep(4)">Review Loan <i class="fa-solid fa-arrow-right"></i></button>
      </div>
    </div>

    <!-- Step 4: Review & Submit -->
    <div id="borrow-step-4" class="card card-lg" style="display:none;">
      <div class="card-header">
        <div class="card-title"><i class="fa-solid fa-clipboard-check text-cyan"></i>Review &amp; Submit</div>
        <span class="badge badge-active">Step 4 of 4</span>
      </div>
      <div id="loan-review-content" class="space-y-4"></div>
      <div class="legal-banner legal-banner-warning" style="margin-top:20px;">
        <i class="fa-solid fa-signature" style="flex-shrink:0; margin-top:2px;"></i>
        <div>
          By submitting, you digitally sign this loan request via your wallet. This creates a binding on-chain record on Arc Testnet. You acknowledge the terms, interest cap of 5%/month, and legal conditions of your selected collateral type.
        </div>
      </div>
      <div class="flex" style="justify-content:space-between; margin-top:24px; gap:12px;">
        <button class="btn btn-secondary" onclick="borrowStep(3)"><i class="fa-solid fa-arrow-left"></i> Back</button>
        <button class="btn btn-primary btn-lg" id="submit-loan-btn" onclick="submitLoan()">
          <i class="fa-solid fa-paper-plane"></i> Sign &amp; Submit Loan
        </button>
      </div>
    </div>
  </div>

  <!-- ══ PAGE: LEND ════════════════════════════════════════════════════════════ -->
  <div class="page" id="page-lend">
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="section-title"><i class="fa-solid fa-building-columns text-cyan" style="margin-right:8px;"></i>Lender Dashboard</div>
        <div class="section-sub" style="margin-bottom:0;">Review loan requests, approve or reject, set interest rates and disburse USDC.</div>
      </div>
      <button class="btn btn-primary" onclick="loadLenderLoans()">
        <i class="fa-solid fa-rotate"></i> Refresh
      </button>
    </div>

    <!-- Filter Tabs -->
    <div class="tabs" style="margin-bottom:20px;">
      <button class="tab-btn active" onclick="filterLenderLoans('all',this)">All Requests</button>
      <button class="tab-btn" onclick="filterLenderLoans('PENDING',this)">Pending</button>
      <button class="tab-btn" onclick="filterLenderLoans('ACTIVE',this)">Active</button>
      <button class="tab-btn" onclick="filterLenderLoans('COMPLETED',this)">Completed</button>
    </div>

    <!-- Loans Table -->
    <div class="card" style="padding:0;">
      <div class="table-container" style="border:none; border-radius:var(--radius-lg);">
        <table class="data-table" id="lender-loans-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Borrower</th>
              <th>Amount</th>
              <th>Installments</th>
              <th>Collateral</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="lender-loans-tbody">
            <tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🏦</div><div class="empty-title">No loans found</div><div class="empty-desc">Connect your wallet to view loan requests.</div></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ══ PAGE: DASHBOARD ═══════════════════════════════════════════════════════ -->
  <div class="page" id="page-dashboard">
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="section-title"><i class="fa-solid fa-chart-line text-cyan" style="margin-right:8px;"></i>My Dashboard</div>
        <div class="section-sub" style="margin-bottom:0;">Your personal loan and payment overview.</div>
      </div>
      <button class="btn btn-primary" onclick="loadDashboard()">
        <i class="fa-solid fa-rotate"></i> Refresh
      </button>
    </div>

    <!-- Stats -->
    <div class="col-4" id="dashboard-stats" style="margin-bottom:24px;">
      <div class="stat-card"><div class="accent-blob" style="background:var(--cyan)"></div><div class="stat-label">Active Loans</div><div class="stat-value" id="ds-active">—</div></div>
      <div class="stat-card"><div class="accent-blob" style="background:var(--blue)"></div><div class="stat-label">Total Borrowed</div><div class="stat-value" id="ds-borrowed">—</div></div>
      <div class="stat-card"><div class="accent-blob" style="background:var(--green)"></div><div class="stat-label">Total Remaining</div><div class="stat-value" id="ds-remaining">—</div></div>
      <div class="stat-card"><div class="accent-blob" style="background:var(--purple)"></div><div class="stat-label">Completed</div><div class="stat-value" id="ds-completed">—</div></div>
    </div>

    <!-- My Loans -->
    <div class="card" style="padding:0; margin-bottom:24px;">
      <div class="card-header" style="padding:20px 24px 0;">
        <div class="card-title"><i class="fa-solid fa-list text-cyan"></i>My Loans</div>
      </div>
      <div class="table-container" style="border:none; margin-top:16px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th><th>Amount</th><th>Rate</th><th>Installments</th><th>Progress</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="dashboard-loans-tbody">
            <tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No loans yet</div><div class="empty-desc">Connect your wallet and apply for a loan to get started.</div></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ══ PAGE: PAYMENTS ════════════════════════════════════════════════════════ -->
  <div class="page" id="page-payments">
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="section-title"><i class="fa-solid fa-credit-card text-cyan" style="margin-right:8px;"></i>Payment Center</div>
        <div class="section-sub" style="margin-bottom:0;">Manage installments, view history, and make payments.</div>
      </div>
      <button class="btn btn-primary" onclick="loadPayments()">
        <i class="fa-solid fa-rotate"></i> Refresh
      </button>
    </div>

    <div class="grid-2" style="gap:24px; align-items:start;">
      <!-- Left: Payment Engine -->
      <div class="space-y-4">
        <!-- Select Loan -->
        <div class="card">
          <div class="card-title" style="margin-bottom:14px;"><i class="fa-solid fa-file-invoice text-cyan"></i>Select Loan</div>
          <select id="pay-loan-select" class="form-control" onchange="loadLoanInstallments(this.value)">
            <option value="">— Select a loan —</option>
          </select>
        </div>

        <!-- Installment Schedule -->
        <div class="card" id="installments-card" style="display:none;">
          <div class="card-header">
            <div class="card-title"><i class="fa-solid fa-calendar-days text-cyan"></i>Installment Schedule</div>
            <span id="installments-progress-badge" class="badge badge-active"></span>
          </div>
          <!-- Progress -->
          <div style="margin-bottom:16px;">
            <div class="flex items-center justify-between" style="margin-bottom:6px;">
              <span class="text-sm text-secondary" id="pay-progress-label">—</span>
              <span class="text-sm font-mono text-cyan" id="pay-pct">0%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" id="pay-progress-bar" style="width:0%;"></div>
            </div>
          </div>
          <div class="space-y-3" id="installments-list"></div>
        </div>

        <!-- Pay Full Loan -->
        <div class="card" id="pay-full-card" style="display:none;">
          <div class="card-title" style="margin-bottom:14px;"><i class="fa-solid fa-circle-check text-green"></i>Pay Full Loan</div>
          <div class="detail-row">
            <span class="detail-label">Remaining Balance</span>
            <span class="detail-value mono text-red" id="pay-remaining-total">$0.00</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Pending Installments</span>
            <span class="detail-value" id="pay-pending-count">0</span>
          </div>
          <button class="btn btn-danger btn-full" style="margin-top:14px;" id="pay-full-btn" onclick="payFullLoan()">
            <i class="fa-solid fa-circle-check"></i> Repay Entire Loan
          </button>
        </div>
      </div>

      <!-- Right: Payment History -->
      <div class="space-y-4">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fa-solid fa-clock-rotate-left text-cyan"></i>Payment History</div>
          </div>
          <div id="payment-history-list" class="space-y-3">
            <div class="empty-state" style="padding:24px;">
              <div class="empty-icon" style="font-size:32px;">🧾</div>
              <div class="empty-title">No payments yet</div>
              <div class="empty-desc">Select a loan to view payment history.</div>
            </div>
          </div>
        </div>

        <!-- Wallet Balance -->
        <div class="card" style="background:var(--bg-input);">
          <div class="card-title" style="margin-bottom:14px; font-size:14px;"><i class="fa-solid fa-wallet text-cyan"></i>Wallet Balance</div>
          <div class="flex items-center justify-between">
            <div>
              <div class="stat-label" style="font-size:10px;">USDC Balance</div>
              <div class="stat-value" id="pay-wallet-balance" style="font-size:22px;">—</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="refreshWalletBalance()">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ PAGE: SETTINGS ════════════════════════════════════════════════════════ -->
  <div class="page" id="page-settings">
    <div class="section-title"><i class="fa-solid fa-gear text-cyan" style="margin-right:8px;"></i>Settings</div>
    <div class="section-sub">Configure contract addresses, network, and application preferences.</div>

    <div class="grid-2" style="gap:24px; align-items:start;">
      <!-- Contract Config -->
      <div class="card card-lg">
        <div class="card-title" style="margin-bottom:20px;"><i class="fa-solid fa-file-contract text-cyan"></i>Contract Configuration</div>
        <div class="form-section">
          <div class="form-group">
            <label class="form-label">LoanPlatform Contract Address</label>
            <div class="input-group">
              <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              <input id="cfg-contract" class="form-control mono" type="text" placeholder="0x..." />
            </div>
            <span class="field-hint">Deployed on Arc Testnet (Chain ID: 5042002)</span>
          </div>
          <div class="form-group">
            <label class="form-label">USDC Token Address</label>
            <div class="input-group">
              <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <input id="cfg-usdc" class="form-control mono" type="text" placeholder="0x..." />
            </div>
            <span class="field-hint">USDC contract address on Arc Testnet</span>
          </div>
          <div class="form-group">
            <label class="form-label">Pinata API Key <span class="opt">(for IPFS uploads)</span></label>
            <input id="cfg-pinata-key" class="form-control" type="password" placeholder="••••••••••••••" />
          </div>
          <div class="form-group">
            <label class="form-label">Pinata Secret Key <span class="opt">(for IPFS uploads)</span></label>
            <input id="cfg-pinata-secret" class="form-control" type="password" placeholder="••••••••••••••" />
          </div>
          <button class="btn btn-primary btn-full" onclick="saveSettings()">
            <i class="fa-solid fa-floppy-disk"></i> Save Configuration
          </button>
          <div id="settings-saved-msg" class="legal-banner legal-banner-info" style="display:none;">
            <i class="fa-solid fa-check-circle"></i>
            <span>Settings saved. Reload the page to apply contract addresses.</span>
          </div>
        </div>
      </div>

      <!-- Network Info -->
      <div class="space-y-4">
        <div class="card">
          <div class="card-title" style="margin-bottom:16px;"><i class="fa-solid fa-network-wired text-cyan"></i>Network Information</div>
          <div class="detail-row"><span class="detail-label">Network</span><span class="detail-value">Arc Testnet</span></div>
          <div class="detail-row"><span class="detail-label">Chain ID</span><span class="detail-value mono">5042002</span></div>
          <div class="detail-row"><span class="detail-label">RPC URL</span><span class="detail-value mono text-xs">https://rpc.arc.fun</span></div>
          <div class="detail-row"><span class="detail-label">Explorer</span>
            <a href="https://explorer.arc.fun" target="_blank" class="underline-link">explorer.arc.fun ↗</a>
          </div>
          <div class="detail-row"><span class="detail-label">Currency</span><span class="detail-value">ARC</span></div>
          <button class="btn btn-secondary btn-full btn-sm" style="margin-top:14px;" onclick="addArcNetwork()">
            <i class="fa-solid fa-plus"></i> Add Arc Network to Wallet
          </button>
        </div>

        <div class="card">
          <div class="card-title" style="margin-bottom:16px;"><i class="fa-solid fa-palette text-cyan"></i>Appearance</div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-secondary">Theme</span>
            <div class="token-chips">
              <button class="token-chip" id="theme-dark-btn" onclick="setTheme('dark')">🌙 Dark</button>
              <button class="token-chip" id="theme-light-btn" onclick="setTheme('light')">☀️ Light</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title" style="margin-bottom:14px; font-size:14px;"><i class="fa-solid fa-file-contract text-cyan"></i>Smart Contract Info</div>
          <div class="detail-row"><span class="detail-label">Max Interest Rate</span><span class="detail-value text-green">5% / month (fixed)</span></div>
          <div class="detail-row"><span class="detail-label">Min Collateral Ratio</span><span class="detail-value">120% (crypto)</span></div>
          <div class="detail-row"><span class="detail-label">Max Installments</span><span class="detail-value">10</span></div>
          <div class="detail-row"><span class="detail-label">Liquidation Grace</span><span class="detail-value">3 days overdue</span></div>
          <div class="detail-row"><span class="detail-label">Interest Model</span><span class="detail-value text-green">Fixed (no compounding)</span></div>
          <div class="detail-row" style="border:none;"><span class="detail-label">Custody Model</span><span class="detail-value">Non-custodial</span></div>
        </div>
      </div>
    </div>
  </div>

</main>

<!-- ════ TOAST CONTAINER ════ -->
<div id="toast-container"></div>

<!-- ════ MODAL CONTAINER ════ -->
<div id="modal-container"></div>

<!-- ════ CHATBOT TOGGLE ════ -->
<button id="chatbot-toggle" title="ArcFi AI Agent" onclick="window.chatbot && window.chatbot.toggle()">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z"/>
  </svg>
  <div id="chat-unread">!</div>
</button>

<!-- ════ CHATBOT PANEL ════ -->
<div id="chatbot-panel">
  <div class="chat-header">
    <div class="chat-avatar">🤖</div>
    <div>
      <div class="chat-agent-name">ArcFi AI Agent</div>
      <div class="chat-agent-status">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse-dot 2s infinite;display:inline-block;"></span>
        Online · Arc Testnet
      </div>
    </div>
    <button onclick="window.chatbot && window.chatbot.toggle()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">&times;</button>
  </div>
  <div class="chat-messages" id="chat-messages"></div>
  <div id="chat-typing" style="padding:8px 16px; display:none;">
    <div style="display:flex; align-items:center; gap:4px;">
      <div class="chat-typing"><span></span><span></span><span></span></div>
    </div>
  </div>
  <div class="chat-quick-btns">
    <button class="chat-quick-btn" onclick="chatQuick('Pay next installment')">💸 Pay next</button>
    <button class="chat-quick-btn" onclick="chatQuick('How much do I owe?')">💰 Balance</button>
    <button class="chat-quick-btn" onclick="chatQuick('Show payment history')">📋 History</button>
    <button class="chat-quick-btn" onclick="chatQuick('help')">❓ Help</button>
  </div>
  <div class="chat-input-row">
    <input class="chat-input" id="chat-input" type="text" placeholder="Ask me about your loans..." onkeypress="if(event.key==='Enter')sendChatMessage()" />
    <button class="chat-send-btn" onclick="sendChatMessage()">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
    </button>
  </div>
</div>

<!-- ════ SCRIPTS ════ -->
<script src="https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js" crossorigin="anonymous"></script>
<script src="/static/contractABI.js"></script>
<script src="/static/web3Manager.js"></script>
<script src="/static/ui.js"></script>
<script src="/static/chatbot.js"></script>
<script src="/static/app.js"></script>
</body>
</html>`)
})

// ── API: Health ───────────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', network: 'Arc Testnet', chainId: 5042002 }))

// ── API: Receipt storage (in-memory for demo, use D1 for production) ─────────
const receipts: Map<string, object> = new Map()

app.post('/api/receipts', async (c) => {
  try {
    const body = await c.req.json()
    const id = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    receipts.set(id, { ...body, id, createdAt: new Date().toISOString() })
    return c.json({ success: true, id })
  } catch {
    return c.json({ error: 'Invalid body' }, 400)
  }
})

app.get('/api/receipts/:id', (c) => {
  const r = receipts.get(c.req.param('id'))
  if (!r) return c.json({ error: 'Not found' }, 404)
  return c.json(r)
})

// ── API: Loan metadata offchain cache ─────────────────────────────────────────
const loanMeta: Map<string, object> = new Map()

app.post('/api/loans/meta', async (c) => {
  try {
    const body = await c.req.json()
    const { loanId, ...data } = body as any
    if (!loanId) return c.json({ error: 'loanId required' }, 400)
    loanMeta.set(loanId.toString(), { loanId, ...data, updatedAt: new Date().toISOString() })
    return c.json({ success: true })
  } catch {
    return c.json({ error: 'Invalid body' }, 400)
  }
})

app.get('/api/loans/meta/:loanId', (c) => {
  const m = loanMeta.get(c.req.param('loanId'))
  return c.json(m || {})
})

export default app
