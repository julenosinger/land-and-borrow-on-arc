import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  CIRCLE_API_KEY: string
  PINATA_JWT: string
}

const app = new Hono<{ Bindings: Bindings }>()

// ══════════════════════════════════════════════════════════════════════════════
//  SECURITY LAYER — strictly additive, zero impact on existing functionality
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Rate Limiting (in-memory, per IP, Cloudflare Workers compatible) ──────
const _rl: Map<string, { count: number; reset: number }> = new Map()
const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  '/api/ipfs/upload':     { max: 10,  windowMs: 60_000},    // 10/min — IPFS upload
  '/api/circle/faucet':   { max: 3,   windowMs: 60_000 },   // 3/min — faucet abuse
  '/api/receipts':        { max: 20,  windowMs: 60_000 },   // 20/min
  '/api/loans/meta':      { max: 30,  windowMs: 60_000 },
  '/api/offers/meta':     { max: 30,  windowMs: 60_000 },
  '/api/circle/balance':  { max: 20,  windowMs: 60_000 },
  '/api/circle/wallets':  { max: 10,  windowMs: 60_000 },
  'default':              { max: 120, windowMs: 60_000 },   // global fallback
}

function _rateLimitKey(ip: string, path: string): string {
  return `${ip}::${path}`
}

function _checkRateLimit(ip: string, path: string): boolean {
  const rule = RATE_LIMITS[path] ?? RATE_LIMITS['default']
  const key  = _rateLimitKey(ip, path)
  const now  = Date.now()
  const rec  = _rl.get(key)

  if (!rec || now > rec.reset) {
    _rl.set(key, { count: 1, reset: now + rule.windowMs })
    return true   // allowed
  }
  rec.count++
  if (rec.count > rule.max) return false  // blocked
  return true
}

// ── 2. Security Headers middleware ────────────────────────────────────────────
app.use('*', async (c, next) => {
  await next()

  // Prevent clickjacking / iframe embedding
  c.res.headers.set('X-Frame-Options', 'DENY')

  // Prevent MIME-type sniffing
  c.res.headers.set('X-Content-Type-Options', 'nosniff')

  // Force HTTPS (1 year, include subdomains)
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')

  // Disable referrer leakage
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Restrict browser features (includes FLoC/Topics opt-out)
  c.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()')

  // Block cross-origin access
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  c.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin')

  // No Adobe/Flash cross-domain policies
  c.res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')

  // Content-Security-Policy — allows ethers CDN + FontAwesome + Tailwind + same-origin
  c.res.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://fonts.googleapis.com",
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://rpc.testnet.arc.network https://api.circle.com https://gateway.pinata.cloud wss: ws:",
    "frame-src https://gateway.pinata.cloud",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '))

  // Remove server fingerprinting
  c.res.headers.delete('X-Powered-By')
  c.res.headers.delete('Server')
})

// ── 3. Rate limiting middleware ───────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const ip   = c.req.header('CF-Connecting-IP')
           ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
           ?? 'unknown'
  const path = c.req.path

  if (!_checkRateLimit(ip, path)) {
    _secLog('RATE_LIMIT', ip, { path })
    return c.json({ error: 'Too many requests. Please slow down.' }, 429)
  }
  await next()
})

// ── 4. CSRF — require custom header for all state-changing API calls ──────────
//    (Browser fetch/XHR always has this; cross-origin attackers cannot set it)
app.use('/api/*', async (c, next) => {
  const method = c.req.method
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    const xReq = c.req.header('X-Requested-With')
    const ct   = c.req.header('Content-Type') ?? ''
    // Allow if either the custom header OR JSON content-type is present
    // (our fetch() calls always send Content-Type: application/json)
    if (!xReq && !ct.includes('application/json')) {
      const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
      _secLog('CSRF_ATTEMPT', ip, { path: c.req.path, method })
      return c.json({ error: 'Invalid request origin.' }, 403)
    }
  }
  await next()
})

// ── 5. Request size guard (prevent oversized payloads) ───────────────────────
const MAX_BODY_BYTES = 64 * 1024  // 64 KB
app.use('/api/*', async (c, next) => {
  const cl = parseInt(c.req.header('Content-Length') ?? '0', 10)
  if (cl > MAX_BODY_BYTES) {
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
    _secLog('OVERSIZED_PAYLOAD', ip, { path: c.req.path, bytes: cl })
    return c.json({ error: 'Request payload too large.' }, 413)
  }
  await next()
})

// ── 6. Security event logger (no sensitive data ever logged) ─────────────────
const _secEvents: Array<{ ts: string; event: string; ip: string; meta: object }> = []
const MAX_SEC_EVENTS = 500

function _secLog(event: string, ip: string, meta: object = {}) {
  const entry = { ts: new Date().toISOString(), event, ip: _maskIp(ip), meta }
  _secEvents.push(entry)
  if (_secEvents.length > MAX_SEC_EVENTS) _secEvents.shift()
  console.warn(`[SECURITY] ${event} ip=${_maskIp(ip)}`, JSON.stringify(meta))
}

function _maskIp(ip: string): string {
  // Mask last octet for privacy: 1.2.3.4 → 1.2.3.x  /  IPv6 last group
  return ip.replace(/(\d+)$/, 'x').replace(/:[^:]+$/, ':xxxx')
}

// ── 7. Input sanitization helpers ────────────────────────────────────────────
const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?>/i,
  /javascript:/i,
  /on\w+\s*=/i,          // onerror=, onclick=, etc.
  /data:text\/html/i,
  /vbscript:/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
]

function _isSafeString(val: string): boolean {
  return !DANGEROUS_PATTERNS.some(p => p.test(val))
}

function _sanitizeString(val: unknown): string {
  if (typeof val !== 'string') return ''
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .slice(0, 2048)   // hard length cap
}

function _isEthAddress(val: unknown): boolean {
  return typeof val === 'string' && /^0x[0-9a-fA-F]{40}$/.test(val)
}

function _isAlphanumericId(val: unknown): boolean {
  return typeof val === 'string' && /^[a-zA-Z0-9_\-]{1,128}$/.test(val)
}

