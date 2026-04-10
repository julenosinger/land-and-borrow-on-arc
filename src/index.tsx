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
    <button class="nav-btn" data-page="marketplace" onclick="showPage('marketplace')">
      <i class="fa-solid fa-store"></i> Marketplace
    </button>
    <button class="nav-btn" data-page="borrow" onclick="showPage('borrow')">
      <i class="fa-solid fa-hand-holding-dollar"></i> Borrow
    </button>
    <button class="nav-btn" data-page="lend" onclick="showPage('lend')">
      <i class="fa-solid fa-building-columns"></i> Lend
    </button>
    <button class="nav-btn" data-page="my-lending" onclick="showPage('my-lending')">
      <i class="fa-solid fa-coins"></i> My Lending
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
          <button class="btn btn-primary btn-lg" onclick="showPage('marketplace')">
            <i class="fa-solid fa-store"></i> Browse Offers
          </button>
          <button class="btn btn-secondary btn-lg" onclick="showPage('borrow')">
            <i class="fa-solid fa-hand-holding-dollar"></i> Apply for Loan
          </button>
          <button class="btn btn-ghost btn-lg" onclick="showPage('lend')">
            <i class="fa-solid fa-building-columns"></i> Lend &amp; Earn
          </button>
        </div>
      </div>

        <div class="col-4" style="margin-top:48px; max-width:900px; margin-left:auto; margin-right:auto;">
        <div class="stat-card cyan">
          <div class="accent-blob" style="background:var(--cyan)"></div>
          <div class="stat-label">Active Offers</div>
          <div class="stat-value" id="home-stat-offers">—</div>
          <div class="stat-sub">On Marketplace</div>
        </div>
        <div class="stat-card blue">
          <div class="accent-blob" style="background:var(--blue)"></div>
          <div class="stat-label">Total Loans</div>
          <div class="stat-value" id="home-stat-loans">—</div>
          <div class="stat-sub">Active on Arc Testnet</div>
        </div>
        <div class="stat-card" style="border-color:rgba(16,185,129,0.25)">
          <div class="accent-blob" style="background:var(--green)"></div>
          <div class="stat-label">Total Liquidity</div>
          <div class="stat-value" id="home-stat-vol">—</div>
          <div class="stat-sub">USDC in pool</div>
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

  <!-- ══ PAGE: MARKETPLACE ═════════════════════════════════════════════════════ -->
  <div class="page" id="page-marketplace">
    <div class="flex items-center justify-between mb-6" style="flex-wrap:wrap; gap:12px;">
      <div>
        <div class="section-title"><i class="fa-solid fa-store text-cyan" style="margin-right:8px;"></i>Loan Marketplace</div>
        <div class="section-sub" style="margin-bottom:0;">Browse active lender offers. Select one to apply with pre-filled terms.</div>
      </div>
      <div class="flex" style="gap:10px; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-primary" onclick="showPage('lend')">
          <i class="fa-solid fa-plus"></i> Create Offer
        </button>
        <button class="btn btn-secondary" onclick="loadMarketplace()">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
    </div>

    <!-- Marketplace Stats -->
    <div class="col-4" id="marketplace-stats" style="margin-bottom:24px;">
      <div class="stat-card cyan"><div class="accent-blob" style="background:var(--cyan)"></div><div class="stat-label">Active Offers</div><div class="stat-value" id="mp-stat-offers">—</div></div>
      <div class="stat-card blue"><div class="accent-blob" style="background:var(--blue)"></div><div class="stat-label">Total Liquidity</div><div class="stat-value" id="mp-stat-liquidity">—</div></div>
      <div class="stat-card" style="border-color:rgba(16,185,129,0.25)"><div class="accent-blob" style="background:var(--green)"></div><div class="stat-label">Avg Interest Rate</div><div class="stat-value" id="mp-stat-rate">—</div></div>
      <div class="stat-card"><div class="accent-blob" style="background:var(--purple)"></div><div class="stat-label">Loans Issued</div><div class="stat-value" id="mp-stat-loans">—</div></div>
    </div>

    <!-- Filters -->
    <div class="card" style="margin-bottom:20px; padding:20px;">
      <div class="card-title" style="margin-bottom:14px; font-size:14px;"><i class="fa-solid fa-filter text-cyan"></i>Filters</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11px;">Min Amount (USDC)</label>
          <input id="mp-filter-min" class="form-control" type="number" placeholder="e.g. 100" oninput="applyMarketplaceFilters()" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11px;">Max Amount (USDC)</label>
          <input id="mp-filter-max" class="form-control" type="number" placeholder="e.g. 50000" oninput="applyMarketplaceFilters()" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11px;">Max Rate (%/mo)</label>
          <input id="mp-filter-rate" class="form-control" type="number" min="0" max="5" step="0.1" placeholder="e.g. 3" oninput="applyMarketplaceFilters()" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11px;">Max Installments</label>
          <select id="mp-filter-inst" class="form-control" onchange="applyMarketplaceFilters()">
            <option value="">Any</option>
            <option value="1">1</option><option value="3">3</option>
            <option value="6">6</option><option value="10">10</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11px;">Collateral Type</label>
          <select id="mp-filter-col" class="form-control" onchange="applyMarketplaceFilters()">
            <option value="">Any</option>
            <option value="1">RWA Only</option>
            <option value="2">Crypto Only</option>
            <option value="3">Both</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11px;">Lender Type</label>
          <select id="mp-filter-type" class="form-control" onchange="applyMarketplaceFilters()">
            <option value="">Any</option>
            <option value="0">Individual</option>
            <option value="1">Company</option>
          </select>
        </div>
        <div class="form-group" style="margin:0; display:flex; align-items:flex-end;">
          <button class="btn btn-secondary btn-sm btn-full" onclick="clearMarketplaceFilters()">
            <i class="fa-solid fa-xmark"></i> Clear
          </button>
        </div>
      </div>
    </div>

    <!-- Offer Listings -->
    <div id="marketplace-listings" class="grid-auto">
      <div class="card" style="padding:48px; text-align:center; grid-column:1/-1;">
        <div class="empty-icon" style="font-size:48px; margin-bottom:12px;">🏪</div>
        <div class="empty-title">Loading marketplace…</div>
        <div class="empty-desc">Fetching active lender offers from Arc Testnet.</div>
      </div>
    </div>

    <!-- Legal Disclaimer -->
    <div style="margin-top:24px;">
      <div class="legal-banner legal-banner-warning">
        <i class="fa-solid fa-scale-balanced" style="flex-shrink:0; margin-top:2px;"></i>
        <div>
          <strong>Non-Custodial Platform Disclaimer:</strong> ArcFi is a non-custodial protocol. Lenders assume full risk of capital deployment. RWA collateral enforcement is <strong>off-chain</strong>. Crypto collateral enforcement is <strong>on-chain</strong> and automated. Interest rates are fixed and do not compound. This is not financial advice.
        </div>
      </div>
    </div>
  </div>

  <!-- ══ PAGE: MY LENDING ═══════════════════════════════════════════════════════ -->
  <div class="page" id="page-my-lending">
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="section-title"><i class="fa-solid fa-coins text-cyan" style="margin-right:8px;"></i>My Lending Activity</div>
        <div class="section-sub" style="margin-bottom:0;">Manage your offers, track utilization, ROI and active loans.</div>
      </div>
      <div class="flex" style="gap:10px;">
        <button class="btn btn-primary" onclick="showPage('lend')">
          <i class="fa-solid fa-plus"></i> New Offer
        </button>
        <button class="btn btn-secondary" onclick="loadMyLending()">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
    </div>

    <!-- Summary Stats -->
    <div class="col-4" style="margin-bottom:24px;">
      <div class="stat-card cyan"><div class="accent-blob" style="background:var(--cyan)"></div><div class="stat-label">Active Offers</div><div class="stat-value" id="ml-stat-offers">—</div></div>
      <div class="stat-card blue"><div class="accent-blob" style="background:var(--blue)"></div><div class="stat-label">Total Deployed</div><div class="stat-value" id="ml-stat-deployed">—</div></div>
      <div class="stat-card" style="border-color:rgba(16,185,129,0.25)"><div class="accent-blob" style="background:var(--green)"></div><div class="stat-label">Total Repaid</div><div class="stat-value" id="ml-stat-repaid">—</div></div>
      <div class="stat-card"><div class="accent-blob" style="background:var(--purple)"></div><div class="stat-label">Active Loans</div><div class="stat-value" id="ml-stat-active-loans">—</div></div>
    </div>

    <!-- My Offers Table -->
    <div class="card" style="padding:0; margin-bottom:24px;">
      <div class="card-header" style="padding:20px 24px 0;">
        <div class="card-title"><i class="fa-solid fa-list text-cyan"></i>My Offers</div>
      </div>
      <div class="table-container" style="border:none; margin-top:16px;">
        <table class="data-table" id="my-offers-table">
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Rate</th><th>Liquidity</th><th>Allocated</th><th>Utilization</th><th>Loans</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="my-offers-tbody">
            <tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🔗</div><div class="empty-title">Connect wallet to view your offers</div></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Active Loans from my offers -->
    <div class="card" style="padding:0;">
      <div class="card-header" style="padding:20px 24px 0;">
        <div class="card-title"><i class="fa-solid fa-file-contract text-cyan"></i>Active Loans (from my offers)</div>
      </div>
      <div class="table-container" style="border:none; margin-top:16px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Loan ID</th><th>Borrower</th><th>Amount</th><th>Progress</th><th>Collateral</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="ml-active-loans-tbody">
            <tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No active loans from your offers</div></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ══ PAGE: BORROW ══════════════════════════════════════════════════════════ -->
  <div class="page" id="page-borrow">

    <!-- Offer pre-fill banner (shown when applying from marketplace) -->
    <div id="borrow-offer-banner" class="borrow-offer-banner" style="display:none;">
      <i class="fa-solid fa-store"></i>
      <span id="borrow-offer-banner-text">Applying from a marketplace offer — terms pre-filled.</span>
      <button onclick="document.getElementById('borrow-offer-banner').style.display='none'" class="borrow-offer-banner-close">&times;</button>
    </div>

    <!-- ── BORROW WIZARD WRAPPER ── -->
    <div class="borrow-wizard">

      <!-- ── WIZARD HEADER ── -->
      <div class="bw-header">
        <div class="bw-title-row">
          <div class="bw-icon-wrap"><i class="fa-solid fa-hand-holding-dollar"></i></div>
          <div>
            <h1 class="bw-title">Apply for a Loan</h1>
            <p class="bw-subtitle">Complete each step to submit your request on Arc Testnet — USDC, non-custodial, transparent.</p>
          </div>
        </div>

        <!-- ── STEPPER ── -->
        <div class="bw-stepper" id="borrow-steps">
          <div class="bw-step active" id="step-1">
            <div class="bw-step-bubble">
              <span class="bw-step-num">1</span>
              <svg class="bw-step-check" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <span class="bw-step-label">Personal Info</span>
          </div>
          <div class="bw-step-line" id="step-line-1"></div>
          <div class="bw-step" id="step-2">
            <div class="bw-step-bubble">
              <span class="bw-step-num">2</span>
              <svg class="bw-step-check" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <span class="bw-step-label">Loan Details</span>
          </div>
          <div class="bw-step-line" id="step-line-2"></div>
          <div class="bw-step" id="step-3">
            <div class="bw-step-bubble">
              <span class="bw-step-num">3</span>
              <svg class="bw-step-check" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <span class="bw-step-label">Collateral</span>
          </div>
          <div class="bw-step-line" id="step-line-3"></div>
          <div class="bw-step" id="step-4">
            <div class="bw-step-bubble">
              <span class="bw-step-num">4</span>
              <svg class="bw-step-check" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <span class="bw-step-label">Review</span>
          </div>
        </div>

        <!-- ── PROGRESS BAR ── -->
        <div class="bw-progress-track">
          <div class="bw-progress-fill" id="bw-progress-fill" style="width:0%"></div>
          <span class="bw-progress-label" id="bw-progress-label">Step 1 of 4</span>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════
           STEP 1 — PERSONAL INFORMATION
           ════════════════════════════════════════════════════════ -->
      <div id="borrow-step-1" class="bw-step-content bw-animate-in">

        <!-- Card: Identity -->
        <div class="bw-card">
          <div class="bw-card-eyebrow"><i class="fa-solid fa-id-card"></i> Identity</div>
          <div class="bw-form-grid">
            <div class="bw-field">
              <label class="bw-label" for="b-fullname">Full name <span class="bw-req">*</span></label>
              <div class="bw-input-wrap">
                <input id="b-fullname" class="bw-input" type="text" placeholder="e.g. John Michael Smith"
                  onblur="bwValidateField('b-fullname')" oninput="bwClearField('b-fullname')" />
                <i class="fa-solid fa-check bw-input-check" id="b-fullname-check"></i>
              </div>
              <span class="bw-field-err" id="b-fullname-err"></span>
            </div>
            <div class="bw-field">
              <label class="bw-label" for="b-email">Email address <span class="bw-req">*</span></label>
              <div class="bw-input-wrap">
                <input id="b-email" class="bw-input" type="email" placeholder="john@example.com"
                  onblur="bwValidateField('b-email')" oninput="bwClearField('b-email')" />
                <i class="fa-solid fa-check bw-input-check" id="b-email-check"></i>
              </div>
              <span class="bw-field-err" id="b-email-err"></span>
            </div>
          </div>
        </div>

        <!-- Card: Location -->
        <div class="bw-card">
          <div class="bw-card-eyebrow"><i class="fa-solid fa-location-dot"></i> Location</div>
          <div class="bw-form-grid">
            <div class="bw-field">
              <label class="bw-label" for="b-country">Country <span class="bw-req">*</span></label>
              <div class="bw-input-wrap">
                <select id="b-country" class="bw-input bw-select"
                  onblur="bwValidateField('b-country')" onchange="bwClearField('b-country')">
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
                <i class="fa-solid fa-check bw-input-check" id="b-country-check"></i>
              </div>
              <span class="bw-field-err" id="b-country-err"></span>
            </div>
            <div class="bw-field">
              <label class="bw-label" for="b-city">City <span class="bw-req">*</span></label>
              <div class="bw-input-wrap">
                <input id="b-city" class="bw-input" type="text" placeholder="e.g. New York"
                  onblur="bwValidateField('b-city')" oninput="bwClearField('b-city')" />
                <i class="fa-solid fa-check bw-input-check" id="b-city-check"></i>
              </div>
              <span class="bw-field-err" id="b-city-err"></span>
            </div>
          </div>
        </div>

        <!-- Card: Profile -->
        <div class="bw-card">
          <div class="bw-card-eyebrow"><i class="fa-solid fa-user-circle"></i> Profile</div>

          <!-- Borrower type toggle -->
          <div class="bw-field" style="margin-bottom:20px;">
            <label class="bw-label">Borrower type <span class="bw-req">*</span></label>
            <div class="bw-type-toggle">
              <button class="bw-type-btn selected" data-borrower-type="individual"
                onclick="selectBorrowerType(this,'individual')">
                <span class="bw-type-icon">👤</span>
                <span class="bw-type-title">Individual</span>
                <span class="bw-type-desc">Personal loan request</span>
              </button>
              <button class="bw-type-btn" data-borrower-type="company"
                onclick="selectBorrowerType(this,'company')">
                <span class="bw-type-icon">🏢</span>
                <span class="bw-type-title">Company</span>
                <span class="bw-type-desc">Business loan request</span>
              </button>
            </div>
          </div>

          <!-- Company notice (shown when Company selected) -->
          <div id="bw-company-notice" class="bw-info-banner" style="display:none;">
            <i class="fa-solid fa-circle-info"></i>
            <span>Additional verification documents may be required for company borrowers.</span>
          </div>

          <div class="bw-field">
            <label class="bw-label" for="b-employment">
              Employment status
              <span class="bw-optional">Optional</span>
            </label>
            <select id="b-employment" class="bw-input bw-select">
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
        </div>

        <!-- Step footer -->
        <div class="bw-step-footer">
          <div></div>
          <button class="bw-btn-primary" onclick="borrowStep(2)">
            Continue to Loan Details <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════
           STEP 2 — LOAN DETAILS
           ════════════════════════════════════════════════════════ -->
      <div id="borrow-step-2" class="bw-step-content" style="display:none;">

        <!-- Main inputs card -->
        <div class="bw-card">
          <div class="bw-card-eyebrow"><i class="fa-solid fa-sliders"></i> Configure your loan</div>
          <div class="bw-form-grid">
            <!-- Amount -->
            <div class="bw-field">
              <label class="bw-label" for="b-amount">Loan amount <span class="bw-req">*</span></label>
              <div class="bw-input-wrap bw-input-affix">
                <span class="bw-prefix-icon">
                  <i class="fa-solid fa-dollar-sign"></i>
                </span>
                <input id="b-amount" class="bw-input bw-input-with-prefix" type="number"
                  min="1" step="0.01" placeholder="5 000"
                  onblur="bwValidateField('b-amount')" oninput="bwClearField('b-amount'); updateLoanPreview()" />
                <span class="bw-suffix">USDC</span>
                <i class="fa-solid fa-check bw-input-check" id="b-amount-check"></i>
              </div>
              <span class="bw-field-err" id="b-amount-err"></span>
            </div>

            <!-- Installments -->
            <div class="bw-field">
              <label class="bw-label" for="b-installments">Number of installments <span class="bw-req">*</span></label>
              <div class="bw-input-wrap">
                <select id="b-installments" class="bw-input bw-select"
                  onchange="updateLoanPreview(); bwClearField('b-installments')"
                  onblur="bwValidateField('b-installments')">
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
                <i class="fa-solid fa-check bw-input-check" id="b-installments-check"></i>
              </div>
              <span class="bw-field-hint">Maximum 10 installments</span>
              <span class="bw-field-err" id="b-installments-err"></span>
            </div>
          </div>
        </div>

        <!-- Live Calculator card -->
        <div class="bw-calc-card" id="loan-preview" style="display:none;">
          <div class="bw-calc-header">
            <i class="fa-solid fa-calculator"></i>
            <span>Live Payment Calculator</span>
            <span class="bw-calc-note">Based on max rate (5%/month)</span>
          </div>
          <div class="bw-calc-grid">
            <div class="bw-calc-cell">
              <span class="bw-calc-label">Principal</span>
              <span class="bw-calc-value" id="prev-principal">—</span>
            </div>
            <div class="bw-calc-cell bw-calc-cell-accent">
              <span class="bw-calc-label">Total repayment</span>
              <span class="bw-calc-value bw-calc-value-cyan" id="prev-total">—</span>
            </div>
            <div class="bw-calc-cell">
              <span class="bw-calc-label">Per installment</span>
              <span class="bw-calc-value bw-calc-value-green" id="prev-inst">—</span>
            </div>
            <div class="bw-calc-cell">
              <span class="bw-calc-label">Total interest</span>
              <span class="bw-calc-value bw-calc-value-muted" id="prev-interest">—</span>
            </div>
          </div>
          <div class="bw-calc-note-banner">
            <i class="fa-solid fa-circle-info"></i>
            Final rate is set by your lender (≤ 5%/month fixed, no compounding).
          </div>
        </div>

        <!-- Loan purpose card -->
        <div class="bw-card">
          <div class="bw-card-eyebrow"><i class="fa-solid fa-tag"></i> Loan purpose <span class="bw-optional">Optional</span></div>

          <!-- Purpose chips -->
          <div class="bw-field" style="margin-bottom:16px;">
            <label class="bw-label">Select a category</label>
            <div class="bw-purpose-chips" id="bw-purpose-chips">
              <button class="bw-purpose-chip" onclick="selectLoanPurpose(this,'Business')">💼 Business</button>
              <button class="bw-purpose-chip" onclick="selectLoanPurpose(this,'Personal')">👤 Personal</button>
              <button class="bw-purpose-chip" onclick="selectLoanPurpose(this,'Emergency')">🚨 Emergency</button>
              <button class="bw-purpose-chip" onclick="selectLoanPurpose(this,'Investment')">📈 Investment</button>
              <button class="bw-purpose-chip" onclick="selectLoanPurpose(this,'Education')">🎓 Education</button>
              <button class="bw-purpose-chip" onclick="selectLoanPurpose(this,'Medical')">🏥 Medical</button>
              <button class="bw-purpose-chip" onclick="selectLoanPurpose(this,'Custom')">✏️ Other</button>
            </div>
          </div>
          <div class="bw-field">
            <label class="bw-label" for="b-purpose">Additional details <span class="bw-optional">Optional</span></label>
            <textarea id="b-purpose" class="bw-input bw-textarea" rows="2"
              placeholder="Brief description of how you plan to use the funds…"></textarea>
          </div>
        </div>

        <div class="bw-step-footer">
          <button class="bw-btn-secondary" onclick="borrowStep(1)"><i class="fa-solid fa-arrow-left"></i> Back</button>
          <button class="bw-btn-primary" onclick="borrowStep(3)">Continue to Collateral <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════
           STEP 3 — COLLATERAL
           ════════════════════════════════════════════════════════ -->
      <div id="borrow-step-3" class="bw-step-content" style="display:none;">

        <!-- Collateral type selector -->
        <div class="bw-collateral-intro">
          <h3 class="bw-collateral-intro-title">Choose your collateral type</h3>
          <p class="bw-collateral-intro-sub">Select how you want to secure this loan. You can only choose one type.</p>
        </div>

        <div class="bw-collateral-cards">
          <div class="bw-col-card selected" id="col-rwa-card" onclick="selectCollateralType('rwa')">
            <div class="bw-col-card-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div class="bw-col-card-icon bw-col-icon-rwa">🏠</div>
            <div class="bw-col-card-body">
              <div class="bw-col-card-title">Real-World Asset (RWA)</div>
              <div class="bw-col-card-desc">Car, house, jewelry, land or any physical asset. Notarized document uploaded to IPFS. Hash stored on-chain.</div>
              <div class="bw-col-card-tag bw-col-tag-rwa">⚖️ Off-chain enforcement</div>
            </div>
          </div>
          <div class="bw-col-card" id="col-crypto-card" onclick="selectCollateralType('crypto')">
            <div class="bw-col-card-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div class="bw-col-card-icon bw-col-icon-crypto">🔐</div>
            <div class="bw-col-card-body">
              <div class="bw-col-card-title">Crypto Asset</div>
              <div class="bw-col-card-desc">USDC or any ERC-20 token. Locked in smart-contract escrow. Automatically released on full repayment.</div>
              <div class="bw-col-card-tag bw-col-tag-crypto">⚡ On-chain enforcement</div>
            </div>
          </div>
        </div>

        <!-- ── RWA FORM (progressive disclosure) ── -->
        <div id="col-rwa-form" class="bw-collateral-form">

          <div class="bw-card">
            <div class="bw-card-eyebrow"><i class="fa-solid fa-file-contract"></i> Asset details</div>
            <div class="bw-form-grid">
              <div class="bw-field">
                <label class="bw-label" for="rwa-asset-type">Asset type <span class="bw-req">*</span></label>
                <div class="bw-input-wrap">
                  <select id="rwa-asset-type" class="bw-input bw-select"
                    onchange="handleRwaCustom(this); bwClearField('rwa-asset-type')"
                    onblur="bwValidateField('rwa-asset-type')">
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
                  <i class="fa-solid fa-check bw-input-check" id="rwa-asset-type-check"></i>
                </div>
                <span class="bw-field-err" id="rwa-asset-type-err"></span>
              </div>

              <div class="bw-field" id="rwa-custom-group" style="display:none;">
                <label class="bw-label" for="rwa-asset-custom">Custom asset type <span class="bw-req">*</span></label>
                <div class="bw-input-wrap">
                  <input id="rwa-asset-custom" class="bw-input" type="text" placeholder="e.g. Vintage watch collection" />
                </div>
              </div>
            </div>

            <div class="bw-field">
              <label class="bw-label" for="rwa-description">Asset description <span class="bw-req">*</span></label>
              <textarea id="rwa-description" class="bw-input bw-textarea" rows="3"
                placeholder="Make, model, year, condition, serial number, notable features…"
                onblur="bwValidateField('rwa-description')" oninput="bwClearField('rwa-description')"></textarea>
              <span class="bw-field-err" id="rwa-description-err"></span>
            </div>

            <div class="bw-form-grid">
              <div class="bw-field">
                <label class="bw-label" for="rwa-value">Estimated value (USD) <span class="bw-req">*</span></label>
                <div class="bw-input-wrap bw-input-affix">
                  <span class="bw-prefix-icon"><i class="fa-solid fa-dollar-sign"></i></span>
                  <input id="rwa-value" class="bw-input bw-input-with-prefix" type="number"
                    min="1" placeholder="15 000"
                    onblur="bwValidateField('rwa-value')" oninput="bwClearField('rwa-value')" />
                  <span class="bw-suffix">USD</span>
                </div>
                <span class="bw-field-err" id="rwa-value-err"></span>
              </div>

              <div class="bw-field">
                <label class="bw-label" for="rwa-jurisdiction">Country / Jurisdiction <span class="bw-req">*</span></label>
                <div class="bw-input-wrap">
                  <input id="rwa-jurisdiction" class="bw-input" type="text"
                    placeholder="e.g. United States — California"
                    onblur="bwValidateField('rwa-jurisdiction')" oninput="bwClearField('rwa-jurisdiction')" />
                  <i class="fa-solid fa-check bw-input-check" id="rwa-jurisdiction-check"></i>
                </div>
                <span class="bw-field-err" id="rwa-jurisdiction-err"></span>
              </div>
            </div>
          </div>

          <!-- Document upload -->
          <div class="bw-card">
            <div class="bw-card-eyebrow"><i class="fa-solid fa-upload"></i> Ownership document <span class="bw-req">*</span></div>
            <p class="bw-card-hint">Upload a notarized PDF, JPG or PNG. The file is hashed (SHA-256) and optionally pinned to IPFS. Only the hash is stored on-chain — the original file is never public.</p>

            <div class="bw-upload-zone" id="rwa-upload-zone">
              <input type="file" id="rwa-doc-file" accept=".pdf,.jpg,.jpeg,.png" onchange="handleDocUpload(this)" />
              <div class="bw-upload-icon">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <div class="bw-upload-main">Drop file here or <span class="bw-upload-browse">browse</span></div>
              <div class="bw-upload-sub">PDF, JPG, PNG · Max 10 MB · Notarized document required</div>
            </div>

            <div id="rwa-doc-info" class="bw-doc-info" style="display:none;">
              <div class="bw-doc-info-icon">📎</div>
              <div class="bw-doc-info-body">
                <div id="rwa-doc-name" class="bw-doc-name"></div>
                <div id="rwa-doc-hash" class="bw-doc-hash"></div>
              </div>
              <span class="bw-doc-badge"><i class="fa-solid fa-check"></i> Hash computed</span>
            </div>
            <span class="bw-field-err" id="rwa-doc-err"></span>
          </div>

          <!-- RWA legal notice -->
          <div class="bw-legal-notice bw-legal-warning">
            <i class="fa-solid fa-gavel bw-legal-icon"></i>
            <div>
              <strong>Off-chain enforcement notice:</strong> RWA collateral is legally binding only in your jurisdiction. In case of default, lenders must pursue remedies via local courts. ArcFi facilitates the digital agreement but does not enforce physical asset seizure.
            </div>
          </div>
        </div>

        <!-- ── CRYPTO FORM (progressive disclosure) ── -->
        <div id="col-crypto-form" class="bw-collateral-form" style="display:none;">

          <div class="bw-card">
            <div class="bw-card-eyebrow"><i class="fa-solid fa-coins"></i> Token selection</div>

            <div class="bw-field" style="margin-bottom:20px;">
              <label class="bw-label">Collateral token <span class="bw-req">*</span></label>
              <div class="bw-token-chips" id="crypto-token-chips">
                <button class="bw-token-chip selected" onclick="selectCryptoToken(this,'usdc')">
                  <span class="bw-token-icon">💵</span>USDC
                </button>
                <button class="bw-token-chip" onclick="selectCryptoToken(this,'custom')">
                  <span class="bw-token-icon">🔷</span>Custom ERC-20
                </button>
              </div>
            </div>

            <div id="crypto-custom-addr-group" class="bw-field" style="display:none;">
              <label class="bw-label" for="crypto-token-addr">Token contract address <span class="bw-req">*</span></label>
              <div class="bw-input-wrap">
                <input id="crypto-token-addr" class="bw-input bw-mono" type="text" placeholder="0x…" />
              </div>
              <span class="bw-field-hint">ERC-20 contract address on Arc Testnet</span>
            </div>
          </div>

          <div class="bw-card">
            <div class="bw-card-eyebrow"><i class="fa-solid fa-shield-halved"></i> Collateral amount &amp; ratio</div>

            <div class="bw-form-grid">
              <div class="bw-field">
                <label class="bw-label" for="crypto-amount">Collateral amount <span class="bw-req">*</span></label>
                <div class="bw-input-wrap bw-input-affix">
                  <span class="bw-prefix-icon"><i class="fa-solid fa-lock"></i></span>
                  <input id="crypto-amount" class="bw-input bw-input-with-prefix" type="number"
                    min="0" step="0.000001" placeholder="6 000"
                    oninput="updateCollateralRatio(); bwClearField('crypto-amount')"
                    onblur="bwValidateField('crypto-amount')" />
                  <span class="bw-suffix" id="crypto-token-symbol">USDC</span>
                </div>
                <span class="bw-field-err" id="crypto-amount-err"></span>
              </div>

              <div class="bw-field">
                <label class="bw-label">
                  Collateralization ratio — <span id="ratio-display" class="bw-ratio-value">120%</span>
                </label>
                <input type="range" id="crypto-ratio" class="bw-slider"
                  min="120" max="300" step="10" value="120"
                  oninput="updateRatioDisplay(this.value)" />
                <div class="bw-slider-labels">
                  <span>120% (min)</span>
                  <span>300% (max protection)</span>
                </div>
              </div>
            </div>

            <!-- Coverage indicator -->
            <div class="bw-coverage-card" id="collateral-ratio-indicator">
              <div class="bw-coverage-row">
                <span class="bw-coverage-label">Coverage status</span>
                <span class="bw-coverage-badge" id="ratio-coverage-text">—</span>
              </div>
              <div class="bw-coverage-track">
                <div class="bw-coverage-fill" id="ratio-bar"></div>
              </div>
              <div class="bw-coverage-amounts">
                <span>Loan: <strong id="ratio-loan-val" class="bw-mono">$0</strong></span>
                <span>Collateral: <strong id="ratio-col-val" class="bw-mono bw-text-cyan">$0</strong></span>
              </div>
            </div>
          </div>

          <!-- Crypto legal notice -->
          <div class="bw-legal-notice bw-legal-info">
            <i class="fa-solid fa-lock bw-legal-icon"></i>
            <div>
              <strong>On-chain escrow:</strong> Your tokens are locked in the smart contract on submission. Released automatically when the loan is fully repaid. After 3+ days overdue, the lender may trigger liquidation.
            </div>
          </div>
        </div>

        <div class="bw-step-footer">
          <button class="bw-btn-secondary" onclick="borrowStep(2)"><i class="fa-solid fa-arrow-left"></i> Back</button>
          <button class="bw-btn-primary" onclick="borrowStep(4)">Review &amp; Submit <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════
           STEP 4 — REVIEW & SUBMIT
           ════════════════════════════════════════════════════════ -->
      <div id="borrow-step-4" class="bw-step-content" style="display:none;">

        <div class="bw-review-header">
          <div class="bw-review-header-icon">📋</div>
          <div>
            <h3 class="bw-review-title">Review your loan request</h3>
            <p class="bw-review-sub">Please verify all details carefully before signing. This will create an on-chain record on Arc Testnet.</p>
          </div>
        </div>

        <!-- Summary cards populated by buildReviewPanel() -->
        <div id="loan-review-content" class="bw-review-grid"></div>

        <!-- Financial summary strip -->
        <div class="bw-fin-summary" id="bw-fin-summary">
          <div class="bw-fin-row">
            <span class="bw-fin-label">Loan amount</span>
            <span class="bw-fin-val" id="bw-fin-principal">—</span>
          </div>
          <div class="bw-fin-sep"></div>
          <div class="bw-fin-row">
            <span class="bw-fin-label">Interest rate</span>
            <span class="bw-fin-val bw-fin-green">≤ 5% / month</span>
          </div>
          <div class="bw-fin-sep"></div>
          <div class="bw-fin-row">
            <span class="bw-fin-label">Installments</span>
            <span class="bw-fin-val" id="bw-fin-installments">—</span>
          </div>
          <div class="bw-fin-sep"></div>
          <div class="bw-fin-row">
            <span class="bw-fin-label">Max total repayment</span>
            <span class="bw-fin-val bw-fin-cyan" id="bw-fin-total">—</span>
          </div>
        </div>

        <!-- Consent notice -->
        <div class="bw-legal-notice bw-legal-warning">
          <i class="fa-solid fa-signature bw-legal-icon"></i>
          <div>
            By submitting, you digitally sign this loan request via your wallet. This creates a binding on-chain record on Arc Testnet. You acknowledge the interest cap of 5%/month, the terms of your selected collateral type, and the non-custodial nature of this protocol.
          </div>
        </div>

        <div class="bw-step-footer">
          <button class="bw-btn-secondary" onclick="borrowStep(3)"><i class="fa-solid fa-arrow-left"></i> Back</button>
          <button class="bw-btn-submit" id="submit-loan-btn" onclick="submitLoan()">
            <i class="fa-solid fa-paper-plane"></i>
            Sign &amp; Submit Loan Request
          </button>
        </div>
      </div>

    </div><!-- /borrow-wizard -->
  </div>

  <!-- ══ PAGE: LEND ════════════════════════════════════════════════════════════ -->
  <div class="page" id="page-lend">
    <!-- Tabs -->
    <div class="flex items-center justify-between mb-6" style="flex-wrap:wrap; gap:12px;">
      <div>
        <div class="section-title"><i class="fa-solid fa-building-columns text-cyan" style="margin-right:8px;"></i>Lend &amp; Earn</div>
        <div class="section-sub" style="margin-bottom:0;">Create offers, review borrower requests, and manage your lending.</div>
      </div>
    </div>

    <div class="tabs" id="lend-tabs" style="margin-bottom:24px;">
      <button class="tab-btn active" data-lend-tab="offer-form" onclick="switchLendTab('offer-form',this)">
        <i class="fa-solid fa-plus"></i> Create Offer
      </button>
      <button class="tab-btn" data-lend-tab="loan-requests" onclick="switchLendTab('loan-requests',this)">
        <i class="fa-solid fa-inbox"></i> Loan Requests
      </button>
    </div>

    <!-- ── Tab: Create Offer ──────────────────────────────────────────────── -->
    <div id="lend-tab-offer-form">
      <div class="grid-2" style="gap:24px; align-items:start;">
        <!-- Form -->
        <div class="card card-lg">
          <div class="card-header">
            <div class="card-title"><i class="fa-solid fa-file-invoice text-cyan"></i>New Lending Offer</div>
            <span class="badge badge-active">Liquidity Locked On-Chain</span>
          </div>

          <div class="form-section">
            <!-- Lender Identity -->
            <div style="margin-bottom:20px;">
              <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Lender Identity</div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label class="form-label">Lender Name / Company <span class="req">*</span></label>
                  <input id="of-name" class="form-control" type="text" placeholder="e.g. John Smith or Acme Capital" />
                  <span class="field-error" id="of-name-err"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Lender Type <span class="req">*</span></label>
                  <div class="token-chips">
                    <button class="token-chip selected" data-lender-type="0" onclick="selectLenderType(this,0)">👤 Individual</button>
                    <button class="token-chip" data-lender-type="1" onclick="selectLenderType(this,1)">🏢 Company</button>
                  </div>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Wallet Address <span class="req">*</span></label>
                <div class="input-group">
                  <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  <input id="of-wallet" class="form-control mono" type="text" placeholder="Auto-detected on wallet connect" readonly />
                </div>
                <span class="field-hint">Auto-detected from connected wallet — non-custodial</span>
              </div>
            </div>

            <!-- Liquidity -->
            <div style="margin-bottom:20px;">
              <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Liquidity Lock</div>
              <div class="form-group">
                <label class="form-label">Total USDC to Deposit <span class="req">*</span></label>
                <div class="input-group">
                  <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <input id="of-liquidity" class="form-control" type="number" min="1" step="0.01" placeholder="e.g. 10000" oninput="updateOfferPreview()" />
                  <span class="input-suffix">USDC</span>
                </div>
                <span class="field-hint">USDC will be locked in smart contract escrow. Withdraw unused liquidity anytime.</span>
                <span class="field-error" id="of-liquidity-err"></span>
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label class="form-label">Min Loan Amount <span class="req">*</span></label>
                  <div class="input-group">
                    <input id="of-min-loan" class="form-control" type="number" min="1" placeholder="e.g. 500" oninput="updateOfferPreview()" />
                    <span class="input-suffix">USDC</span>
                  </div>
                  <span class="field-error" id="of-min-loan-err"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Max Loan Amount <span class="req">*</span></label>
                  <div class="input-group">
                    <input id="of-max-loan" class="form-control" type="number" min="1" placeholder="e.g. 5000" oninput="updateOfferPreview()" />
                    <span class="input-suffix">USDC</span>
                  </div>
                  <span class="field-error" id="of-max-loan-err"></span>
                </div>
              </div>
            </div>

            <!-- Terms -->
            <div style="margin-bottom:20px;">
              <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Loan Terms</div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label class="form-label">Monthly Interest Rate <span class="req">*</span></label>
                  <div class="input-group">
                    <input id="of-rate" class="form-control" type="number" min="0" max="5" step="0.01" placeholder="e.g. 3.5" oninput="updateOfferPreview()" />
                    <span class="input-suffix">%/mo</span>
                  </div>
                  <span class="field-hint">Maximum 5% per month — fixed, no compounding</span>
                  <span class="field-error" id="of-rate-err"></span>
                </div>
                <div class="form-group">
                  <label class="form-label">Max Installments <span class="req">*</span></label>
                  <select id="of-installments" class="form-control" onchange="updateOfferPreview()">
                    <option value="">— Select —</option>
                    <option value="1">1</option><option value="2">2</option>
                    <option value="3">3</option><option value="4">4</option>
                    <option value="5">5</option><option value="6">6</option>
                    <option value="7">7</option><option value="8">8</option>
                    <option value="9">9</option><option value="10">10</option>
                  </select>
                  <span class="field-error" id="of-installments-err"></span>
                </div>
              </div>
            </div>

            <!-- Collateral Preferences -->
            <div style="margin-bottom:20px;">
              <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Collateral Preferences</div>
              <div class="form-group">
                <label class="form-label">Accepted Collateral <span class="req">*</span></label>
                <div class="token-chips" id="of-col-chips">
                  <button class="token-chip" data-col-val="1" onclick="selectOfferCollateral(this,1)">🏠 RWA Only</button>
                  <button class="token-chip" data-col-val="2" onclick="selectOfferCollateral(this,2)">🔐 Crypto Only</button>
                  <button class="token-chip selected" data-col-val="3" onclick="selectOfferCollateral(this,3)">🌐 Both</button>
                </div>
                <span class="field-error" id="of-col-err"></span>
              </div>
              <div class="form-group" id="of-ratio-group">
                <label class="form-label">Min Collateral Ratio (Crypto) — <span id="of-ratio-display" class="text-cyan font-mono">120%</span></label>
                <input type="range" id="of-col-ratio" min="120" max="300" step="10" value="120" oninput="document.getElementById('of-ratio-display').textContent=this.value+'%'" />
                <div class="flex" style="justify-content:space-between; margin-top:4px;">
                  <span class="text-xs text-muted">120% (Min)</span>
                  <span class="text-xs text-muted">300% (Max)</span>
                </div>
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label class="form-label">Geographic Restrictions <span class="opt">(optional)</span></label>
                  <input id="of-geo" class="form-control" type="text" placeholder="e.g. US,EU or GLOBAL" value="GLOBAL" />
                  <span class="field-hint">Comma-separated country codes or "GLOBAL"</span>
                </div>
                <div class="form-group">
                  <label class="form-label">Borrower Preferences <span class="opt">(optional)</span></label>
                  <input id="of-prefs" class="form-control" type="text" placeholder="e.g. Employed, 1+ year history" />
                </div>
              </div>
            </div>
          </div>

          <!-- Legal Notice -->
          <div class="legal-banner legal-banner-warning" style="margin-bottom:20px;">
            <i class="fa-solid fa-gavel" style="flex-shrink:0; margin-top:2px;"></i>
            <div>
              <strong>Lender Risk Assumption:</strong> By creating this offer you accept that: (1) RWA enforcement is off-chain only; (2) Crypto collateral is auto-enforced on-chain; (3) You assume full default risk. ArcFi is a non-custodial, non-liability protocol.
            </div>
          </div>

          <button class="btn btn-primary btn-full btn-lg" id="create-offer-btn" onclick="submitOffer()">
            <i class="fa-solid fa-lock"></i> Lock Liquidity &amp; Create Offer
          </button>
        </div>

        <!-- Preview -->
        <div class="space-y-4">
          <div class="card" id="offer-preview-card" style="background:var(--bg-input);">
            <div class="card-title" style="margin-bottom:16px; color:var(--cyan); font-size:14px;"><i class="fa-solid fa-eye"></i>Offer Preview</div>
            <div id="offer-preview-content">
              <div class="empty-state" style="padding:24px;">
                <div class="empty-icon" style="font-size:32px;">📋</div>
                <div class="empty-desc">Fill in the form to see a preview of your offer card.</div>
              </div>
            </div>
          </div>

          <div class="card" style="background:var(--bg-input);">
            <div class="card-title" style="margin-bottom:14px; font-size:14px;"><i class="fa-solid fa-circle-info text-cyan"></i>How Liquidity Lock Works</div>
            <div class="space-y-3" style="font-size:13px; color:var(--text-secondary); line-height:1.6;">
              <div class="flex" style="gap:10px;"><span style="color:var(--cyan); font-size:18px;">1</span><span><strong>Deposit USDC</strong> — locked in the smart contract escrow, non-custodially.</span></div>
              <div class="flex" style="gap:10px;"><span style="color:var(--cyan); font-size:18px;">2</span><span><strong>Borrowers apply</strong> — they browse your offer and submit loan requests.</span></div>
              <div class="flex" style="gap:10px;"><span style="color:var(--cyan); font-size:18px;">3</span><span><strong>Allocation</strong> — on approval, USDC is atomically allocated to the loan.</span></div>
              <div class="flex" style="gap:10px;"><span style="color:var(--cyan); font-size:18px;">4</span><span><strong>Repayments flow back</strong> — each installment increases your available liquidity.</span></div>
              <div class="flex" style="gap:10px;"><span style="color:var(--cyan); font-size:18px;">5</span><span><strong>Withdraw anytime</strong> — unused liquidity can be withdrawn at any time.</span></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title" style="margin-bottom:14px; font-size:14px;"><i class="fa-solid fa-wallet text-cyan"></i>Your USDC Balance</div>
            <div class="flex items-center justify-between">
              <div>
                <div class="stat-label" style="font-size:10px;">Available</div>
                <div class="stat-value" id="of-usdc-balance" style="font-size:22px;">—</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="refreshOfferBalance()">
                <i class="fa-solid fa-rotate"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tab: Loan Requests ──────────────────────────────────────────────── -->
    <div id="lend-tab-loan-requests" style="display:none;">
      <div class="flex items-center justify-between mb-4">
        <div></div>
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
      <div class="card" style="padding:0;">
        <div class="table-container" style="border:none; border-radius:var(--radius-lg);">
          <table class="data-table" id="lender-loans-table">
            <thead>
              <tr>
                <th>ID</th><th>Borrower</th><th>Amount</th><th>Installments</th><th>Collateral</th><th>Status</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody id="lender-loans-tbody">
              <tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🏦</div><div class="empty-title">No loans found</div><div class="empty-desc">Connect your wallet to view loan requests.</div></div></td></tr>
            </tbody>
          </table>
        </div>
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
            <label class="form-label">LoanMarketplace Contract Address</label>
            <div class="input-group">
              <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              <input id="cfg-marketplace" class="form-control mono" type="text" placeholder="0x..." />
            </div>
            <span class="field-hint">LoanMarketplace contract on Arc Testnet (for offer creation)</span>
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

