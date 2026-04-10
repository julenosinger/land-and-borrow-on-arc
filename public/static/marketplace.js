/**
 * DaatFI Marketplace v3.0 — Fully On-Chain
 * ─────────────────────────────────────────────────────────────────────────────
 * All data sourced directly from DaatFI Loan Manager on Arc Testnet.
 * NO API calls. NO mock data. NO backend. 100% on-chain reads.
 *
 * Marketplace = loans with status Requested (0) and no lender assigned.
 * Lenders browse requests, set interest rate, approve, then fund.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Module state ──────────────────────────────────────────────────────────────
const MP = {
  allLoans:      [],   // raw normalised loans from chain
  filtered:      [],   // after filter
  loading:       false,
  lastFetch:     0,
  CACHE_TTL_MS:  30_000,  // re-fetch if > 30s old

  // Active filter state
  filters: {
    minAmount:   0,
    maxAmount:   0,
    collateral:  '',   // '' | 'RWA' | 'CRYPTO'
    maxInstall:  0,
    sortBy:      'newest'  // 'newest' | 'amount_asc' | 'amount_desc' | 'installments'
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a simple risk score (UI-only) for a loan request.
 * Based on collateral type, amount requested, and installment count.
 * Returns { label, color, icon }
 */
function mpRiskScore(loan) {
  let score = 0;

  // Higher principal → higher risk
  const amt = parseFloat(loan.principalAmount);
  if (amt >= 10000) score += 2;
  else if (amt >= 2000) score += 1;

  // More installments → higher risk (longer exposure)
  if (loan.totalInstallments >= 8) score += 2;
  else if (loan.totalInstallments >= 5) score += 1;

  // Crypto collateral → lower risk than RWA (on-chain enforceability)
  if (loan.collateral?.colType === 1) score -= 1;

  if (score <= 0) return { label: 'Low',    cls: 'risk-low',    icon: '🟢' };
  if (score <= 2) return { label: 'Medium', cls: 'risk-medium', icon: '🟡' };
  return           { label: 'High',   cls: 'risk-high',   icon: '🔴' };
}

/**
 * Returns elapsed time string: "2h ago", "3d ago", etc.
 */
function mpTimeAgo(ts) {
  if (!ts) return 'Unknown';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)          return 'Just now';
  if (diff < 3600)        return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)       return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000)     return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