// ── 8. Security event log endpoint (internal monitoring, masked IPs) ──────────
app.get('/api/security/events', (c) => {
  // Only allow from Cloudflare edge (no public exposure in prod)
  const ip = c.req.header('CF-Connecting-IP') ?? ''
  if (!ip) return c.json({ error: 'Forbidden' }, 403)
  return c.json({
    count: _secEvents.length,
    events: _secEvents.slice(-50)  // last 50 only
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  END OF SECURITY LAYER
// ─────────────────────────────────────────────────────────────────────────────

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
  <title>DaatFI — Decentralized Lending Platform</title>
  <meta name="description" content="Testnet-only DeFi lending platform on Arc Network. No real funds, no financial risk. Built for testing and development." />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="DaatFI — Testnet DeFi Lending on Arc Network" />
  <meta property="og:description" content="Experimental DeFi lending dApp on Arc Network testnet. No real assets involved. Non-custodial architecture for testing and development." />
  <meta property="og:type" content="website" />

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "DAATFi",
    "description": "Experimental DeFi lending dApp running on Arc Network testnet. No real funds or financial risk involved.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    }
  }
  </script>

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
  <!-- Styles -->
  <link rel="stylesheet" href="/static/style.css?v=20260415e" />
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
    #testnet-banner {
      position: fixed; top: 64px; left: 0; right: 0; z-index: 29;
      background: rgba(245,158,11,0.1);
      border-bottom: 1px solid rgba(245,158,11,0.25);
      padding: 8px 24px;
      display: flex; align-items: center; gap: 10px;
      font-size: 12px; color: var(--amber);
      transition: background-color var(--transition);
    }
    #testnet-banner + #config-banner { display:none !important; }
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
<div id="testnet-banner">
  <span>⚠ TESTNET ONLY — This application runs exclusively on Arc Testnet. No real funds are used. Do not send mainnet assets.</span>
</div>
<div id="config-banner" style="display:none;"></div>

<!-- ════ HEADER ════ -->
<header class="top-header">
  <a class="header-logo" onclick="showPage('home')" style="text-decoration:none">
    <div class="logo-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><defs><linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#818cf8"/></linearGradient></defs><path d="M4 4 L4 20 L12 20 C17.523 20 22 16.418 22 12 C22 7.582 17.523 4 12 4 Z" fill="none" stroke="url(#lg1)" stroke-width="2.2" stroke-linejoin="round"/><path d="M7.5 8 L7.5 16 L11.5 16 C14.538 16 17 14.209 17 12 C17 9.791 14.538 8 11.5 8 Z" fill="url(#lg1)" opacity="0.3"/></svg></div>
    <span class="logo-text">Daat<span class="logo-fi">FI</span></span>
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
    <button class="nav-btn" data-page="about" onclick="showPage('about')">
      <i class="fa-solid fa-circle-info"></i> About Us
    </button>
    <button class="nav-btn" data-page="nft-loans" onclick="showPage('nft-loans')">
      <i class="fa-solid fa-hexagon-nodes"></i> NFT Loans
    </button>
    <button class="nav-btn" data-page="liquidity-pool" onclick="showPage('liquidity-pool')">
      <i class="fa-solid fa-droplet"></i> Liquidity Pool
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
          <strong>Legal Disclaimer:</strong> DaatFI is a non-custodial, decentralized protocol. Real-World Asset (RWA) collateral enforcement is <strong>off-chain</strong> and subject to applicable laws in your jurisdiction. Crypto collateral enforcement is <strong>on-chain</strong> and executed automatically by smart contracts. This platform does not provide financial, legal or investment advice. Use at your own risk.
        </div>
      </div>
    </div>
  </div>

  <!-- ══ PAGE: MARKETPLACE ═════════════════════════════════════════════════════ -->
  <div class="page" id="page-marketplace">
    <div class="flex items-center justify-between mb-6" style="flex-wrap:wrap; gap:12px;">
      <div>
        <div class="section-title"><i class="fa-solid fa-store text-cyan" style="margin-right:8px;"></i>Loan Marketplace</div>
        <div class="section-sub" style="margin-bottom:0;">Browse open loan requests on-chain. Fund directly via the DaatFI Loan Manager.</div>
      </div>
      <div class="flex" style="gap:10px; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-primary" onclick="showPage('borrow')">
          <i class="fa-solid fa-plus"></i> Request a Loan
        </button>
        <button class="btn btn-secondary" onclick="loadMarketplace(true)">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
    </div>

    <!-- Marketplace Stats (on-chain) -->
    <div class="col-4" id="marketplace-stats" style="margin-bottom:24px;">
      <div class="stat-card cyan"><div class="accent-blob" style="background:var(--cyan)"></div><div class="stat-label">Open Requests</div><div class="stat-value" id="mp-stat-requests">—</div></div>
      <div class="stat-card blue"><div class="accent-blob" style="background:var(--blue)"></div><div class="stat-label">Active Loans</div><div class="stat-value" id="mp-stat-active">—</div></div>
      <div class="stat-card" style="border-color:rgba(16,185,129,0.25)"><div class="accent-blob" style="background:var(--green)"></div><div class="stat-label">Total Volume</div><div class="stat-value" id="mp-stat-volume">—</div></div>
      <div class="stat-card"><div class="accent-blob" style="background:var(--purple)"></div><div class="stat-label">All Loans</div><div class="stat-value" id="mp-stat-total">—</div></div>
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
            <option value="RWA">RWA Only</option>
            <option value="CRYPTO">Crypto Only</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:11px;">Sort By</label>
          <select id="mp-sort" class="form-control" onchange="applyMarketplaceFilters()">
            <option value="newest">Newest First</option>
            <option value="amount_desc">Amount ↑</option>
            <option value="amount_asc">Amount ↓</option>
            <option value="installments">Installments</option>
          </select>
        </div>
        <div class="form-group" style="margin:0; display:flex; align-items:flex-end;">
          <button class="btn btn-secondary btn-sm btn-full" onclick="clearMarketplaceFilters()">
            <i class="fa-solid fa-xmark"></i> Clear
          </button>
        </div>
      </div>
    </div>

    <!-- Result count + Listings -->
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
      <span style="font-size:13px; color:var(--text-muted);"><span id="mp-result-count"></span></span>
      <span style="font-size:11px; color:var(--text-muted);">100% on-chain · Arc Testnet</span>
    </div>
    <div id="marketplace-listings" class="grid-auto">
      <div class="card" style="padding:48px; text-align:center; grid-column:1/-1;">
        <div class="empty-icon" style="font-size:48px; margin-bottom:12px;">⛓️</div>
        <div class="empty-title">Loading on-chain data…</div>
        <div class="empty-desc">Reading loan requests from DaatFI Loan Manager on Arc Testnet.</div>
      </div>
    </div>

    <!-- Legal Disclaimer -->
    <div style="margin-top:24px;">
      <div class="legal-banner legal-banner-warning">
        <i class="fa-solid fa-scale-balanced" style="flex-shrink:0; margin-top:2px;"></i>
        <div>
          <strong>Non-Custodial Platform Disclaimer:</strong> DaatFI is a non-custodial protocol. Lenders assume full risk of capital deployment. RWA collateral enforcement is <strong>off-chain</strong>. Crypto collateral enforcement is <strong>on-chain</strong> and automated. Interest rates are fixed and do not compound. This is not financial advice.
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
        <button class="btn btn-primary" onclick="showPage('marketplace')">
          <i class="fa-solid fa-store"></i> Fund a Loan
        </button>
        <button class="btn btn-secondary" onclick="loadMyLending()">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
    </div>

    <!-- Summary Stats -->
    <div class="col-4" style="margin-bottom:24px;">
      <div class="stat-card cyan"><div class="accent-blob" style="background:var(--cyan)"></div><div class="stat-label">Active Offers</div><div class="stat-value" id="ml-stat-active">—</div></div>
      <div class="stat-card blue"><div class="accent-blob" style="background:var(--blue)"></div><div class="stat-label">Total Deployed</div><div class="stat-value" id="ml-stat-vol">—</div></div>
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
            <div class="bw-calc-cell" style="border-top:1px solid var(--border);">
              <span class="bw-calc-label">Platform fee (2%)</span>
              <span class="bw-calc-value" style="color:var(--amber);" id="prev-fee">—</span>
            </div>
          </div>
          <div class="bw-calc-note-banner">
            <i class="fa-solid fa-circle-info"></i>
            Final rate is set by your lender (≤ 5%/month fixed, no compounding). A 2% platform fee on principal is included in the total.
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

          <!-- Document upload — up to 5 files -->
          <div class="bw-card">
            <div class="bw-card-eyebrow"><i class="fa-solid fa-upload"></i> Collateral documents <span class="bw-req">*</span></div>
            <p class="bw-card-hint">Upload up to 5 files (PDF, JPG, PNG, WEBP). Each file is hashed (SHA-256) and optionally pinned to IPFS. Only hashes are stored on-chain — original files are never public.</p>

            <!-- Slot list rendered by JS -->
            <div id="rwa-docs-list" class="bw-docs-list"></div>

            <!-- Add document button (hidden once 5 docs added) -->
            <button type="button" id="rwa-add-doc-btn" class="bw-add-doc-btn" onclick="addDocSlot()">
              <i class="fa-solid fa-plus"></i> Add Proof
            </button>

            <span class="bw-field-err" id="rwa-doc-err"></span>
          </div>

          <!-- RWA legal notice -->
          <div class="bw-legal-notice bw-legal-warning">
            <i class="fa-solid fa-gavel bw-legal-icon"></i>
            <div>
              <strong>Off-chain enforcement notice:</strong> RWA collateral is legally binding only in your jurisdiction. In case of default, lenders must pursue remedies via local courts. DaatFI facilitates the digital agreement but does not enforce physical asset seizure.
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
        <i class="fa-solid fa-plus"></i> Lending Info
      </button>
      <button class="tab-btn" data-lend-tab="loan-requests" onclick="switchLendTab('loan-requests',this)">
        <i class="fa-solid fa-inbox"></i> All Loan Requests
      </button>
      <button class="tab-btn" data-lend-tab="my-lending" onclick="switchLendTab('my-lending',this)">
        <i class="fa-solid fa-building-columns"></i> My Lending
      </button>
    </div>

    <!-- ── Tab: Lending Info (on-chain) ─────────────────────────────────── -->
    <div id="lend-tab-offer-form">

      <!-- ── Lender CTA Banner ─────────────────────────────────────────── -->
      <div style="background:linear-gradient(135deg,rgba(56,189,248,0.12),rgba(99,102,241,0.12)); border:1.5px solid rgba(56,189,248,0.3); border-radius:16px; padding:28px 32px; margin-bottom:28px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:20px;">
        <div>
          <div style="font-size:20px; font-weight:800; color:var(--text-primary); margin-bottom:6px;">
            <i class="fa-solid fa-hand-holding-dollar" style="color:#38bdf8; margin-right:10px;"></i>Ready to Lend?
          </div>
          <div style="font-size:14px; color:var(--text-secondary); max-width:480px;">
            Browse open loan requests from verified borrowers and fund them directly on-chain. Set your own interest rate (1–5%/month) and start earning USDC.
          </div>
        </div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-primary" style="padding:12px 24px; font-size:15px;" onclick="showPage('marketplace')">
            <i class="fa-solid fa-store"></i> Browse Loan Requests
          </button>
          <button class="btn btn-secondary" style="padding:12px 24px; font-size:15px;" onclick="switchLendTab('loan-requests', document.querySelector('[data-lend-tab=loan-requests]'))">
            <i class="fa-solid fa-inbox"></i> All Requests
          </button>
        </div>
      </div>

      <div class="grid-2" style="gap:24px; align-items:start;">

        <!-- How-to Lend Card -->
        <div class="card card-lg">
          <div class="card-header">
            <div class="card-title"><i class="fa-solid fa-bolt text-cyan"></i>How to Lend on DaatFI</div>
            <span class="badge badge-active">100% On-Chain</span>
          </div>
          <div class="form-section">
            <div class="legal-banner legal-banner-info" style="margin-bottom:20px;">
              <i class="fa-solid fa-info-circle" style="flex-shrink:0;"></i>
              <div>
                DaatFI is a fully decentralized, non-custodial lending protocol on Arc Testnet.
                <strong>No marketplace contract</strong> — lenders fund borrower requests directly through
                the <code>DaatFI Loan Manager</code> contract.
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:16px;">
              <div class="card" style="background:var(--bg-input); padding:16px;">
                <div style="display:flex; align-items:flex-start; gap:14px;">
                  <div style="background:var(--cyan); color:#000; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; flex-shrink:0;">1</div>
                  <div>
                    <div style="font-weight:700; margin-bottom:4px;">Browse Loan Requests</div>
                    <div style="font-size:13px; color:var(--text-secondary);">Go to the <strong>Marketplace</strong> tab or <strong>All Loan Requests</strong> to view open borrower requests with status = Requested.</div>
                    <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="showPage('marketplace')">
                      <i class="fa-solid fa-store"></i> Open Marketplace
                    </button>
                  </div>
                </div>
              </div>

              <div class="card" style="background:var(--bg-input); padding:16px;">
                <div style="display:flex; align-items:flex-start; gap:14px;">
                  <div style="background:var(--cyan); color:#000; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; flex-shrink:0;">2</div>
                  <div>
                    <div style="font-weight:700; margin-bottom:4px;">Set Interest Rate &amp; Approve</div>
                    <div style="font-size:13px; color:var(--text-secondary);">Click <strong>Fund This Loan</strong> on any request. Enter your interest rate (1–5%/month). This calls <code>approveLoan(loanId, rate)</code> on-chain.</div>
                  </div>
                </div>
              </div>

              <div class="card" style="background:var(--bg-input); padding:16px;">
                <div style="display:flex; align-items:flex-start; gap:14px;">
                  <div style="background:var(--cyan); color:#000; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; flex-shrink:0;">3</div>
                  <div>
                    <div style="font-weight:700; margin-bottom:4px;">Fund the Loan</div>
                    <div style="font-size:13px; color:var(--text-secondary);">Approve USDC allowance, then call <code>fundLoan(loanId)</code>. USDC transfers directly to the borrower's wallet. No escrow, no intermediary.</div>
                  </div>
                </div>
              </div>

              <div class="card" style="background:var(--bg-input); padding:16px;">
                <div style="display:flex; align-items:flex-start; gap:14px;">
                  <div style="background:var(--green); color:#000; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; flex-shrink:0;">4</div>
                  <div>
                    <div style="font-weight:700; margin-bottom:4px;">Receive Repayments</div>
                    <div style="font-size:13px; color:var(--text-secondary);">Borrower calls <code>repayInstallment()</code> periodically. Each payment transfers USDC directly to your wallet. Track in <strong>My Lending</strong>.</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="legal-banner legal-banner-warning" style="margin-top:20px;">
              <i class="fa-solid fa-scale-balanced" style="flex-shrink:0;"></i>
              <div>
                <strong>Risk Disclosure:</strong> RWA collateral enforcement is off-chain only. Crypto collateral enforcement is on-chain and automatic. You assume full default risk. This is not financial advice.
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Stats -->
        <div class="space-y-4">
          <div class="card" style="background:var(--bg-input);">
            <div class="card-title" style="margin-bottom:14px; font-size:14px;"><i class="fa-solid fa-wallet text-cyan"></i>Your USDC Balance</div>
            <div class="flex items-center justify-between">
              <div>
                <div class="stat-label" style="font-size:10px;">Available</div>
                <div class="stat-value" id="of-usdc-balance" style="font-size:22px;">—</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="refreshOfferBalance()">
                <i class="fa-solid fa-rotate"></i> Refresh
              </button>
            </div>
          </div>

          <div class="card" style="background:var(--bg-input);">
            <div class="card-title" style="margin-bottom:14px; font-size:14px;"><i class="fa-solid fa-calculator text-cyan"></i>Interest Calculator</div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label" style="font-size:11px;">Principal (USDC)</label>
                <input id="of-liquidity" class="form-control" type="number" placeholder="e.g. 1000" oninput="updateOfferPreview()" />
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label" style="font-size:11px;">Rate (%/mo)</label>
                <input id="of-rate" class="form-control" type="number" min="1" max="5" step="1" placeholder="1–5" oninput="updateOfferPreview()" />
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label" style="font-size:11px;">Installments</label>
                <select id="of-installments" class="form-control" onchange="updateOfferPreview()">
                  <option value="">—</option>
                  <option value="1">1</option><option value="2">2</option>
                  <option value="3">3</option><option value="4">4</option>
                  <option value="5">5</option><option value="6">6</option>
                  <option value="7">7</option><option value="8">8</option>
                  <option value="9">9</option><option value="10">10</option>
                </select>
              </div>
              <div id="offer-preview-content">
                <div class="empty-state" style="padding:16px;"><div class="empty-desc">Fill fields above to preview earnings.</div></div>
              </div>
            </div>
          </div>

          <div class="card" style="background:var(--bg-input);">
            <div class="card-title" style="margin-bottom:12px; font-size:14px;"><i class="fa-solid fa-file-contract text-cyan"></i>Contract Details</div>
            <div class="detail-row"><span class="detail-label">Contract</span><span class="detail-value mono" style="font-size:10px;">0x4135…CF5F</span></div>
            <div class="detail-row"><span class="detail-label">Max Rate</span><span class="detail-value text-green">5%/month</span></div>
            <div class="detail-row"><span class="detail-label">Max Installments</span><span class="detail-value">10</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Custody</span><span class="detail-value">Non-custodial</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tab: Loan Requests (on-chain) ─────────────────────────────────── -->
    <div id="lend-tab-loan-requests" style="display:none;">
      <div class="flex items-center justify-between mb-4">
        <div></div>
        <button class="btn btn-primary" onclick="loadLenderLoans()">
          <i class="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
      <!-- Filter Tabs -->
      <div class="tabs" style="margin-bottom:20px;">
        <button class="tab-btn active" onclick="filterLenderLoans('all',this)">All</button>
        <button class="tab-btn" onclick="filterLenderLoans('Requested',this)">
          <i class="fa-solid fa-clock"></i> Requested
        </button>
        <button class="tab-btn" onclick="filterLenderLoans('Approved',this)">
          <i class="fa-solid fa-check"></i> Approved
        </button>
        <button class="tab-btn" onclick="filterLenderLoans('Active',this)">
          <i class="fa-solid fa-bolt"></i> Active
        </button>
        <button class="tab-btn" onclick="filterLenderLoans('Repaid',this)">
          <i class="fa-solid fa-flag-checkered"></i> Repaid
        </button>
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
              <tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🏦</div><div class="empty-title">Loading loan requests…</div><div class="empty-desc">Switch to this tab to load on-chain data.</div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── Tab: My Lending (redirects to dedicated page) ───────────────── -->
    <div id="lend-tab-my-lending" style="display:none;">
      <div style="padding:48px 24px; text-align:center;">
        <div style="font-size:48px; margin-bottom:16px;">🏦</div>
        <div class="section-title" style="margin-bottom:8px;">My Lending Dashboard</div>
        <div class="section-sub" style="max-width:400px; margin:0 auto 24px;">
          View all loans you've funded, repayment progress, and your earnings on Arc Testnet.
        </div>
        <button class="btn btn-primary" onclick="showPage('my-lending')">
          <i class="fa-solid fa-arrow-right"></i> Go to My Lending
        </button>
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
            <label class="form-label">DaatFI Loan Manager Contract Address</label>
            <div class="input-group">
              <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              <input id="cfg-contract" class="form-control mono" type="text"
                value="0x413508DBCb5Cbf86b93C09b9AE633Af8B14cEF5F"
                placeholder="0x413508DBCb5Cbf86b93C09b9AE633Af8B14cEF5F" />
            </div>
            <span class="field-hint">✅ Deployed on Arc Testnet (Chain ID: 5042002)</span>
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
              <input id="cfg-usdc" class="form-control mono" type="text"
                value="0x3600000000000000000000000000000000000000"
                placeholder="0x3600000000000000000000000000000000000000" />
            </div>
            <span class="field-hint">Native USDC precompile on Arc Testnet (ERC-20 compatible)</span>
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
          <div class="detail-row"><span class="detail-label">RPC URL</span><span class="detail-value mono text-xs">https://rpc.testnet.arc.network</span></div>
          <div class="detail-row"><span class="detail-label">Explorer</span>
            <a href="https://testnet.arcscan.app" target="_blank" class="underline-link">testnet.arcscan.app ↗</a>
          </div>
          <div class="detail-row"><span class="detail-label">Currency</span><span class="detail-value">USDC (native gas token)</span></div>
          <button class="btn btn-secondary btn-full btn-sm" style="margin-top:14px;" onclick="addArcNetwork()">
            <i class="fa-solid fa-plus"></i> Add Arc Network to Wallet
          </button>
        </div>

        <!-- Circle Faucet Card -->
        <div class="card">
          <div class="card-title" style="margin-bottom:6px;"><i class="fa-solid fa-faucet text-cyan"></i>USDC Testnet Faucet</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:14px;">
            Powered by Circle — request free testnet USDC + native tokens to your connected wallet on Arc Testnet.
          </div>
          <div id="faucet-status" style="display:none; margin-bottom:12px;"></div>
          <button class="btn btn-primary btn-full btn-sm" onclick="circleRequestFaucet()">
            <i class="fa-solid fa-droplet"></i> Request Testnet USDC
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

  <!-- ════ NFT LOANS PAGE ════ -->
  <div class="page" id="page-nft-loans">
    <div class="section-title"><i class="fa-solid fa-hexagon-nodes text-cyan" style="margin-right:8px;"></i>NFT Loans</div>
    <div class="section-sub">Lock ERC-721 NFTs as collateral and borrow USDC — or fund NFT-backed loans as a lender.</div>

    <!-- Contract info banner -->
    <div class="nft-contract-banner">
      <span><i class="fa-solid fa-file-contract"></i> NFTLoanManager v2:</span>
      <code>0x0bAF758cc03C0d3fBe0e0C9b7342777282c76ee8</code>
      <a href="https://testnet.arcscan.app/address/0x0bAF758cc03C0d3fBe0e0C9b7342777282c76ee8" target="_blank" class="nft-banner-link"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
    </div>

    <div class="nft-page-grid">

      <!-- LEFT: NFT Selector + Loan Form -->
      <section class="nft-left-panel">

        <!-- NFT Search -->
        <div class="card card-lg">
          <div class="card-title"><i class="fa-solid fa-magnifying-glass text-cyan"></i>Find Your NFTs</div>

          <!-- Mint DaatFI NFT banner -->
          <div class="nft-mint-banner">
            <div class="nft-mint-banner-text">
              <i class="fa-solid fa-hammer"></i>
              <div>
                <strong>Don't have a testnet NFT?</strong>
                <span>Mint a free <em>DaatFI Testnet NFT</em> directly on Arc Testnet — one click, no cost.</span>
              </div>
            </div>
            <button id="nft-mint-btn" class="btn btn-accent" onclick="nftMintDaatFI()">
              <i class="fa-solid fa-hammer"></i> Mint NFT
            </button>
          </div>

          <div class="form-group" style="margin-bottom:8px;">
            <label class="form-label">ERC-721 Contract Address</label>
            <div style="display:flex;gap:10px;">
              <div class="input-group" style="flex:1;">
                <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                <input id="nft-contract-addr" class="form-control mono" type="text"
                       placeholder="0x… NFT contract address"
                       onkeydown="if(event.key==='Enter') nftFetchWalletNFTs()" />
              </div>
              <button class="btn btn-primary" style="white-space:nowrap;" onclick="nftFetchWalletNFTs()">
                <i class="fa-solid fa-magnifying-glass"></i> Search
              </button>
            </div>
            <span class="field-hint">
              Your connected wallet's NFTs will be shown. Use
              <a href="#" style="color:var(--primary);text-decoration:underline;" onclick="event.preventDefault();document.getElementById('nft-contract-addr').value=window.DAATFI_NFT_ADDRESS||'0x3305250a9F401D92483C1030fBEF1DC206f2Cf7b';nftFetchWalletNFTs();">
                DaatFI NFT (<code style="font-size:11px;">0x3305…Cf7b</code>)
              </a> or any other ERC-721 on Arc Testnet.
            </span>
          </div>
          <!-- ── Network rule notice ── -->
          <div class="nft-network-rule">
            <i class="fa-solid fa-circle-nodes"></i>
            <span><strong>Arc Testnet only.</strong> Any ERC-721 NFT on Arc Testnet (Chain ID&nbsp;5042002) is accepted as collateral — no collection restrictions, no rarity filters, no valuation requirements. Testnet environment.</span>
          </div>
        </div>

        <!-- NFT Grid -->
        <div class="card" style="padding:20px;margin-top:16px;">
          <div class="card-title" style="margin-bottom:16px;"><i class="fa-solid fa-grid-2 text-purple"></i>Your NFTs</div>
          <div id="nft-wallet-loading" class="nft-wallet-loading" style="display:none;">
            <i class="fa-solid fa-spinner fa-spin"></i> Scanning wallet…
          </div>
          <div id="nft-wallet-empty" class="nft-wallet-empty">
            <i class="fa-solid fa-magnifying-glass"></i><br>Enter an ERC-721 contract address above and click Search.
          </div>
          <div id="nft-wallet-grid" class="nft-wallet-grid"></div>
        </div>

        <!-- Loan Request Form (hidden until NFT selected) -->
        <div id="nft-loan-form-panel" class="card card-lg" style="display:none;margin-top:16px;">
          <div class="card-title"><i class="fa-solid fa-pen-to-square text-green"></i>Loan Request</div>

          <!-- Selected NFT preview -->
          <div id="nft-selected-preview" class="nft-selected-preview"></div>

          <div class="grid-2" style="gap:16px;margin-top:16px;">
            <div class="form-group">
              <label class="form-label">Loan Amount (USDC) <span class="required">*</span></label>
              <div class="input-group">
                <span class="input-icon" style="font-size:13px;font-weight:600;">$</span>
                <input id="nft-loan-amount" class="form-control" type="number" min="1" step="0.01" placeholder="e.g. 100" oninput="window._nftUpdateLoanPreview&&_nftUpdateLoanPreview()" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Interest Rate (%) <span class="required">*</span></label>
              <div class="input-group">
                <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                <input id="nft-interest-rate" class="form-control" type="number" min="0" max="50" step="0.1" placeholder="e.g. 5" oninput="window._nftUpdateLoanPreview&&_nftUpdateLoanPreview()" />
              </div>
              <span class="field-hint">Max 50%</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Duration (days) <span class="required">*</span></label>
            <div class="input-group">
              <svg class="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <input id="nft-duration-days" class="form-control" type="number" min="1" max="365" step="1" placeholder="e.g. 30" oninput="window._nftUpdateLoanPreview&&_nftUpdateLoanPreview()" />
            </div>
            <span class="field-hint">1 – 365 days</span>
          </div>

          <!-- Live preview -->
          <div id="nft-loan-preview" class="nft-loan-preview" style="display:none;"></div>

          <div class="nft-form-warning">
            <i class="fa-solid fa-lock"></i>
            Your NFT will be transferred to the smart contract escrow. It will be returned upon full repayment.
          </div>

          <button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="nftSubmitLoanRequest()">
            <i class="fa-solid fa-lock"></i> Lock NFT &amp; Request Loan
          </button>
        </div>

      </section><!-- /nft-left-panel -->

      <!-- RIGHT: My Loans Dashboard + Escrow Vault -->
      <section class="nft-right-panel">

        <!-- Escrow Vault -->
        <div class="card card-lg" style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
            <div class="card-title" style="margin:0;"><i class="fa-solid fa-vault text-amber"></i>Escrow Vault</div>
            <button class="btn btn-ghost btn-sm" onclick="nftLoadEscrowVault()">
              <i class="fa-solid fa-arrows-rotate"></i> Refresh
            </button>
          </div>
          <div class="nft-escrow-info">
            <i class="fa-solid fa-circle-info"></i>
            <span>NFTs locked here as collateral. They are held by the smart contract and returned upon full repayment or claimed by the lender on default.</span>
          </div>
          <div id="nft-escrow-vault-list" style="margin-top:12px;">
            <div class="nft-loans-empty"><i class="fa-solid fa-vault"></i><br>Connect wallet to view escrow vault.</div>
          </div>
        </div>

        <!-- My NFT Loans -->
        <div class="card card-lg">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
            <div class="card-title" style="margin:0;"><i class="fa-solid fa-chart-bar text-cyan"></i>My NFT Loans</div>
            <button class="btn btn-ghost btn-sm" onclick="nftLoadMyLoans()">
              <i class="fa-solid fa-arrows-rotate"></i> Refresh
            </button>
          </div>
          <div id="nft-my-loans-list">
            <div class="nft-loans-empty"><i class="fa-solid fa-wallet"></i><br>Connect wallet to see your loans.</div>
          </div>
        </div>

      </section><!-- /nft-right-panel -->

    </div><!-- /nft-page-grid -->

  </div><!-- /page-nft-loans -->

  <!-- ════ LIQUIDITY POOL PAGE ════ -->
  <div class="page" id="page-liquidity-pool">
    <div class="section-title"><i class="fa-solid fa-droplet text-cyan" style="margin-right:8px;"></i>Liquidity Pool</div>
    <div class="section-sub">Forneça liquidez USDC e ganhe rendimento proporcional. O pool financia automaticamente empréstimos NFT e Crypto na Arc Testnet.</div>

    <!-- Info Banner -->
    <div class="pool-info-banner">
      <i class="fa-solid fa-circle-info"></i>
      <span>Este pool é <strong>exclusivamente</strong> para financiar empréstimos NFT e Crypto na DaatFI. Nenhum outro contrato ou carteira pode sacar fundos sem autorização do owner.</span>
    </div>

    <!-- Stats Bar -->
    <div class="pool-stats-grid">
      <div class="pool-stat-card">
        <div class="pool-stat-label"><i class="fa-solid fa-water"></i> Liquidez Total</div>
        <div class="pool-stat-value" id="pool-total-liquidity">—</div>
        <div class="pool-stat-sub">USDC no pool</div>
      </div>
      <div class="pool-stat-card">
        <div class="pool-stat-label"><i class="fa-solid fa-wallet"></i> Seu Saldo</div>
        <div class="pool-stat-value" id="pool-user-balance">—</div>
        <div class="pool-stat-sub">USDC (inclui rendimento)</div>
      </div>
      <div class="pool-stat-card">
        <div class="pool-stat-label"><i class="fa-solid fa-chart-line"></i> APY Estimado</div>
        <div class="pool-stat-value" id="pool-apy">5%</div>
        <div class="pool-stat-sub">baseado em juros recebidos</div>
      </div>
      <div class="pool-stat-card">
        <div class="pool-stat-label"><i class="fa-solid fa-coins"></i> Suas Shares</div>
        <div class="pool-stat-value" id="pool-user-shares">—</div>
        <div class="pool-stat-sub">% de propriedade do pool</div>
      </div>
    </div>

    <!-- Deposit / Withdraw Form -->
    <div class="pool-actions-grid">

      <!-- Deposit -->
      <div class="pool-action-card">
        <div class="pool-action-title"><i class="fa-solid fa-arrow-right-to-bracket text-green"></i> Depositar USDC</div>
        <div class="pool-action-desc">Deposite USDC para fornecer liquidez e receber shares proporcionais. Seu rendimento cresce automaticamente à medida que juros de empréstimos entram no pool.</div>
        <div class="form-group" style="margin-top:16px;">
          <label class="form-label">Valor (USDC)</label>
          <input id="pool-deposit-amount" type="number" class="form-control" placeholder="Ex: 100" min="1" step="0.000001" oninput="poolUpdateDepositPreview()" />
        </div>
        <div class="pool-preview" id="pool-deposit-preview" style="display:none;">
          <div class="pool-preview-row"><span>Você receberá ≈</span><span id="pool-deposit-shares-est">—</span> shares</div>
          <div class="pool-preview-row"><span>Liquidez total após depósito:</span><span id="pool-deposit-new-total">—</span> USDC</div>
        </div>
        <button class="btn-pool-action btn-deposit" onclick="poolDeposit()">
          <i class="fa-solid fa-lock"></i> Aprovar & Depositar
        </button>
      </div>

      <!-- Withdraw -->
      <div class="pool-action-card">
        <div class="pool-action-title"><i class="fa-solid fa-arrow-right-from-bracket text-amber"></i> Sacar USDC</div>
        <div class="pool-action-desc">Queime shares para resgatar USDC proporcional + rendimento acumulado. O valor de cada share cresce com os juros pagos pelos tomadores.</div>
        <div class="form-group" style="margin-top:16px;">
          <label class="form-label">Shares a queimar</label>
          <input id="pool-withdraw-shares" type="number" class="form-control" placeholder="Ex: 50" min="0.000001" step="0.000001" oninput="poolUpdateWithdrawPreview()" />
          <div style="margin-top:6px;">
            <button class="btn-link-sm" onclick="poolSetMaxShares()">Usar máximo (<span id="pool-max-shares-label">—</span> shares)</button>
          </div>
        </div>
        <div class="pool-preview" id="pool-withdraw-preview" style="display:none;">
          <div class="pool-preview-row"><span>Você receberá ≈</span><span id="pool-withdraw-usdc-est">—</span> USDC</div>
          <div class="pool-preview-row"><span>Suas shares restantes:</span><span id="pool-withdraw-shares-left">—</span></div>
        </div>
        <button class="btn-pool-action btn-withdraw" onclick="poolWithdraw()">
          <i class="fa-solid fa-unlock"></i> Sacar USDC
        </button>
      </div>
    </div>

    <!-- Simulate Pool Funding (Testnet Mode) -->
    <div class="pool-simulate-banner">
      <div class="pool-simulate-title"><i class="fa-solid fa-flask text-cyan"></i> Modo Testnet — Simular Financiamento do Pool</div>
      <div class="pool-simulate-desc">Se o pool não tiver liquidez suficiente, empréstimos ficam com status "Requested". Use o botão abaixo para simular um aporte e testar o fluxo completo.</div>
      <button class="btn-pool-action btn-simulate" onclick="poolSimulateFunding()">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Simular Aporte no Pool (100 USDC)
      </button>
    </div>

    <!-- How it Works -->
    <div class="pool-how-section">
      <div class="pool-how-title"><i class="fa-solid fa-circle-question"></i> Como funciona?</div>
      <div class="pool-how-grid">
        <div class="pool-how-step">
          <div class="pool-how-num">1</div>
          <div class="pool-how-text"><strong>Deposite USDC</strong> — receba shares proporcional ao pool total.</div>
        </div>
        <div class="pool-how-step">
          <div class="pool-how-num">2</div>
          <div class="pool-how-text"><strong>Empréstimos são financiados automaticamente</strong> — quando um tomador solicita um empréstimo, o pool verifica liquidez e transfere USDC.</div>
        </div>
        <div class="pool-how-step">
          <div class="pool-how-num">3</div>
          <div class="pool-how-text"><strong>Juros retornam ao pool</strong> — ao repagar, o tomador devolve principal + juros, inflacionando o valor de cada share.</div>
        </div>
        <div class="pool-how-step">
          <div class="pool-how-num">4</div>
          <div class="pool-how-text"><strong>Saque a qualquer momento</strong> — queime suas shares para receber USDC + rendimento acumulado.</div>
        </div>
      </div>
    </div>

    <!-- Active Pool Loans -->
    <div class="pool-loans-section">
      <div class="pool-loans-header">
        <span><i class="fa-solid fa-list-check"></i> Empréstimos Financiados pelo Pool</span>
        <button class="btn-refresh-sm" onclick="poolLoadActiveLoans()"><i class="fa-solid fa-rotate-right"></i> Atualizar</button>
      </div>
      <div id="pool-loans-list">
        <div class="pool-empty-state"><i class="fa-solid fa-droplet-slash"></i><br>Conecte sua carteira para ver os empréstimos financiados pelo pool.</div>
      </div>
    </div>

  </div><!-- /page-liquidity-pool -->

  <!-- ════ ABOUT US PAGE ════ -->
  <div class="page" id="page-about">
    <div class="section-title"><i class="fa-solid fa-circle-info text-cyan" style="margin-right:8px;"></i>About Us</div>
    <div class="section-sub">Learn about the DaatFI platform, its purpose, and transparency commitments.</div>

    <!-- Mission Card -->
    <div class="about-hero-card">
      <div class="about-hero-inner">
        <div class="about-logo-block">
          <div class="logo-icon" style="width:56px;height:56px;font-size:26px;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><defs><linearGradient id="about-lg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#818cf8"/></linearGradient></defs><path d="M4 4 L4 20 L12 20 C17.523 20 22 16.418 22 12 C22 7.582 17.523 4 12 4 Z" fill="none" stroke="url(#about-lg)" stroke-width="2.2" stroke-linejoin="round"/><path d="M7.5 8 L7.5 16 L11.5 16 C14.538 16 17 14.209 17 12 C17 9.791 14.538 8 11.5 8 Z" fill="url(#about-lg)" opacity="0.3"/></svg>
          </div>
          <div>
            <h1 class="about-title">Daat<span class="logo-fi">FI</span></h1>
            <p class="about-tagline">Experimental DeFi Application · Arc Network Testnet</p>
          </div>
        </div>
        <div class="about-badges">
          <span class="about-badge about-badge-green"><i class="fa-solid fa-flask"></i> Testnet Only</span>
          <span class="about-badge about-badge-cyan"><i class="fa-solid fa-lock"></i> Non-Custodial</span>
          <span class="about-badge about-badge-purple"><i class="fa-solid fa-shield-halved"></i> No Real Funds</span>
        </div>
      </div>
    </div>

    <div class="about-grid">

      <!-- Who We Are -->
      <div class="card card-lg about-card">
        <div class="about-card-icon"><i class="fa-solid fa-user-tie text-cyan"></i></div>
        <h2 class="about-section-heading">About This Platform</h2>
        <p class="about-text">
          DaatFI is a <strong>testnet lending protocol</strong> built by an independent developer
          using the <strong>Arc Network</strong>. It was developed using Genspark with a strong
          focus on security, performance, and reliability.
        </p>
        <p class="about-text">
          The purpose of this <strong>experimental DeFi application</strong> is strictly for
          testing and experimental use only. The platform operates exclusively on the
          <strong>Arc Network testnet</strong> (Chain ID: 5042002).
        </p>
        <p class="about-text">
          This dApp demonstrates hybrid collateral lending — combining Real-World Assets (RWA)
          and crypto escrow — in a safe, sandboxed environment. The system includes protections
          against common vulnerabilities, exploits, and malicious interactions.
        </p>
      </div>

      <!-- Testnet Context -->
      <div class="card card-lg about-card">
        <div class="about-card-icon"><i class="fa-solid fa-triangle-exclamation text-amber"></i></div>
        <h2 class="about-section-heading">Testnet Environment</h2>
        <div class="about-warning-box">
          <p class="about-text" style="margin:0;">
            <strong>Important:</strong> This platform operates exclusively on a testnet.
            <strong>No real assets are involved.</strong>
          </p>
        </div>
        <ul class="about-list">
          <li><i class="fa-solid fa-circle-xmark text-red"></i> Loans, collateral, and repayments shown are <strong>NOT real</strong></li>
          <li><i class="fa-solid fa-circle-xmark text-red"></i> All assets used are <strong>testnet tokens only</strong></li>
          <li><i class="fa-solid fa-circle-xmark text-red"></i> <strong>No legal or financial obligation</strong> is created</li>
          <li><i class="fa-solid fa-circle-xmark text-red"></i> This is a <strong>prototype/demo environment</strong></li>
          <li><i class="fa-solid fa-circle-check text-green"></i> Keyword: <strong>no real assets involved</strong></li>
          <li><i class="fa-solid fa-circle-check text-green"></i> Keyword: <strong>non-custodial architecture</strong></li>
        </ul>
      </div>

      <!-- Security & Transparency -->
      <div class="card card-lg about-card">
        <div class="about-card-icon"><i class="fa-solid fa-shield-halved text-green"></i></div>
        <h2 class="about-section-heading">Security &amp; Transparency</h2>
        <ul class="about-list">
          <li><i class="fa-solid fa-circle-check text-green"></i> <strong>No storage</strong> of sensitive personal data</li>
          <li><i class="fa-solid fa-circle-check text-green"></i> <strong>No automatic wallet interactions</strong> without explicit user approval</li>
          <li><i class="fa-solid fa-circle-check text-green"></i> Users retain <strong>full control</strong> over their wallets at all times</li>
          <li><i class="fa-solid fa-circle-check text-green"></i> Smart contracts are deployed for <strong>testnet purposes only</strong></li>
          <li><i class="fa-solid fa-circle-check text-green"></i> Platform architecture is <strong>non-custodial</strong></li>
          <li><i class="fa-solid fa-circle-check text-green"></i> Designed for <strong>testing, education, and development</strong> only</li>
          <li><i class="fa-solid fa-circle-check text-green"></i> Protected against <strong>XSS, CSRF, and injection attacks</strong></li>
          <li><i class="fa-solid fa-circle-check text-green"></i> All API endpoints include <strong>rate limiting</strong> and input sanitization</li>
        </ul>
      </div>

      <!-- Disclaimer -->
      <div class="card card-lg about-card">
        <div class="about-card-icon"><i class="fa-solid fa-scale-balanced text-purple"></i></div>
        <h2 class="about-section-heading">Disclaimer</h2>
        <div class="about-disclaimer-box">
          <ul class="about-list" style="margin:0;">
            <li><i class="fa-solid fa-circle-dot text-amber"></i> This platform <strong>does not provide financial services</strong></li>
            <li><i class="fa-solid fa-circle-dot text-amber"></i> This is <strong>not an investment platform</strong></li>
            <li><i class="fa-solid fa-circle-dot text-amber"></i> <strong>No guarantees, returns, or profits</strong> of any kind</li>
            <li><i class="fa-solid fa-circle-dot text-amber"></i> Use at your own risk — <strong>test environment only</strong></li>
            <li><i class="fa-solid fa-circle-dot text-amber"></i> No real funds, no real transactions, no real collateral</li>
            <li><i class="fa-solid fa-circle-dot text-amber"></i> Smart contract interactions occur only on Arc Testnet</li>
          </ul>
        </div>
      </div>

    </div><!-- /about-grid -->

    <!-- Tech Stack Card -->
    <div class="card card-lg" style="margin-top:24px;">
      <div class="card-title"><i class="fa-solid fa-microchip text-cyan"></i>Technology Stack</div>
      <div class="about-tech-grid">
        <div class="about-tech-item">
          <div class="about-tech-icon"><i class="fa-brands fa-ethereum text-cyan"></i></div>
          <div class="about-tech-label">Arc Network</div>
          <div class="about-tech-desc">EVM-compatible testnet</div>
        </div>
        <div class="about-tech-item">
          <div class="about-tech-icon"><i class="fa-solid fa-file-contract text-purple"></i></div>
          <div class="about-tech-label">Smart Contracts</div>
          <div class="about-tech-desc">Solidity · Testnet only</div>
        </div>
        <div class="about-tech-item">
          <div class="about-tech-icon"><i class="fa-solid fa-wallet text-green"></i></div>
          <div class="about-tech-label">Web3 Integration</div>
          <div class="about-tech-desc">ethers.js · MetaMask / OKX</div>
        </div>
        <div class="about-tech-item">
          <div class="about-tech-icon"><i class="fa-solid fa-database text-amber"></i></div>
          <div class="about-tech-label">IPFS Storage</div>
          <div class="about-tech-desc">Pinata · Document hashing</div>
        </div>
        <div class="about-tech-item">
          <div class="about-tech-icon"><i class="fa-solid fa-cloud text-cyan"></i></div>
          <div class="about-tech-label">Cloudflare Pages</div>
          <div class="about-tech-desc">Edge deployment · Global CDN</div>
        </div>
        <div class="about-tech-item">
          <div class="about-tech-icon"><i class="fa-solid fa-robot text-purple"></i></div>
          <div class="about-tech-label">AI Agent</div>
          <div class="about-tech-desc">DaatFI AI · Genspark-built</div>
        </div>
      </div>
    </div>

    <!-- Contact / Links -->
    <div class="card" style="margin-top:24px; padding:20px 24px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="color:var(--text-secondary);font-size:13px;"><i class="fa-solid fa-circle-info text-cyan" style="margin-right:6px;"></i>Built on Arc Network Testnet · Chain ID 5042002 · For testing and development only.</span>
        <span class="about-badge about-badge-green" style="margin-left:auto;"><i class="fa-solid fa-circle"></i> Testnet Active</span>
      </div>
    </div>

  </div><!-- /page-about -->

</main>

<!-- ════ FOOTER ════ -->
<footer class="site-footer">
  <div class="footer-divider"></div>

  <!-- ── Top section: 3 equal columns ── -->
  <div class="footer-inner">

    <!-- Col 1: Brand + Network -->
    <div class="footer-col footer-col-brand">
      <div class="footer-logo">
        <span class="footer-logo-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#818cf8"/></linearGradient></defs><path d="M4 4 L4 20 L12 20 C17.523 20 22 16.418 22 12 C22 7.582 17.523 4 12 4 Z" fill="none" stroke="url(#lg2)" stroke-width="2.2" stroke-linejoin="round"/><path d="M7.5 8 L7.5 16 L11.5 16 C14.538 16 17 14.209 17 12 C17 9.791 14.538 8 11.5 8 Z" fill="url(#lg2)" opacity="0.3"/></svg></span>
        <span class="footer-logo-text">Daat<span class="footer-logo-fi">FI</span></span>
      </div>
      <p class="footer-tagline">Global decentralized lending on Arc Testnet. Hybrid RWA + crypto collateral, USDC payments, AI-powered agent — DaatFI.</p>
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
        <li><a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer" class="footer-link">
          <i class="fa-solid fa-cube"></i>Smart Contracts
        </a></li>
        <li><a href="https://github.com/julenosinger/land-and-borrow-on-arc" target="_blank" rel="noopener noreferrer" class="footer-link">
          <i class="fa-brands fa-github"></i>GitHub Repository
        </a></li>
        <li><a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer" class="footer-link">
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
      <span>© 2025 DaatFI — Decentralized Lending Protocol</span>
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
<button id="chatbot-toggle" title="DaatFI AI Agent">
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
      <div class="chat-agent-name">DaatFI AI Agent</div>
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
<script src="https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="/static/contractABI.js?v=20260415e"></script>
<script src="/static/web3Manager.js?v=20260415e"></script>
<script src="/static/ui.js?v=20260415e"></script>
<script src="/static/chatbot.js?v=20260415e"></script>
<script src="/static/marketplace.js?v=20260415e"></script>
<script src="/static/receipt.js?v=20260415e"></script>
<script src="/static/docs-viewer.js?v=20260415e"></script>
<script src="/static/security.js?v=20260415e"></script>
<script src="/static/nftLoans.js?v=20260415e"></script>
<script src="/static/liquidityPool.js?v=20260415e"></script>
<script src="/static/app.js?v=20260415e"></script>
</body>
</html>`)
})

// ── API: Health ────────────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', network: 'Arc Testnet', chainId: 5042002, marketplace: true }))

// ── API: Receipt storage ───────────────────────────────────────────────────────
const receipts: Map<string, object> = new Map()
const MAX_RECEIPTS = 1000

app.post('/api/receipts', async (c) => {
  try {
    const body = await c.req.json() as any
    const allowed = ['txHash','loanId','amount','type','network','address','rate','installments']
    const safe: Record<string,string> = {}
    for (const k of allowed) {
      if (body[k] !== undefined) {
        const v = String(body[k]).slice(0, 256)
        if (!_isSafeString(v)) {
          _secLog('XSS_ATTEMPT_RECEIPT', c.req.header('CF-Connecting-IP') ?? 'unknown', { field: k })
          return c.json({ error: 'Invalid input detected.' }, 400)
        }
        safe[k] = v
      }
    }
    const id = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    if (receipts.size >= MAX_RECEIPTS) { const fk = receipts.keys().next().value; if(fk) receipts.delete(fk) }
    receipts.set(id, { ...safe, id, createdAt: new Date().toISOString() })
    return c.json({ success: true, id })
  } catch {
    return c.json({ error: 'Invalid body' }, 400)
  }
})

app.get('/api/receipts/:id', (c) => {
  const rid = c.req.param('id')
  if (!_isAlphanumericId(rid)) return c.json({ error: 'Invalid id' }, 400)
  const r = receipts.get(rid)
  if (!r) return c.json({ error: 'Not found' }, 404)
  return c.json(r)
})

// ── API: Loan metadata offchain cache ──────────────────────────────────────────
const loanMeta: Map<string, object> = new Map()
const MAX_LOAN_META = 500

app.post('/api/loans/meta', async (c) => {
  try {
    const body = await c.req.json() as any
    const loanId = body?.loanId
    if (!loanId || !/^\d{1,10}$/.test(String(loanId))) return c.json({ error: 'Valid loanId required' }, 400)
    const allowed = ['loanId','borrowerName','location','employment','collateralDetail']
    const safe: Record<string,string> = {}
    for (const k of allowed) {
      if (body[k] !== undefined) {
        const v = String(body[k]).slice(0, 512)
        if (!_isSafeString(v)) {
          _secLog('INJECTION_LOANMETA', c.req.header('CF-Connecting-IP') ?? 'unknown', { field: k })
          return c.json({ error: 'Invalid input detected.' }, 400)
        }
        safe[k] = v
      }
    }
    if (loanMeta.size >= MAX_LOAN_META) { const fk = loanMeta.keys().next().value; if(fk) loanMeta.delete(fk) }
    loanMeta.set(loanId.toString(), { ...safe, loanId, updatedAt: new Date().toISOString() })
    return c.json({ success: true })
  } catch {
    return c.json({ error: 'Invalid body' }, 400)
  }
})

app.get('/api/loans/meta/:loanId', (c) => {
  const lid = c.req.param('loanId')
  if (!/^\d{1,10}$/.test(lid)) return c.json({ error: 'Invalid loanId' }, 400)
  const m = loanMeta.get(lid)
  return c.json(m || {})
})

// ── API: Marketplace offer metadata cache ──────────────────────────────────────
const offerMeta: Map<string, object> = new Map()
const MAX_OFFER_META = 500

app.post('/api/offers/meta', async (c) => {
  try {
    const body = await c.req.json() as any
    const offerId = body?.offerId
    if (!offerId || !_isAlphanumericId(String(offerId))) return c.json({ error: 'Valid offerId required' }, 400)
    const allowed = ['offerId','lenderName','rate','liquidity','collateralType']
    const safe: Record<string,string> = {}
    for (const k of allowed) {
      if (body[k] !== undefined) {
        const v = String(body[k]).slice(0, 256)
        if (!_isSafeString(v)) {
          _secLog('INJECTION_OFFERMETA', c.req.header('CF-Connecting-IP') ?? 'unknown', { field: k })
          return c.json({ error: 'Invalid input detected.' }, 400)
        }
        safe[k] = v
      }
    }
    if (offerMeta.size >= MAX_OFFER_META) { const fk = offerMeta.keys().next().value; if(fk) offerMeta.delete(fk) }
    offerMeta.set(offerId.toString(), { ...safe, offerId, updatedAt: new Date().toISOString() })
    return c.json({ success: true })
  } catch {
    return c.json({ error: 'Invalid body' }, 400)
  }
})

app.get('/api/offers/meta/:offerId', (c) => {
  const oid = c.req.param('offerId')
  if (!_isAlphanumericId(oid)) return c.json({ error: 'Invalid offerId' }, 400)
  const m = offerMeta.get(oid)
  return c.json(m || {})
})

// ── API: Circle — proxy (key stays server-side) ───────────────────────────────
const CIRCLE_BASE = 'https://api.circle.com/v1/w3s'

// GET /api/circle/faucet?address=0x...  → request testnet USDC
app.post('/api/circle/faucet', async (c) => {
  const key = c.env.CIRCLE_API_KEY
  if (!key) return c.json({ error: 'Circle API not configured' }, 503)
  try {
    const { address } = await c.req.json() as { address?: string }
    if (!address || !_isEthAddress(address)) {
      _secLog('INVALID_FAUCET_ADDR', c.req.header('CF-Connecting-IP') ?? 'unknown', {})
      return c.json({ error: 'Valid Ethereum address required' }, 400)
    }
    const res = await fetch(`${CIRCLE_BASE}/testnet/faucet`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ blockchain: 'ARC-TESTNET', address, usdc: true, native: true })
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (res.status === 204 || res.ok) return c.json({ success: true })
    return c.json({ error: data?.message || 'Faucet request failed', detail: data }, res.status as any)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/circle/balance?address=0x...  → USDC balance via Circle
app.get('/api/circle/balance', async (c) => {
  const key = c.env.CIRCLE_API_KEY
  if (!key) return c.json({ error: 'Circle API not configured' }, 503)
  try {
    const address = c.req.query('address')
    if (!address || !_isEthAddress(address)) return c.json({ error: 'Valid Ethereum address required' }, 400)
    // List wallets filtered by address
    const res = await fetch(`${CIRCLE_BASE}/wallets?blockchain=ARC-TESTNET&pageSize=50`, {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    const data = await res.json() as any
    const wallet = data?.data?.wallets?.find(
      (w: any) => w.address?.toLowerCase() === address.toLowerCase()
    )
    return c.json({ address, walletId: wallet?.id || null, found: !!wallet })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/circle/wallets  → list all Circle wallets on ARC-TESTNET
app.get('/api/circle/wallets', async (c) => {
  const key = c.env.CIRCLE_API_KEY
  if (!key) return c.json({ error: 'Circle API not configured' }, 503)
  try {
    const res = await fetch(`${CIRCLE_BASE}/wallets?blockchain=ARC-TESTNET&pageSize=50`, {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    const data = await res.json() as any
    const wallets = (data?.data?.wallets || []).map((w: any) => ({
      id: w.id,
      address: w.address,
      state: w.state,
      custodyType: w.custodyType,
      createDate: w.createDate
    }))
    return c.json({ wallets, count: wallets.length })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ── IPFS Upload proxy (keeps PINATA_JWT secret-side only) ───────────────────
app.post('/api/ipfs/upload', async (c) => {
  const jwt = c.env?.PINATA_JWT
  if (!jwt) return c.json({ error: 'IPFS upload not configured' }, 503)

  try {
    // Forward the multipart form data as-is to Pinata
    const body = await c.req.raw.formData()
    const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body,
    })
    if (!resp.ok) {
      const txt = await resp.text()
      return c.json({ error: `Pinata error ${resp.status}: ${txt}` }, 502)
    }
    const data: any = await resp.json()
    return c.json({
      IpfsHash: data.IpfsHash,
      uri:  `ipfs://${data.IpfsHash}`,
      url:  `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default app