<!-- ════ FOOTER ════ -->
<footer class="site-footer">
  <div class="footer-divider"></div>

  <!-- ── Top section: 3 equal columns ── -->
  <div class="footer-inner">

    <!-- Col 1: Brand + Network -->
    <div class="footer-col footer-col-brand">
      <div class="footer-logo">
        <span class="footer-logo-icon">⚡</span>
        <span class="footer-logo-text">Arc<span class="footer-logo-fi">Fi</span></span>
      </div>
      <p class="footer-tagline">Global decentralized lending on Arc Testnet. Hybrid RWA + crypto collateral, USDC payments, AI-powered agent.</p>
      <div class="footer-network-badge">
        <span class="footer-net-dot"></span>
        <span class="footer-net-label">Arc Testnet</span>
        <span class="footer-net-sep">·</span>
        <span class="footer-net-chain">Chain ID: 5042002</span>
      </div>
      <div class="footer-wallet-row" id="footer-wallet-row" style="display:none;">
        <i class="fa-solid fa-wallet"></i>
        <span id="footer-wallet-addr"></span>
      </div>
    </div>

    <!-- Col 2: Resources -->
    <div class="footer-col">
      <p class="footer-col-title">Resources</p>
      <ul class="footer-links">
        <li><a href="https://docs.arc.fun" target="_blank" rel="noopener noreferrer" class="footer-link">
          <i class="fa-solid fa-book"></i>Documentation
        </a></li>
        <li><a href="https://explorer.arc.fun" target="_blank" rel="noopener noreferrer" class="footer-link">
          <i class="fa-solid fa-cube"></i>Smart Contracts
        </a></li>
        <li><a href="https://github.com/julenosinger/land-and-borrow-on-arc" target="_blank" rel="noopener noreferrer" class="footer-link">
          <i class="fa-brands fa-github"></i>GitHub Repository
        </a></li>
        <li><a href="https://explorer.arc.fun" target="_blank" rel="noopener noreferrer" class="footer-link">
          <i class="fa-solid fa-headset"></i>Support / Help Center
        </a></li>
      </ul>
    </div>

    <!-- Col 3: Legal — links + disclaimer side-by-side -->
    <div class="footer-col footer-col-legal">
      <p class="footer-col-title">Legal</p>
      <div class="footer-legal-body">
        <!-- Legal links (left side) -->
        <ul class="footer-links footer-legal-links">
          <li><a href="#" onclick="return false;" class="footer-link">
            <i class="fa-solid fa-file-lines"></i>Terms of Service
          </a></li>
          <li><a href="#" onclick="return false;" class="footer-link">
            <i class="fa-solid fa-shield-halved"></i>Privacy Policy
          </a></li>
          <li><a href="#" onclick="return false;" class="footer-link">
            <i class="fa-solid fa-triangle-exclamation"></i>Disclaimer
          </a></li>
        </ul>
        <!-- Disclaimer text (right side, inline) -->
        <div class="footer-disclaimer">
          <i class="fa-solid fa-circle-info footer-disclaimer-icon"></i>
          <p>This platform operates on a testnet environment. All transactions are for testing purposes only. No real‑world financial guarantees are provided. Users are fully responsible for their actions. Non‑custodial: lenders assume full risk. RWA enforcement is off‑chain; crypto collateral is enforced on‑chain.</p>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Bottom bar ── -->
  <div class="footer-bottom-bar">
    <div class="footer-bottom-inner">
      <span>© 2025 ArcFi — Decentralized Lending Protocol</span>
      <div class="footer-bottom-dots">
        <span class="footer-bottom-sep">·</span>
        <span>Arc Testnet · Chain ID 5042002</span>
        <span class="footer-bottom-sep">·</span>
        <span>Hono + Cloudflare Pages</span>
        <span class="footer-bottom-sep">·</span>
        <a href="https://arc.fun" target="_blank" rel="noopener noreferrer" class="footer-bottom-link">arc.fun ↗</a>
      </div>
    </div>
  </div>