function mpFmt(n, dec = 2) {
  const v = parseFloat(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function mpShortAddr(addr) {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOAD FROM CHAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry: load all loans from DaatFI Loan Manager, filter to
 * status=Requested (0) + no lender, update stats, render cards.
 *
 * Uses getLoansBatch() for efficiency (single call per N loans).
 */
async function loadMarketplace(forceRefresh = false) {
  const container = document.getElementById('marketplace-listings');
  if (!container) return;

  // Guard: need either signed contract or read-only contract
  const rc = window.web3?.getReadContract?.();
  if (!rc) {
    _mpShowBanner(container, '🔧', 'Contract Not Configured',
      'Set the DaatFI Loan Manager address in <button onclick="showPage(\'settings\')" class="underline-link" style="background:none;border:none;cursor:pointer;font-family:inherit;">Settings</button>.',
      false);
    return;
  }

  // Cache: skip reload if recent
  const now = Date.now();
  if (!forceRefresh && MP.allLoans.length && (now - MP.lastFetch) < MP.CACHE_TTL_MS) {
    _mpApplyFilters();
    return;
  }

  if (MP.loading) return;
  MP.loading = true;

  _mpSetLoadingState(container);

  try {
    // ── 1. Get total loan count ───────────────────────────────────────────────
    const rc         = window.web3.getReadContract();
    const totalBN    = await rc.getTotalLoans();
    const total      = Number(totalBN);

    if (total === 0) {
      MP.allLoans  = [];
      MP.filtered  = [];
      _mpUpdateStats(0, 0, 0);
      _mpShowEmpty(container, 'No Loan Requests Yet',
        'No one has created a loan request yet. Be the first!');
      MP.loading = false;
      return;
    }

    // ── 2. Fetch in batches of 20 to avoid RPC limits ────────────────────────
    const BATCH = 20;
    const allRaw = [];

    for (let start = 1; start <= total; start += BATCH) {
      const end = Math.min(start + BATCH - 1, total);
      const ids = [];
      for (let id = start; id <= end; id++) ids.push(id);

      try {
        const batch = await rc.getLoansBatch(ids);
        batch.forEach(raw => allRaw.push(raw));
      } catch (batchErr) {
        // Fallback: individual calls if batch fails
        console.warn('Batch failed, falling back to individual calls', batchErr.message);
        for (const id of ids) {
          try {
            const raw = await rc.getLoan(id);
            allRaw.push(raw);
          } catch { /* skip invalid loan */ }
        }
      }
    }

    // ── 3. Normalise using web3Manager helper ─────────────────────────────────
    MP.allLoans = allRaw
      .map(raw => { try { return window.web3._normalizeLoan(raw); } catch { return null; } })
      .filter(Boolean);

    MP.lastFetch = Date.now();

    // ── 4. Filter, sort, render ───────────────────────────────────────────────
    _mpApplyFilters();

  } catch (err) {
    console.error('loadMarketplace error:', err);
    _mpShowBanner(container, '❌', 'Failed to Load',
      `Blockchain read error: ${err.message}`, false);
  } finally {
    MP.loading = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  FILTER & SORT
// ─────────────────────────────────────────────────────────────────────────────

function applyMarketplaceFilters() {
  MP.filters.minAmount  = parseFloat(document.getElementById('mp-filter-min')?.value  || 0) || 0;
  MP.filters.maxAmount  = parseFloat(document.getElementById('mp-filter-max')?.value  || 0) || 0;
  MP.filters.collateral = document.getElementById('mp-filter-col')?.value  || '';
  MP.filters.maxInstall = parseInt(document.getElementById('mp-filter-inst')?.value || 0) || 0;
  MP.filters.sortBy     = document.getElementById('mp-sort')?.value || 'newest';
  _mpApplyFilters();
}

function clearMarketplaceFilters() {
  ['mp-filter-min','mp-filter-max'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['mp-filter-col','mp-filter-inst','mp-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  MP.filters = { minAmount: 0, maxAmount: 0, collateral: '', maxInstall: 0, sortBy: 'newest' };
  _mpApplyFilters();
}

function _mpApplyFilters() {
  const container = document.getElementById('marketplace-listings');
  if (!container) return;

  // Show ONLY: Requested (status=0) AND no lender set
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
  let loans = MP.allLoans.filter(l =>
    l.status === 0 &&
    (!l.lender || l.lender.toLowerCase() === ZERO_ADDR.toLowerCase())
  );

  // Apply user filters
  const { minAmount, maxAmount, collateral, maxInstall } = MP.filters;
  if (minAmount > 0) loans = loans.filter(l => parseFloat(l.principalAmount) >= minAmount);
  if (maxAmount > 0) loans = loans.filter(l => parseFloat(l.principalAmount) <= maxAmount);
  if (collateral) {
    loans = loans.filter(l =>
      collateral === 'RWA'    ? l.collateral?.colType === 0 :
      collateral === 'CRYPTO' ? l.collateral?.colType === 1 : true
    );
  }
  if (maxInstall > 0) loans = loans.filter(l => l.totalInstallments <= maxInstall);

  // Sort
  switch (MP.filters.sortBy) {
    case 'amount_desc': loans.sort((a,b) => parseFloat(b.principalAmount) - parseFloat(a.principalAmount)); break;
    case 'amount_asc':  loans.sort((a,b) => parseFloat(a.principalAmount) - parseFloat(b.principalAmount)); break;
    case 'installments':loans.sort((a,b) => a.totalInstallments - b.totalInstallments); break;
    case 'newest':
    default:            loans.sort((a,b) => b.createdAt - a.createdAt); break;
  }

  MP.filtered = loans;

  // Stats
  const requested = MP.allLoans.filter(l => l.status === 0 && (!l.lender || l.lender === ZERO_ADDR));
  const active    = MP.allLoans.filter(l => l.status === 2);
  const totalVol  = MP.allLoans.filter(l => l.status >= 2).reduce((s, l) => s + parseFloat(l.principalAmount), 0);
  _mpUpdateStats(requested.length, active.length, totalVol);

  _mpRenderCards(loans);
}

// ─────────────────────────────────────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────────────────────────────────────

function _mpUpdateStats(requestCount, activeCount, totalVol) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('mp-stat-requests',  requestCount);
  set('mp-stat-active',    activeCount);
  set('mp-stat-volume',    `$${mpFmt(totalVol, 0)}`);
  set('mp-stat-total',     MP.allLoans.length);

  // Home page sync
  set('home-stat-offers',  requestCount);
  set('home-stat-vol',     `$${mpFmt(totalVol, 0)}`);
}

function _mpSetLoadingState(container) {
  container.innerHTML = `
    <div class="mp-loading-grid" style="grid-column:1/-1; padding:60px 0; text-align:center;">
      <div class="mp-spinner-wrap">
        <div class="spinner dark" style="margin:0 auto 16px; width:36px; height:36px;"></div>
        <div style="font-size:15px; font-weight:600; color:var(--text-primary); margin-bottom:6px;">
          Reading blockchain data…
        </div>
        <div style="font-size:12px; color:var(--text-muted);">
          Fetching loan requests from Arc Testnet (Chain ID 5042002)
        </div>
      </div>
    </div>`;
}

function _mpShowEmpty(container, title, desc) {
  container.innerHTML = `
    <div style="grid-column:1/-1; padding:72px 24px; text-align:center;">
      <div style="font-size:52px; margin-bottom:16px; opacity:.6;">📭</div>
      <div class="empty-title" style="font-size:18px; margin-bottom:8px;">${title}</div>
      <div class="empty-desc" style="font-size:13px; max-width:400px; margin:0 auto 24px;">${desc}</div>
      <button class="btn btn-primary" onclick="showPage('borrow')">
        <i class="fa-solid fa-plus"></i> Create Loan Request
      </button>
    </div>`;
}

function _mpShowBanner(container, icon, title, desc, showBtn = true) {
  container.innerHTML = `
    <div style="grid-column:1/-1; padding:72px 24px; text-align:center;">
      <div style="font-size:52px; margin-bottom:16px;">${icon}</div>
      <div class="empty-title" style="font-size:18px; margin-bottom:8px;">${title}</div>
      <div class="empty-desc" style="font-size:13px; max-width:440px; margin:0 auto;">${desc}</div>
      ${showBtn ? `<button class="btn btn-secondary" style="margin-top:20px;" onclick="loadMarketplace(true)">
        <i class="fa-solid fa-rotate"></i> Retry
      </button>` : ''}
    </div>`;
}

function _mpRenderCards(loans) {
  const container = document.getElementById('marketplace-listings');
  if (!container) return;

  if (!loans.length) {
    container.innerHTML = `
      <div style="grid-column:1/-1; padding:72px 24px; text-align:center;">
        <div style="font-size:52px; margin-bottom:16px; opacity:.6;">🔍</div>
        <div class="empty-title" style="margin-bottom:8px;">No requests match your filters</div>
        <div class="empty-desc" style="margin-bottom:20px;">
          There are ${MP.allLoans.filter(l=>l.status===0).length} open requests on-chain — try broadening your search.
        </div>
        <button class="btn btn-secondary" onclick="clearMarketplaceFilters()">
          <i class="fa-solid fa-xmark"></i> Clear Filters
        </button>
      </div>`;
    return;
  }

  // Count label
  const countEl = document.getElementById('mp-result-count');
  if (countEl) countEl.textContent = `${loans.length} request${loans.length !== 1 ? 's' : ''}`;

  container.innerHTML = loans.map(loan => _mpBuildCard(loan)).join('');
}

function _mpBuildCard(loan) {
  const risk   = mpRiskScore(loan);
  const colType = loan.collateral?.colType === 0 ? 'RWA' : 'CRYPTO';
  const colIcon = colType === 'RWA' ? '🏠' : '🔐';

  // Collateral detail preview
  let colDetail = '';
  if (colType === 'RWA' && loan.collateral?.assetType) {
    colDetail = escapeHtml(loan.collateral.assetType);
  } else if (colType === 'CRYPTO' && loan.collateral?.cryptoToken) {
    const tok = loan.collateral.cryptoToken;
    colDetail = tok.length > 20 ? `${tok.slice(0,8)}…${tok.slice(-4)}` : escapeHtml(tok);
  }

  // Borrower info
  const borrowerName    = loan.borrowerInfo?.fullName    || '';
  const borrowerCountry = loan.borrowerInfo?.country     || '';
  const borrowerCity    = loan.borrowerInfo?.city        || '';
  const employment      = loan.borrowerInfo?.employmentStatus || '';
  const location        = [borrowerCity, borrowerCountry].filter(Boolean).join(', ') || '—';

  // Financial projection (max 5% rate)
  const principal  = parseFloat(loan.principalAmount);
  const maxInterest = (principal * 0.05 * loan.totalInstallments).toFixed(2);
  const maxTotal    = (principal + parseFloat(maxInterest)).toFixed(2);
  const minInstAmt  = loan.totalInstallments > 0
    ? (principal / loan.totalInstallments).toFixed(2)
    : principal.toFixed(2);

  const isConnected = window.web3?.isConnected?.();
  const isBorrower  = isConnected &&
    loan.borrower?.toLowerCase() === window.web3?.address?.toLowerCase();

  return `
    <div class="mp-loan-card" data-loan-id="${loan.id}">
      <!-- ── Card header ───────────────────────────────────────────── -->
      <div class="mp-card-header">
        <div class="mp-card-id">
          <span class="mp-loan-num">#${loan.id}</span>
          <span class="mp-time-ago">${mpTimeAgo(loan.createdAt)}</span>
        </div>
        <div class="mp-card-badges">
          <span class="mp-risk-badge ${risk.cls}">${risk.icon} ${risk.label} Risk</span>
          <span class="mp-col-badge mp-col-${colType.toLowerCase()}">${colIcon} ${colType}</span>
        </div>
      </div>

      <!-- ── Principal highlight ──────────────────────────────────── -->
      <div class="mp-amount-block">
        <div class="mp-amount-label">Loan Requested</div>
        <div class="mp-amount-value">$${mpFmt(loan.principalAmount)}</div>
        <div class="mp-amount-sub">USDC · ${loan.totalInstallments} installment${loan.totalInstallments !== 1 ? 's' : ''}</div>
      </div>

      <!-- ── Borrower info ─────────────────────────────────────────── -->
      <div class="mp-info-grid">
        ${borrowerName ? `
        <div class="mp-info-row">
          <span class="mp-info-label">Borrower</span>
          <span class="mp-info-value">${escapeHtml(borrowerName)}</span>
        </div>` : ''}
        <div class="mp-info-row">
          <span class="mp-info-label">Wallet</span>
          <span class="mp-info-value mono" style="font-size:11px;">${mpShortAddr(loan.borrower)}</span>
        </div>
        ${location !== '—' ? `
        <div class="mp-info-row">
          <span class="mp-info-label">Location</span>
          <span class="mp-info-value">${escapeHtml(location)}</span>
        </div>` : ''}
        ${employment ? `
        <div class="mp-info-row">
          <span class="mp-info-label">Employment</span>
          <span class="mp-info-value">${escapeHtml(employment)}</span>
        </div>` : ''}
        <div class="mp-info-row">
          <span class="mp-info-label">Collateral</span>
          <span class="mp-info-value">${colIcon} ${colType}${colDetail ? ` — ${colDetail}` : ''}</span>
        </div>
        <div class="mp-info-row" style="border:none;">
          <span class="mp-info-label">Installments</span>
          <span class="mp-info-value">${loan.totalInstallments} × ~$${minInstAmt} USDC</span>
        </div>
      </div>

      <!-- ── Earnings estimate (for lender) ───────────────────────── -->
      <div class="mp-earn-strip">
        <div class="mp-earn-item">
          <div class="mp-earn-label">Max you earn</div>
          <div class="mp-earn-val text-green">+$${maxInterest}</div>
        </div>
        <div class="mp-earn-divider"></div>
        <div class="mp-earn-item">
          <div class="mp-earn-label">Total return</div>
          <div class="mp-earn-val">$${maxTotal}</div>
        </div>
        <div class="mp-earn-divider"></div>
        <div class="mp-earn-item">
          <div class="mp-earn-label">At max rate (5%)</div>
          <div class="mp-earn-val text-cyan">5%/mo</div>
        </div>
      </div>

      <!-- ── Actions ───────────────────────────────────────────────── -->
      <div class="mp-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="mpViewLoanDetail(${loan.id})" title="View full details">
          <i class="fa-solid fa-eye"></i> Details
        </button>
        ${isBorrower
          ? `<button class="btn btn-secondary btn-sm" disabled title="This is your own request" style="opacity:.5; cursor:not-allowed;">
               <i class="fa-solid fa-lock"></i> Own Request
             </button>`
          : !isConnected
          ? `<button class="btn btn-primary" onclick="connectWalletAndFund(${loan.id})" style="flex:1;">
               <i class="fa-solid fa-wallet"></i> Connect & Fund
             </button>`
          : `<button class="btn btn-primary mp-fund-btn" onclick="mpOpenFundModal(${loan.id})" style="flex:1;">
               <i class="fa-solid fa-bolt"></i> Fund This Loan
             </button>`
        }
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  FUND LOAN FLOW  (approve → fundLoan)
// ─────────────────────────────────────────────────────────────────────────────

async function connectWalletAndFund(loanId) {
  try {
    await window.web3.connectWallet();
    mpOpenFundModal(loanId);
  } catch (err) {
    showToast(err.message, 'error', 6000);
  }
}

function mpOpenFundModal(loanId) {
  const loan = MP.allLoans.find(l => l.id == loanId);
  if (!loan) { showToast('Loan not found in cache. Please refresh.', 'error'); return; }

  const principal = parseFloat(loan.principalAmount);

  showModal({
    title: `⚡ Fund Loan Request #${loanId}`,
    size:  'modal-md',
    content: `
      <div style="display:flex; flex-direction:column; gap:16px;">

        <!-- Loan summary -->
        <div style="background:var(--bg-input); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px;">
          <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;">Loan Summary</div>
          <div class="detail-row"><span class="detail-label">Loan ID</span><span class="detail-value mono" style="color:var(--cyan);">#${loanId}</span></div>
          <div class="detail-row"><span class="detail-label">Borrower</span><span class="detail-value mono" style="font-size:11px;">${mpShortAddr(loan.borrower)}</span></div>
          <div class="detail-row"><span class="detail-label">Principal</span><span class="detail-value mono font-bold" style="color:var(--cyan);">$${mpFmt(principal)} USDC</span></div>
          <div class="detail-row"><span class="detail-label">Installments</span><span class="detail-value">${loan.totalInstallments}</span></div>
          <div class="detail-row" style="border:none;"><span class="detail-label">Collateral</span><span class="detail-value">${loan.collateral?.colTypeLabel || 'RWA'}</span></div>
        </div>

        <!-- Interest rate input -->
        <div class="form-group" style="margin:0;">
          <label class="form-label" style="font-size:13px;">
            Monthly Interest Rate <span class="req">*</span>
            <span style="font-weight:400; color:var(--text-muted);"> — max 5%</span>
          </label>
          <div class="input-group">
            <input id="mp-fund-rate"
              class="form-control"
              type="number"
              min="1" max="5" step="1"
              value="3"
              placeholder="1–5"
              oninput="mpUpdateFundPreview(${loanId})" />
            <span class="input-suffix">% / month</span>
          </div>
          <span class="field-hint">Integer 1–5%. Fixed rate, no compounding.</span>
          <span class="field-error" id="mp-fund-rate-err"></span>
        </div>

        <!-- Live financial preview -->
        <div id="mp-fund-preview" style="background:rgba(6,182,212,0.06); border:1px solid rgba(6,182,212,0.2); border-radius:var(--radius-md); padding:14px;">
          <div style="font-size:12px; font-weight:700; color:var(--cyan); margin-bottom:10px; text-transform:uppercase; letter-spacing:.04em;">
            <i class="fa-solid fa-calculator" style="margin-right:4px;"></i>Financial Preview
          </div>
          <div id="mp-fund-preview-rows"></div>
        </div>

        <!-- Steps info -->
        <div class="legal-banner legal-banner-info" style="margin:0;">
          <i class="fa-solid fa-info-circle" style="flex-shrink:0;"></i>
          <div style="font-size:12px; line-height:1.6;">
            <strong>Two on-chain transactions:</strong><br>
            1. <strong>approveLoan()</strong> — sets terms &amp; your rate<br>
            2. <strong>fundLoan()</strong> — approves USDC spend, transfers funds to borrower
          </div>
        </div>

      </div>
    `,
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      {
        label: '<i class="fa-solid fa-bolt"></i> Approve &amp; Fund',
        primary: true,
        onClick: async (close) => {
          const rateInput = document.getElementById('mp-fund-rate');
          const rate = parseInt(rateInput?.value);
          if (!rate || rate < 1 || rate > 5) {
            const err = document.getElementById('mp-fund-rate-err');
            if (err) { err.textContent = 'Rate must be 1–5'; err.classList.add('show'); }
            return;
          }
          close();
          await mpExecuteFund(loanId, rate, principal);
        }
      }
    ],
    onOpen: () => mpUpdateFundPreview(loanId)
  });
}

function mpUpdateFundPreview(loanId) {
  const loan = MP.allLoans.find(l => l.id == loanId);
  if (!loan) return;

  const rate      = parseFloat(document.getElementById('mp-fund-rate')?.value) || 3;
  const principal = parseFloat(loan.principalAmount);
  const n         = loan.totalInstallments;
  const interest  = (principal * (rate / 100) * n).toFixed(2);
  const total     = (principal + parseFloat(interest)).toFixed(2);
  const instAmt   = (parseFloat(total) / n).toFixed(2);

  const rows = document.getElementById('mp-fund-preview-rows');
  if (!rows) return;
  rows.innerHTML = `
    <div class="detail-row"><span class="detail-label">You send now</span><span class="detail-value mono text-amber">$${mpFmt(principal)} USDC</span></div>
    <div class="detail-row"><span class="detail-label">Interest earned</span><span class="detail-value mono text-green">+$${interest} USDC</span></div>
    <div class="detail-row"><span class="detail-label">You receive back</span><span class="detail-value mono font-bold">$${total} USDC</span></div>
    <div class="detail-row" style="border:none;"><span class="detail-label">Per installment</span><span class="detail-value mono text-cyan">$${instAmt} USDC</span></div>`;
}

async function mpExecuteFund(loanId, interestRate, principalAmount) {
  const toast1 = showToast(`Step 1/2 — Approving loan #${loanId} at ${interestRate}%/mo…`, 'info', 0);

  try {
    // ── Step 1: approveLoan ───────────────────────────────────────────────────
    await window.web3.approveLoan(loanId, interestRate);
    toast1?.remove?.();
    showToast('Loan approved ✓', 'success', 2000);

    // Brief pause for chain state to propagate
    await new Promise(r => setTimeout(r, 1500));

    // ── Step 2: fundLoan (approve USDC + transfer) ────────────────────────────
    const toast2 = showToast(`Step 2/2 — Funding loan #${loanId} ($${mpFmt(principalAmount)} USDC)…`, 'info', 0);
    const fundResult = await window.web3.fundLoan(loanId, principalAmount);
    toast2?.remove?.();

    // ── Success ───────────────────────────────────────────────────────────────
    showToast(`🎉 Loan #${loanId} funded! USDC sent to borrower.`, 'success', 8000);

    // ── Generate PDF receipt (background, non-blocking) ───────────────────────
    if (window.RCPT) {
      try {
        const loanFull = await window.web3.getLoanFull(loanId);
        const fundTxHash = fundResult?.receipt?.transactionHash || fundResult?.tx?.hash || '';
        const receiptId = await window.RCPT.generate(
          loanFull,
          'LOAN_FUNDED',
          { fund: fundTxHash },
          { wallet: window.web3?.address }
        );
        showToast(`📄 Receipt ready — Loan #${loanId}`, 'info', 4000);
        // Update the success modal to include View Receipt button
        _mpShowFundSuccessModal(loanId, interestRate, principalAmount, receiptId);
      } catch (rErr) {
        console.warn('[DaatFI Receipt] Receipt generation error:', rErr);
        _mpShowFundSuccessModal(loanId, interestRate, principalAmount, null);
      }
    } else {
      _mpShowFundSuccessModal(loanId, interestRate, principalAmount, null);
    }

    // Invalidate cache and refresh
    MP.lastFetch = 0;
    setTimeout(() => loadMarketplace(true), 3000);

  } catch (err) {
    toast1?.remove?.();
    console.error('mpExecuteFund error:', err);
    showToast(`Transaction failed: ${err.message}`, 'error', 10000);
  }
}

function _mpShowFundSuccessModal(loanId, rate, amount, receiptId) {
  const rcptBtn = receiptId
    ? `<button class="btn btn-secondary btn-sm" style="margin-top:12px; width:100%;" onclick="window.RCPT&&window.RCPT.view('${receiptId}')">
         <i class="fa-solid fa-file-pdf"></i> View Loan Receipt
       </button>`
    : '';
  showModal({
    title: '🎉 Loan Funded!',
    size: 'modal-sm',
    content: `
      <div style="text-align:center; padding:12px 0;">
        <div style="font-size:52px; margin-bottom:12px;">🎉</div>
        <div style="font-size:20px; font-weight:800; color:var(--text-primary); margin-bottom:6px;">Loan #${loanId} Active!</div>
        <div style="font-size:13px; color:var(--text-secondary); margin-bottom:20px;">
          Funds sent to borrower. You'll receive repayments as installments are paid.
        </div>
        <div class="card card-sm" style="background:var(--bg-input); text-align:left; margin-bottom:16px;">
          <div class="detail-row"><span class="detail-label">Loan</span><span class="detail-value mono" style="color:var(--cyan);">#${loanId}</span></div>
          <div class="detail-row"><span class="detail-label">Amount Sent</span><span class="detail-value mono">$${mpFmt(amount)} USDC</span></div>
          <div class="detail-row" style="border:none;"><span class="detail-label">Your Rate</span><span class="detail-value text-green font-bold">${rate}%/month</span></div>
        </div>
        ${rcptBtn}
        <div style="font-size:12px; color:var(--text-muted); margin-top:12px;">
          Track repayments in your <strong>Dashboard</strong> → Lend tab.
        </div>
      </div>
    `,
    actions: [
      { label: 'View Dashboard', primary: true, onClick: (c) => { c(); showPage('lend'); } },
      { label: 'Browse More',    onClick: (c) => { c(); loadMarketplace(true); } }
    ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOAN DETAIL MODAL (from marketplace card)
// ─────────────────────────────────────────────────────────────────────────────

async function mpViewLoanDetail(loanId) {
  // Try cache first; fetch from chain if not available
  let loan = MP.allLoans.find(l => l.id == loanId);

  const rc = window.web3?.getReadContract?.();
  if (!loan && rc) {
    const t = showToast('Loading details…', 'info', 0);
    try {
      const raw = await rc.getLoan(loanId);
      loan = window.web3._normalizeLoan(raw);
      t?.remove?.();
    } catch (e) {
      t?.remove?.();
      showToast('Failed to load loan details', 'error');
      return;
    }
  }

  if (!loan) { showToast('Loan data not found', 'error'); return; }

  const risk    = mpRiskScore(loan);
  const col     = loan.collateral || {};
  const bi      = loan.borrowerInfo || {};
  const isConnected = window.web3?.isConnected?.();
  const isBorrower  = isConnected && loan.borrower?.toLowerCase() === window.web3?.address?.toLowerCase();

  showModal({
    title: `📋 Loan Request #${loanId}`,
    size:  'modal-lg',
    content: `
      <div class="grid-2" style="gap:20px;">
        <!-- LEFT -->
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:12px; color:var(--cyan); margin-bottom:10px;">👤 Borrower</div>
            ${bi.fullName ? `<div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${escapeHtml(bi.fullName)}</span></div>` : ''}
            <div class="detail-row"><span class="detail-label">Wallet</span><span class="detail-value mono" style="font-size:10px; word-break:break-all;">${loan.borrower}</span></div>
            ${bi.country ? `<div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${escapeHtml([bi.city, bi.country].filter(Boolean).join(', '))}</span></div>` : ''}
            ${bi.employmentStatus ? `<div class="detail-row" style="border:none;"><span class="detail-label">Employment</span><span class="detail-value">${escapeHtml(bi.employmentStatus)}</span></div>` : ''}
          </div>

          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:12px; color:var(--cyan); margin-bottom:10px;">💵 Loan Terms</div>
            <div class="detail-row"><span class="detail-label">Principal</span><span class="detail-value mono" style="color:var(--cyan); font-weight:700;">$${mpFmt(loan.principalAmount)} USDC</span></div>
            <div class="detail-row"><span class="detail-label">Installments</span><span class="detail-value">${loan.totalInstallments}</span></div>
            <div class="detail-row"><span class="detail-label">Rate</span><span class="detail-value text-muted">Set by lender (1–5%/mo)</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Created</span><span class="detail-value">${mpTimeAgo(loan.createdAt)}</span></div>
          </div>
        </div>

        <!-- RIGHT -->
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:12px; color:var(--cyan); margin-bottom:10px;">🛡️ Collateral</div>
            <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${col.colTypeLabel || 'RWA'}</span></div>
            ${col.assetType    ? `<div class="detail-row"><span class="detail-label">Asset</span><span class="detail-value">${escapeHtml(col.assetType)}</span></div>` : ''}
            ${col.description  ? `<div class="detail-row"><span class="detail-label">Description</span><span class="detail-value" style="font-size:12px;">${escapeHtml(col.description)}</span></div>` : ''}
            ${col.estimatedValueUSD && col.estimatedValueUSD !== '0' ? `<div class="detail-row"><span class="detail-label">Est. Value</span><span class="detail-value mono">$${mpFmt(col.estimatedValueUSD)}</span></div>` : ''}
            ${col.jurisdiction ? `<div class="detail-row"><span class="detail-label">Jurisdiction</span><span class="detail-value">${escapeHtml(col.jurisdiction)}</span></div>` : ''}
            ${col.documentHash ? `<div class="detail-row"><span class="detail-label">Doc Hash</span><span class="detail-value mono" style="font-size:10px; word-break:break-all;">${col.documentHash.slice(0,20)}…</span></div>` : ''}
            ${col.cryptoToken  ? `<div class="detail-row"><span class="detail-label">Token</span><span class="detail-value mono" style="font-size:11px;">${col.cryptoToken}</span></div>` : ''}
            ${col.cryptoAmount && col.cryptoAmount !== '0' ? `<div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value mono">${col.cryptoAmount}</span></div>` : ''}
            ${col.collateralRatio ? `<div class="detail-row" style="border:none;"><span class="detail-label">Ratio</span><span class="detail-value">${col.collateralRatio}%</span></div>` : ''}
          </div>

          <div class="card card-sm" style="background:rgba(6,182,212,0.06); border-color:rgba(6,182,212,0.2);">
            <div class="card-title" style="font-size:12px; color:var(--cyan); margin-bottom:10px;">📊 Risk Assessment</div>
            <div class="detail-row"><span class="detail-label">Risk Level</span><span class="detail-value">${risk.icon} ${risk.label}</span></div>
            <div class="detail-row"><span class="detail-label">Max Interest</span><span class="detail-value text-green mono">+$${(parseFloat(loan.principalAmount)*0.05*loan.totalInstallments).toFixed(2)}</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Max Return</span><span class="detail-value mono">$${(parseFloat(loan.principalAmount)*1.05*loan.totalInstallments/loan.totalInstallments + parseFloat(loan.principalAmount)*(1-1)).toFixed(2)}</span></div>
          </div>
        </div>
      </div>
    `,
    actions: isBorrower
      ? [{ label: 'Close', onClick: (c) => c() }]
      : [
          { label: 'Close',    onClick: (c) => c() },
          { label: '<i class="fa-solid fa-bolt"></i> Fund This Loan', primary: true,
            onClick: (c) => { c(); mpOpenFundModal(loanId); }
          }
        ]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  LEND PAGE — Loan Requests tab (on-chain)
// ─────────────────────────────────────────────────────────────────────────────

let _lendAllLoans = [];

async function loadLenderLoans() {
  const tbody = document.getElementById('lender-loans-tbody');
  if (!tbody) return;

  const rc = window.web3?.getReadContract?.();
  if (!rc) {
    tbody.innerHTML = _lendEmptyRow('🔧', 'Contract not configured', 'Set the contract address in <button onclick="showPage(\'settings\')" style="background:none;border:none;cursor:pointer;color:var(--cyan);text-decoration:underline;">Settings</button>.');
    return;
  }

  tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="spinner dark"></div></div></td></tr>`;

  try {
    const total = Number(await rc.getTotalLoans());

    if (total === 0) {
      _lendAllLoans = [];
      tbody.innerHTML = _lendEmptyRow('📭', 'No loans on-chain yet', 'Loan requests will appear here once borrowers apply.');
      return;
    }

    // Batch fetch
    const BATCH = 20;
    const raw = [];
    for (let s = 1; s <= total; s += BATCH) {
      const end = Math.min(s + BATCH - 1, total);
      const ids = Array.from({ length: end - s + 1 }, (_, i) => s + i);
      try {
        const b = await rc.getLoansBatch(ids);
        b.forEach(r => raw.push(r));
      } catch {
        for (const id of ids) {
          try { raw.push(await rc.getLoan(id)); } catch {}
        }
      }
    }

    _lendAllLoans = raw
      .map(r => { try { return window.web3._normalizeLoan(r); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt);

    filterLenderLoans('Requested', document.querySelector('#page-lend .tab-btn.active') || { classList: { remove: () => {} } });

    // Active tab default
    const activeTab = document.querySelector('#lend-tabs .tab-btn.active');
    if (activeTab) {
      const filter = activeTab.dataset.lendFilter || 'all';
      _lendRender(filter === 'all' ? _lendAllLoans : _lendAllLoans.filter(l => l.statusLabel === filter));
    } else {
      _lendRender(_lendAllLoans.filter(l => l.statusLabel === 'Requested'));
    }

  } catch (err) {
    tbody.innerHTML = _lendEmptyRow('❌', 'Failed to load', err.message);
  }
}

function filterLenderLoans(filter, btn) {
  if (btn?.classList) {
    document.querySelectorAll('#page-lend .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const list = filter === 'all'
    ? _lendAllLoans
    : _lendAllLoans.filter(l => l.statusLabel === filter);
  _lendRender(list);
}

function _lendRender(loans) {
  const tbody = document.getElementById('lender-loans-tbody');
  if (!tbody) return;

  if (!loans.length) {
    tbody.innerHTML = _lendEmptyRow('📭', 'No loans match this filter', '');
    return;
  }

  tbody.innerHTML = loans.map(loan => {
    const isMyLenderLoan = loan.lender?.toLowerCase() === window.web3?.address?.toLowerCase();
    return `
      <tr>
        <td class="mono font-bold" style="color:var(--cyan);">#${loan.id}</td>
        <td>
          <div style="font-weight:600; font-size:13px; color:var(--text-primary);">${escapeHtml(loan.borrowerInfo?.fullName || 'Unknown')}</div>
          <div class="mono" style="font-size:10px; color:var(--text-muted);">${mpShortAddr(loan.borrower)}</div>
        </td>
        <td class="mono" style="color:var(--cyan); font-weight:700;">$${mpFmt(loan.principalAmount)}</td>
        <td>${loan.totalInstallments}</td>
        <td>${collateralBadge(loan.collateral?.colTypeLabel)}</td>
        <td>${statusBadge(loan.statusLabel)}</td>
        <td style="font-size:11px; color:var(--text-muted);">${mpTimeAgo(loan.createdAt)}</td>
        <td>
          <div class="flex" style="gap:6px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="viewLoanDetails(${loan.id})">
              <i class="fa-solid fa-eye"></i>
            </button>
            ${loan.statusLabel === 'Requested' && !isMyLenderLoan ? `
              <button class="btn btn-success btn-sm" onclick="mpOpenFundModal(${loan.id})">
                <i class="fa-solid fa-bolt"></i> Fund
              </button>` : ''}
            ${loan.statusLabel === 'Approved' && isMyLenderLoan ? `
              <button class="btn btn-primary btn-sm" onclick="disburseLoan(${loan.id}, '${loan.principalAmount}')">
                <i class="fa-solid fa-paper-plane"></i> Disburse
              </button>` : ''}
            ${loan.statusLabel === 'Active' && isMyLenderLoan ? `
              <button class="btn btn-danger btn-sm" onclick="mpMarkDefault(${loan.id})">
                <i class="fa-solid fa-triangle-exclamation"></i>
              </button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function _lendEmptyRow(icon, title, desc) {
  return `<tr><td colspan="8">
    <div class="empty-state" style="padding:40px;">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${title}</div>
      ${desc ? `<div class="empty-desc">${desc}</div>` : ''}
    </div>
  </td></tr>`;
}

async function mpMarkDefault(loanId) {
  const confirmed = await confirmAction(
    `Mark Loan #${loanId} as Defaulted?`,
    'This will record the default on-chain. Enforcement of RWA collateral is off-chain.'
  );
  if (!confirmed) return;
  const t = showToast('Marking default…', 'info', 0);
  try {
    await window.web3.markLoanDefaulted(loanId);
    t?.remove?.();
    showToast(`Loan #${loanId} marked as defaulted.`, 'info');
    loadLenderLoans();
  } catch (err) {
    t?.remove?.();
    showToast(err.message, 'error', 8000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MY LENDING (on-chain)
// ─────────────────────────────────────────────────────────────────────────────

async function loadMyLending() {
  if (!window.web3?.isConnected?.() || !window.web3?.contract) return;
  refreshOfferBalance?.();

  try {
    const myLoans = await window.web3.getLenderLoans();

    // Stats
    const active    = myLoans.filter(l => l.statusLabel === 'Active');
    const repaid    = myLoans.filter(l => l.statusLabel === 'Repaid');
    const totalLent = myLoans.reduce((s, l) => s + parseFloat(l.principalAmount), 0);
    const totalRepaid = repaid.reduce((s, l) => s + parseFloat(l.totalPaid), 0);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('ml-stat-active',      active.length);
    set('ml-stat-repaid',      `$${mpFmt(totalRepaid, 0)}`);
    set('ml-stat-active-loans', active.length);
    set('ml-stat-vol',         `$${mpFmt(totalLent, 0)}`);

    // Active loans table
    const tbody = document.getElementById('ml-active-loans-tbody');
    if (tbody) {
      if (!active.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No active loans you've funded yet</div></div></td></tr>`;
      } else {
        tbody.innerHTML = active.map(loan => {
          const pct = loan.totalInstallments
            ? Math.round((loan.paidInstallments / loan.totalInstallments) * 100) : 0;
          return `
            <tr>
              <td class="mono font-bold" style="color:var(--cyan);">#${loan.id}</td>
              <td>
                <div style="font-weight:600; font-size:13px;">${escapeHtml(loan.borrowerInfo?.fullName || 'N/A')}</div>
                <div class="mono" style="font-size:10px; color:var(--text-muted);">${mpShortAddr(loan.borrower)}</div>
              </td>
              <td class="mono text-cyan">$${mpFmt(loan.principalAmount)}</td>
              <td style="min-width:120px;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <div class="progress-track" style="flex:1; height:4px;">
                    <div class="progress-fill${pct > 66 ? ' green' : pct > 33 ? '' : ' red'}" style="width:${pct}%;"></div>
                  </div>
                  <span class="mono text-xs">${loan.paidInstallments}/${loan.totalInstallments}</span>
                </div>
              </td>
              <td>${collateralBadge(loan.collateral?.colTypeLabel)}</td>
              <td>${statusBadge(loan.statusLabel)}</td>
              <td>
                <div class="flex" style="gap:6px; flex-wrap:wrap;">
                  <button class="btn btn-secondary btn-sm" onclick="viewLoanDetails(${loan.id})">
                    <i class="fa-solid fa-eye"></i>
                  </button>
                  ${typeof _rcptBtnHtml === 'function' ? _rcptBtnHtml(loan.id, 'LOAN_FUNDED') : ''}
                </div>
              </td>
            </tr>`;
        }).join('');
      }
    }

    // All my loans table (offers-tbody reused for "my lending history")
    const otbody = document.getElementById('my-offers-tbody');
    if (otbody) {
      if (!myLoans.length) {
        otbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No loans funded yet</div><div class="empty-desc">Browse the <button onclick="showPage('marketplace')" style="background:none;border:none;cursor:pointer;color:var(--cyan);text-decoration:underline;">Marketplace</button> to fund your first loan.</div></div></td></tr>`;
      } else {
        otbody.innerHTML = myLoans.map(loan => `
          <tr>
            <td class="mono font-bold" style="color:var(--cyan);">#${loan.id}</td>
            <td>${escapeHtml(loan.borrowerInfo?.fullName || '—')}</td>
            <td class="mono text-cyan font-bold">${loan.interestRateMonthly}%/mo</td>
            <td class="mono">$${mpFmt(loan.principalAmount)}</td>
            <td class="mono text-green">$${mpFmt(loan.totalPaid)}</td>
            <td style="min-width:100px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <div class="progress-track" style="flex:1; height:4px;">
                  <div class="progress-fill" style="width:${loan.totalInstallments ? Math.round(loan.paidInstallments/loan.totalInstallments*100) : 0}%;"></div>
                </div>
                <span class="mono text-xs text-muted">${loan.paidInstallments}/${loan.totalInstallments}</span>
              </div>
            </td>
            <td>${loan.totalInstallments}</td>
            <td>${statusBadge(loan.statusLabel)}</td>
            <td>
              <div class="flex" style="gap:6px; flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="viewLoanDetails(${loan.id})">
                  <i class="fa-solid fa-eye"></i>
                </button>
                ${typeof _rcptBtnHtml === 'function'
                  ? _rcptBtnHtml(loan.id, loan.statusLabel === 'Repaid' ? 'LOAN_REPAID' : 'LOAN_FUNDED')
                  : ''}
              </div>
            </td>
          </tr>`).join('');
      }
    }

  } catch (err) {
    console.error('loadMyLending:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  OFFER BALANCE REFRESH (kept for nav compatibility)
// ─────────────────────────────────────────────────────────────────────────────

async function refreshOfferBalance() {
  if (!window.web3?.isConnected?.()) return;
  try {
    const bal = await window.web3.getUSDCBalance();
    const el  = document.getElementById('of-usdc-balance');
    if (el) el.textContent = `$${mpFmt(parseFloat(bal), 2)}`;
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
//  OFFER FORM (kept for UI — Create Offer tab)
//  Note: No marketplace contract. The "Create Offer" form on the Lend page
//  is now informational only. Real lending happens by funding loan requests.
// ─────────────────────────────────────────────────────────────────────────────

function switchLendTab(tab, btn) {
  document.querySelectorAll('#lend-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const offerForm    = document.getElementById('lend-tab-offer-form');
  const loanRequests = document.getElementById('lend-tab-loan-requests');
  const myLending    = document.getElementById('lend-tab-my-lending');

  if (offerForm)    offerForm.style.display    = tab === 'offer-form'     ? 'block' : 'none';
  if (loanRequests) loanRequests.style.display  = tab === 'loan-requests'  ? 'block' : 'none';
  if (myLending)    myLending.style.display     = tab === 'my-lending'     ? 'block' : 'none';

  if (tab === 'loan-requests') loadLenderLoans();
  if (tab === 'my-lending')    loadMyLending();
}

function selectLenderType(el, type) {
  selectedLenderType = type;
  document.querySelectorAll('[data-lender-type]').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
}

function selectOfferCollateral(el, val) {
  selectedOfferCollateral = val;
  document.querySelectorAll('#of-col-chips .token-chip').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  const rg = document.getElementById('of-ratio-group');
  if (rg) rg.style.display = (val === 1) ? 'none' : 'flex';
}

function updateOfferPreview() {
  const content = document.getElementById('offer-preview-content');
  if (!content) return;
  const rate = parseFloat(document.getElementById('of-rate')?.value || 0);
  const liq  = parseFloat(document.getElementById('of-liquidity')?.value || 0);
  const max  = parseFloat(document.getElementById('of-max-loan')?.value || 0);
  const inst = parseInt(document.getElementById('of-installments')?.value || 1);
  if (!rate && !liq) {
    content.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-icon" style="font-size:32px;">📋</div><div class="empty-desc">Fill in the form to preview.</div></div>`;
    return;
  }
  const earn = max && rate ? (max * rate / 100 * inst).toFixed(2) : '—';
  content.innerHTML = `
    <div style="background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.2); border-radius:var(--radius-md); padding:16px; margin-bottom:12px; text-align:center;">
      <div style="font-size:26px; font-weight:800; color:var(--cyan); font-family:'JetBrains Mono',monospace;">${rate.toFixed(2)}%/mo</div>
      <div style="font-size:11px; color:var(--text-muted);">Fixed monthly rate</div>
    </div>
    <div class="space-y-2">
      <div class="detail-row" style="padding:5px 0;"><span class="detail-label">Liquidity Available</span><span class="detail-value mono text-cyan">$${liq.toLocaleString()} USDC</span></div>
      <div class="detail-row" style="padding:5px 0;"><span class="detail-label">Max Loan</span><span class="detail-value mono">$${max.toLocaleString()}</span></div>
      <div class="detail-row" style="padding:5px 0; border:none;"><span class="detail-label">Max Earnings</span><span class="detail-value text-green mono">+$${earn}</span></div>
    </div>`;
}

async function submitOffer() {
  showToast('ℹ️ On-chain marketplace: Fund existing loan requests directly from the Marketplace tab.', 'info', 6000);
  showPage('marketplace');
}

function resetOfferForm() {
  ['of-name','of-liquidity','of-min-loan','of-max-loan','of-rate','of-geo','of-prefs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const instEl = document.getElementById('of-installments');
  if (instEl) instEl.selectedIndex = 0;
  updateOfferPreview();
}

// ─────────────────────────────────────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialise state for lend form (kept from old file)
let selectedLenderType       = 0;
let selectedOfferCollateral  = 3;