</footer>

<!-- ════ TOAST CONTAINER ════ -->
<div id="toast-container"></div>

<!-- ════ MODAL CONTAINER ════ -->
<div id="modal-container"></div>

<!-- ════ CHATBOT TOGGLE ════ -->
<button id="chatbot-toggle" title="ArcFi AI Agent">
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
    <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
      <button id="chatbot-clear" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:11px;padding:4px 8px;border-radius:6px;transition:color 0.2s;" onmouseover="this.style.color='var(--text-secondary)'" onmouseout="this.style.color='var(--text-muted)'">Clear</button>
      <button onclick="window.chatbot && window.chatbot.toggle()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;line-height:1;padding:4px;">&times;</button>
    </div>
  </div>
  <div class="chat-messages" id="chat-messages"></div>
  <div id="chat-typing" style="padding:8px 16px; display:none;">
    <div style="display:flex; align-items:center; gap:4px;">
      <div class="chat-typing"><span></span><span></span><span></span></div>
    </div>
  </div>
  <div class="chat-quick-btns">
    <button class="chat-quick-btn" data-msg="Pay next installment">💸 Pay next</button>
    <button class="chat-quick-btn" data-msg="Show my offers">📊 My offers</button>
    <button class="chat-quick-btn" data-msg="How much do I owe?">💰 Balance</button>
    <button class="chat-quick-btn" data-msg="help">❓ Help</button>
  </div>
  <div class="chat-input-row">
    <input class="chat-input" id="chat-input" type="text" placeholder="Ask me about your loans..." />
    <button class="chat-send-btn" id="chat-send">
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
<script src="/static/marketplace.js"></script>
<script src="/static/app.js"></script>
</body>
</html>`)
})

// ── API: Health ────────────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', network: 'Arc Testnet', chainId: 5042002, marketplace: true }))

// ── API: Receipt storage ───────────────────────────────────────────────────────
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

// ── API: Loan metadata offchain cache ──────────────────────────────────────────
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

// ── API: Marketplace offer metadata cache ──────────────────────────────────────
const offerMeta: Map<string, object> = new Map()

app.post('/api/offers/meta', async (c) => {
  try {
    const body = await c.req.json()
    const { offerId, ...data } = body as any
    if (!offerId) return c.json({ error: 'offerId required' }, 400)
    offerMeta.set(offerId.toString(), { offerId, ...data, updatedAt: new Date().toISOString() })
    return c.json({ success: true })
  } catch {
    return c.json({ error: 'Invalid body' }, 400)
  }
})

app.get('/api/offers/meta/:offerId', (c) => {
  const m = offerMeta.get(c.req.param('offerId'))
  return c.json(m || {})
})

export default app
