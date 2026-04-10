/**
 * ArcFi Marketplace — Lender offer listings, creation, and My Lending Activity
 * Global decentralized loan marketplace on Arc Testnet (Chain ID: 5042002)
 */

// ── State ─────────────────────────────────────────────────────────────────────
let allOffers       = [];
let filteredOffers  = [];
let selectedLenderType    = 0; // 0=Individual, 1=Company
let selectedOfferCollateral = 3; // 3=Both

// ══════════════════════════════════════════════════════════════
// MARKETPLACE PAGE
// ══════════════════════════════════════════════════════════════
async function loadMarketplace() {
  const container = document.getElementById('marketplace-listings');
  if (!container) return;

  if (!window.web3.marketplaceContract) {
    container.innerHTML = `
      <div class="card" style="padding:48px; text-align:center; grid-column:1/-1;">
        <div class="empty-icon" style="font-size:48px; margin-bottom:12px;">🔧</div>
        <div class="empty-title">Marketplace Contract Not Configured</div>
        <div class="empty-desc">Add the LoanMarketplace contract address in <button onclick="showPage('settings')" class="underline-link" style="background:none;border:none;cursor:pointer;">Settings</button>.</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="card" style="padding:48px; text-align:center; grid-column:1/-1;">
      <div class="spinner dark" style="margin:0 auto 12px;"></div>
      <div class="empty-title">Loading offers…</div>
    </div>`;

  try {
    allOffers = await window.web3.getAllOffers();
    filteredOffers = [...allOffers];

    // Update stats
    const activeOffers   = allOffers.filter(o => o.statusLabel === 'ACTIVE');
    const totalLiquidity = activeOffers.reduce((s,o) => s + parseFloat(o.availableLiquidity||0), 0);
    const avgRate        = activeOffers.length ? (activeOffers.reduce((s,o) => s + o.interestRateBps/100, 0) / activeOffers.length).toFixed(2) : '—';
    const totalLoans     = activeOffers.reduce((s,o) => s + o.totalLoansIssued, 0);

    document.getElementById('mp-stat-offers')?.   setAttribute('textContent', activeOffers.length) ||
      (document.getElementById('mp-stat-offers') && (document.getElementById('mp-stat-offers').textContent = activeOffers.length));
    document.getElementById('mp-stat-liquidity') && (document.getElementById('mp-stat-liquidity').textContent = `$${totalLiquidity.toFixed(0)}`);
    document.getElementById('mp-stat-rate')      && (document.getElementById('mp-stat-rate').textContent      = `${avgRate}%`);
    document.getElementById('mp-stat-loans')     && (document.getElementById('mp-stat-loans').textContent     = totalLoans);

    // Also update home page stats
    document.getElementById('home-stat-offers')  && (document.getElementById('home-stat-offers').textContent  = activeOffers.length);
    document.getElementById('home-stat-vol')     && (document.getElementById('home-stat-vol').textContent     = `$${totalLiquidity.toFixed(0)}`);

    renderMarketplaceOffers(filteredOffers);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="padding:48px; text-align:center; grid-column:1/-1;">
        <div class="empty-icon" style="font-size:48px; margin-bottom:12px;">❌</div>
        <div class="empty-title">Failed to load marketplace</div>
        <div class="empty-desc">${err.message}</div>
      </div>`;
  }
}

function applyMarketplaceFilters() {
  const minAmt   = parseFloat(document.getElementById('mp-filter-min')?.value || 0);
  const maxAmt   = parseFloat(document.getElementById('mp-filter-max')?.value || 0);
  const maxRate  = parseFloat(document.getElementById('mp-filter-rate')?.value || 0);
  const maxInst  = parseInt(document.getElementById('mp-filter-inst')?.value || 0);
  const colPref  = parseInt(document.getElementById('mp-filter-col')?.value || 0);
  const lndType  = document.getElementById('mp-filter-type')?.value;

  filteredOffers = allOffers.filter(o => {
    if (o.statusLabel !== 'ACTIVE') return false;
    if (minAmt > 0 && parseFloat(o.maxLoanAmount) < minAmt) return false;
    if (maxAmt > 0 && parseFloat(o.minLoanAmount) > maxAmt) return false;
    if (maxRate > 0 && o.interestRateBps / 100 > maxRate) return false;
    if (maxInst > 0 && o.maxInstallments > maxInst) return false;
    if (colPref > 0 && o.acceptedCollateral !== colPref) return false;
    if (lndType !== '' && lndType !== undefined && parseInt(lndType) !== parseInt(o.lenderType)) return false;
    return true;
  });

  renderMarketplaceOffers(filteredOffers);
}

function clearMarketplaceFilters() {
  ['mp-filter-min','mp-filter-max','mp-filter-rate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['mp-filter-inst','mp-filter-col','mp-filter-type'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  filteredOffers = [...allOffers];
  renderMarketplaceOffers(filteredOffers);
}

function renderMarketplaceOffers(offers) {
  const container = document.getElementById('marketplace-listings');
  if (!container) return;

  const active = offers.filter(o => o.statusLabel === 'ACTIVE');

  if (!active.length) {
    container.innerHTML = `
      <div class="card" style="padding:48px; text-align:center; grid-column:1/-1;">
        <div class="empty-icon" style="font-size:48px; margin-bottom:12px;">🏪</div>
        <div class="empty-title">No offers found</div>
        <div class="empty-desc">Try adjusting filters or check back later.</div>
      </div>`;
    return;
  }

  container.innerHTML = active.map(offer => buildOfferCard(offer)).join('');
}

function buildOfferCard(offer) {
  const riskColors = { Low:'badge-active', Medium:'badge-pending', High:'badge-overdue' };
  const riskBadge  = `<span class="badge ${riskColors[offer.riskLevel]||'badge-pending'}"><span class="badge-dot"></span>${offer.riskLevel} Risk</span>`;
  const utilPct    = offer.utilizationRate || 0;
  const lenderIcon = offer.lenderType === 1 ? '🏢' : '👤';
  const colIcon    = { 1:'🏠', 2:'🔐', 3:'🌐' };

  return `
    <div class="card offer-card" style="border-color:rgba(6,182,212,0.15); transition:all 0.2s; cursor:default;">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center" style="gap:10px;">
          <div style="font-size:24px;">${lenderIcon}</div>
          <div>
            <div style="font-size:15px; font-weight:700; color:var(--text-primary);">${escapeHtml(offer.lenderName)}</div>
            <div class="mono" style="font-size:10px; color:var(--text-muted);">${offer.lender.slice(0,8)}…${offer.lender.slice(-4)}</div>
          </div>
        </div>
        <div class="flex" style="gap:6px; flex-direction:column; align-items:flex-end;">
          ${riskBadge}
          <span class="badge badge-active"><span class="badge-dot"></span>ACTIVE</span>
        </div>
      </div>

      <!-- Rate highlight -->
      <div style="background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.2); border-radius:var(--radius-md); padding:16px; margin-bottom:16px; text-align:center;">
        <div style="font-size:32px; font-weight:800; color:var(--cyan); font-family:'JetBrains Mono',monospace;">${offer.interestRatePct}%</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Fixed monthly rate — No compounding</div>
      </div>

      <!-- Details -->
      <div class="space-y-2" style="margin-bottom:16px;">
        <div class="detail-row" style="padding:6px 0;">
          <span class="detail-label">Available Liquidity</span>
          <span class="detail-value mono text-cyan">$${parseFloat(offer.availableLiquidity).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})} USDC</span>
        </div>
        <div class="detail-row" style="padding:6px 0;">
          <span class="detail-label">Loan Range</span>
          <span class="detail-value mono" style="font-size:12px;">$${parseFloat(offer.minLoanAmount).toLocaleString()} – $${parseFloat(offer.maxLoanAmount).toLocaleString()}</span>
        </div>
        <div class="detail-row" style="padding:6px 0;">
          <span class="detail-label">Max Installments</span>
          <span class="detail-value">${offer.maxInstallments}</span>
        </div>
        <div class="detail-row" style="padding:6px 0;">
          <span class="detail-label">Collateral</span>
          <span class="detail-value">${colIcon[offer.acceptedCollateral]||'🌐'} ${offer.collateralLabel}</span>
        </div>
        <div class="detail-row" style="padding:6px 0; border:none;">
          <span class="detail-label">Geography</span>
          <span class="detail-value text-xs">${offer.geoRestrictions || 'GLOBAL'}</span>
        </div>
      </div>

      <!-- Utilization Bar -->
      <div style="margin-bottom:16px;">
        <div class="flex items-center justify-between" style="margin-bottom:4px;">
          <span class="text-xs text-muted">Fund Utilization</span>
          <span class="text-xs mono text-cyan">${utilPct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${utilPct > 80 ? 'red' : utilPct > 50 ? '' : 'green'}" style="width:${utilPct}%;"></div>
        </div>
      </div>

      <!-- Stats row -->
      <div class="flex" style="gap:12px; margin-bottom:16px;">
        <div style="flex:1; background:var(--bg-input); border-radius:var(--radius-sm); padding:10px; text-align:center;">
          <div class="stat-label" style="font-size:10px;">Loans Issued</div>
          <div style="font-size:16px; font-weight:700; color:var(--text-primary);">${offer.totalLoansIssued}</div>
        </div>
        <div style="flex:1; background:var(--bg-input); border-radius:var(--radius-sm); padding:10px; text-align:center;">
          <div class="stat-label" style="font-size:10px;">Total Repaid</div>
          <div style="font-size:16px; font-weight:700; color:var(--green); font-family:'JetBrains Mono',monospace;">$${parseFloat(offer.totalRepaid||0).toFixed(0)}</div>
        </div>
      </div>

      <!-- CTA -->
      <div class="flex" style="gap:8px;">
        <button class="btn btn-primary" style="flex:1;" onclick="applyFromOffer(${offer.id})">
          <i class="fa-solid fa-paper-plane"></i> Apply for Loan
        </button>
        <button class="btn btn-secondary btn-sm" onclick="viewOfferDetails(${offer.id})" title="View full details">
          <i class="fa-solid fa-eye"></i>
        </button>
      </div>
    </div>
  `;
}

function viewOfferDetails(offerId) {
  const offer = allOffers.find(o => parseInt(o.id) === parseInt(offerId));
  if (!offer) return;

  showModal({
    title: `📋 Offer #${offerId} Details`,
    size: 'modal-lg',
    content: `
      <div class="grid-2" style="gap:20px;">
        <div class="space-y-4">
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">🏦 Lender Info</div>
            <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${escapeHtml(offer.lenderName)}</span></div>
            <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${offer.lenderTypeLabel}</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Wallet</span><span class="detail-value mono text-xs">${offer.lender}</span></div>
          </div>
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">💰 Liquidity Status</div>
            <div class="detail-row"><span class="detail-label">Total Locked</span><span class="detail-value mono text-cyan">$${parseFloat(offer.totalLiquidity).toLocaleString()} USDC</span></div>
            <div class="detail-row"><span class="detail-label">Available</span><span class="detail-value mono text-green">$${parseFloat(offer.availableLiquidity).toLocaleString()} USDC</span></div>
            <div class="detail-row"><span class="detail-label">Allocated</span><span class="detail-value mono">$${parseFloat(offer.allocatedLiquidity).toLocaleString()} USDC</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Utilization</span><span class="detail-value">${offer.utilizationRate}%</span></div>
          </div>
        </div>
        <div class="space-y-4">
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">📋 Loan Terms</div>
            <div class="detail-row"><span class="detail-label">Interest Rate</span><span class="detail-value text-cyan font-bold">${offer.interestRatePct}%/month</span></div>
            <div class="detail-row"><span class="detail-label">Max Installments</span><span class="detail-value">${offer.maxInstallments}</span></div>
            <div class="detail-row"><span class="detail-label">Min Loan</span><span class="detail-value mono">$${parseFloat(offer.minLoanAmount).toLocaleString()}</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Max Loan</span><span class="detail-value mono">$${parseFloat(offer.maxLoanAmount).toLocaleString()}</span></div>
          </div>
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">🛡️ Collateral Requirements</div>
            <div class="detail-row"><span class="detail-label">Accepted Types</span><span class="detail-value">${offer.collateralLabel}</span></div>
            <div class="detail-row"><span class="detail-label">Min Crypto Ratio</span><span class="detail-value">${offer.minCollateralRatioPct}%</span></div>
            <div class="detail-row"><span class="detail-label">Geography</span><span class="detail-value">${offer.geoRestrictions || 'GLOBAL'}</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Risk Level</span><span class="detail-value">${offer.riskLevel}</span></div>
          </div>
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">📊 Performance</div>
            <div class="detail-row"><span class="detail-label">Loans Issued</span><span class="detail-value">${offer.totalLoansIssued}</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Total Repaid</span><span class="detail-value mono text-green">$${parseFloat(offer.totalRepaid||0).toFixed(2)}</span></div>
          </div>
        </div>
      </div>
    `,
    actions: [
      { label: 'Apply for Loan', primary: true, onClick: (c) => { c(); applyFromOffer(offerId); } },
      { label: 'Close', onClick: (c) => c() }
    ]
  });
}

function applyFromOffer(offerId) {
  const offer = allOffers.find(o => parseInt(o.id) === parseInt(offerId));
  if (!offer) { showToast('Offer not found', 'error'); return; }

  // Store selected offer for pre-fill
  window._selectedOfferId = offerId;
  window._selectedOffer   = offer;

  // Navigate to borrow page
  showPage('borrow');

  // Pre-fill the loan details step
  setTimeout(() => {
    const installSel = document.getElementById('b-installments');
    if (installSel) {
      // Set max installments from offer
      for (let i = installSel.options.length - 1; i >= 1; i--) {
        if (parseInt(installSel.options[i].value) > offer.maxInstallments) {
          installSel.options[i].disabled = true;
        }
      }
    }

    showToast(`✅ Offer #${offerId} selected! Rate: ${offer.interestRatePct}%/mo. Max ${offer.maxInstallments} installments.`, 'success', 6000);

    // Show offer info banner on borrow page
    const existingBanner = document.getElementById('borrow-offer-banner');
    if (existingBanner) existingBanner.remove();

    const borrowPage = document.getElementById('page-borrow');
    const banner = document.createElement('div');
    banner.id = 'borrow-offer-banner';
    banner.className = 'legal-banner legal-banner-info';
    banner.style.cssText = 'margin-bottom:16px;';
    banner.innerHTML = `
      <i class="fa-solid fa-building-columns" style="flex-shrink:0;"></i>
      <div>
        <strong>Offer #${offerId} Selected:</strong> Lender: ${escapeHtml(offer.lenderName)} |
        Rate: <strong>${offer.interestRatePct}%/month</strong> |
        Max: <strong>$${parseFloat(offer.maxLoanAmount).toLocaleString()} USDC</strong> |
        Up to <strong>${offer.maxInstallments} installments</strong>
        <button onclick="this.parentElement.parentElement.remove(); window._selectedOfferId=null; window._selectedOffer=null;"
          style="margin-left:8px; background:none; border:none; cursor:pointer; color:inherit; text-decoration:underline; font-size:12px;">Clear</button>
      </div>
    `;
    borrowPage.insertBefore(banner, borrowPage.firstChild);
  }, 100);
}

// ══════════════════════════════════════════════════════════════
// LEND PAGE — OFFER CREATION
// ══════════════════════════════════════════════════════════════
function switchLendTab(tab, btn) {
  // Update tab buttons
  document.querySelectorAll('#lend-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Show/hide panels
  document.getElementById('lend-tab-offer-form')?.style && (document.getElementById('lend-tab-offer-form').style.display = tab === 'offer-form' ? 'block' : 'none');
  document.getElementById('lend-tab-loan-requests')?.style && (document.getElementById('lend-tab-loan-requests').style.display = tab === 'loan-requests' ? 'block' : 'none');

  if (tab === 'loan-requests') loadLenderLoans();
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
  // Show ratio slider only if crypto is accepted
  const ratioGroup = document.getElementById('of-ratio-group');
  if (ratioGroup) {
    ratioGroup.style.display = (val === 1) ? 'none' : 'flex'; // hide for RWA-only
  }
}

async function refreshOfferBalance() {
  if (!window.web3.isConnected()) return;
  const bal = await window.web3.getUSDCBalance();
  document.getElementById('of-usdc-balance') && (document.getElementById('of-usdc-balance').textContent = `$${parseFloat(bal).toFixed(2)}`);
}

function updateOfferPreview() {
  const name       = document.getElementById('of-name')?.value?.trim() || '—';
  const liquidity  = parseFloat(document.getElementById('of-liquidity')?.value || 0);
  const minLoan    = parseFloat(document.getElementById('of-min-loan')?.value || 0);
  const maxLoan    = parseFloat(document.getElementById('of-max-loan')?.value || 0);
  const rate       = parseFloat(document.getElementById('of-rate')?.value || 0);
  const installments = parseInt(document.getElementById('of-installments')?.value || 0);
  const content    = document.getElementById('offer-preview-content');
  if (!content) return;

  if (!liquidity && !rate) {
    content.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-icon" style="font-size:32px;">📋</div><div class="empty-desc">Fill in the form to preview.</div></div>`;
    return;
  }

  const rateStr = rate ? `${rate.toFixed(2)}%/mo` : '—';
  const maxEarning = maxLoan && rate ? (maxLoan * (rate/100) * (installments||1)).toFixed(2) : '—';

  content.innerHTML = `
    <div style="background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.2); border-radius:var(--radius-md); padding:16px; margin-bottom:12px; text-align:center;">
      <div style="font-size:26px; font-weight:800; color:var(--cyan); font-family:'JetBrains Mono',monospace;">${rateStr}</div>
      <div style="font-size:11px; color:var(--text-muted);">Fixed monthly rate</div>
    </div>
    <div class="space-y-2">
      <div class="detail-row" style="padding:5px 0;"><span class="detail-label">Lender</span><span class="detail-value">${escapeHtml(name)}</span></div>
      <div class="detail-row" style="padding:5px 0;"><span class="detail-label">Liquidity</span><span class="detail-value mono text-cyan">$${liquidity.toLocaleString()} USDC</span></div>
      <div class="detail-row" style="padding:5px 0;"><span class="detail-label">Loan Range</span><span class="detail-value mono text-xs">$${minLoan.toLocaleString()} – $${maxLoan.toLocaleString()}</span></div>
      <div class="detail-row" style="padding:5px 0;"><span class="detail-label">Max Installments</span><span class="detail-value">${installments || '—'}</span></div>
      <div class="detail-row" style="padding:5px 0; border:none;"><span class="detail-label">Max Interest Earned</span><span class="detail-value text-green mono">$${maxEarning}</span></div>
    </div>
  `;
}

function validateOfferForm() {
  let valid = true;
  const clear = (id) => {
    const el = document.getElementById(`${id}-err`);
    if (el) { el.textContent = ''; el.classList.remove('show'); }
    document.getElementById(id)?.classList.remove('is-error');
  };
  const err = (id, msg) => {
    const el = document.getElementById(`${id}-err`);
    if (el) { el.textContent = msg; el.classList.add('show'); }
    document.getElementById(id)?.classList.add('is-error');
    valid = false;
  };

  ['of-name','of-liquidity','of-min-loan','of-max-loan','of-rate','of-installments'].forEach(clear);

  const name = document.getElementById('of-name')?.value?.trim();
  if (!name) err('of-name','Lender name is required');

  const liquidity = parseFloat(document.getElementById('of-liquidity')?.value||0);
  if (!liquidity || liquidity <= 0) err('of-liquidity','Enter USDC liquidity amount');

  const minLoan = parseFloat(document.getElementById('of-min-loan')?.value||0);
  if (!minLoan || minLoan <= 0) err('of-min-loan','Enter minimum loan amount');

  const maxLoan = parseFloat(document.getElementById('of-max-loan')?.value||0);
  if (!maxLoan || maxLoan <= 0) err('of-max-loan','Enter maximum loan amount');
  else if (maxLoan < minLoan) err('of-max-loan','Max loan must be ≥ min loan');
  else if (maxLoan > liquidity) err('of-max-loan','Max loan cannot exceed liquidity');

  const rate = parseFloat(document.getElementById('of-rate')?.value||0);
  if (isNaN(rate) || rate < 0 || rate > 5) err('of-rate','Rate must be 0–5% per month');

  if (!document.getElementById('of-installments')?.value) err('of-installments','Select max installments');

  if (!selectedOfferCollateral) { const e = document.getElementById('of-col-err'); if(e){e.textContent='Select collateral preference';e.classList.add('show');} valid=false; }

  if (!valid) showToast('Please fix the highlighted errors.','error',4000);
  return valid;
}

async function submitOffer() {
  if (!window.web3.isConnected()) {
    showToast('Connect your wallet first', 'error'); return;
  }
  if (!window.web3.marketplaceContract && !window.MARKETPLACE_ADDRESS) {
    showToast('Marketplace contract not configured. Add address in Settings.', 'error'); return;
  }
  if (!validateOfferForm()) return;

  const btn = document.getElementById('create-offer-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Approving USDC & Submitting…';

  try {
    const params = {
      lenderName:           document.getElementById('of-name').value.trim(),
      lenderType:           selectedLenderType,
      liquidityAmount:      document.getElementById('of-liquidity').value,
      interestRateBps:      Math.round(parseFloat(document.getElementById('of-rate').value) * 100),
      maxInstallments:      document.getElementById('of-installments').value,
      minLoanAmount:        document.getElementById('of-min-loan').value,
      maxLoanAmount:        document.getElementById('of-max-loan').value,
      acceptedCollateral:   selectedOfferCollateral,
      minCollateralRatioBps: parseInt(document.getElementById('of-col-ratio')?.value || 120) * 100,
      geoRestrictions:      document.getElementById('of-geo')?.value?.trim() || 'GLOBAL',
      borrowerPreferences:  document.getElementById('of-prefs')?.value?.trim() || ''
    };

    const result = await window.web3.createOffer(params);

    showToast(`Offer #${result.offerId} created! Liquidity locked.`, 'success');
    showOfferSuccessModal(result.offerId, result.tx.hash, params.liquidityAmount);
    resetOfferForm();

    // Save meta off-chain
    fetch('/api/offers/meta', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ offerId: result.offerId, lenderName: params.lenderName, tx: result.tx.hash })
    }).catch(()=>{});

    // Reload marketplace
    loadMarketplace();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Transaction failed', 'error', 8000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Lock Liquidity & Create Offer';
  }
}

function showOfferSuccessModal(offerId, txHash, liquidity) {
  showModal({
    title: '🎉 Offer Created!',
    content: `
      <div class="text-center space-y-4" style="padding:12px 0;">
        <div style="font-size:56px;">🏦</div>
        <div>
          <div style="font-size:20px; font-weight:800; color:var(--text-primary); margin-bottom:6px;">Offer #${offerId} is Live!</div>
          <div style="font-size:14px; color:var(--text-secondary);">Your USDC liquidity is locked in the marketplace. Borrowers can now apply.</div>
        </div>
        <div class="card card-sm" style="background:var(--bg-input); text-align:left;">
          <div class="detail-row"><span class="detail-label">Offer ID</span><span class="detail-value mono">#${offerId}</span></div>
          <div class="detail-row"><span class="detail-label">Liquidity Locked</span><span class="detail-value mono text-cyan">$${parseFloat(liquidity).toLocaleString()} USDC</span></div>
          <div class="detail-row" style="border:none;"><span class="detail-label">Tx Hash</span>
            <a href="${window.ARC_EXPLORER}/tx/${txHash}" target="_blank" class="underline-link mono text-xs">${txHash.slice(0,16)}…</a>
          </div>
        </div>
        <div style="font-size:13px; color:var(--text-muted);">Manage your offer and track loans in <strong>My Lending</strong>.</div>
      </div>
    `,
    size: 'modal-sm',
    actions: [
      { label: 'My Lending Activity', primary: true, onClick: (c) => { c(); showPage('my-lending'); } },
      { label: 'View Marketplace', onClick: (c) => { c(); showPage('marketplace'); } }
    ]
  });
}

function resetOfferForm() {
  ['of-name','of-liquidity','of-min-loan','of-max-loan','of-rate','of-geo','of-prefs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('of-installments') && (document.getElementById('of-installments').selectedIndex = 0);
  selectedLenderType    = 0;
  selectedOfferCollateral = 3;
  document.querySelectorAll('[data-lender-type]').forEach(b => b.classList.remove('selected'));
  document.querySelector('[data-lender-type="0"]')?.classList.add('selected');
  document.querySelectorAll('#of-col-chips .token-chip').forEach(b => b.classList.remove('selected'));
  document.querySelector('[data-col-val="3"]')?.classList.add('selected');
  document.getElementById('of-col-ratio') && (document.getElementById('of-col-ratio').value = 120);
  document.getElementById('of-ratio-display') && (document.getElementById('of-ratio-display').textContent = '120%');
  document.getElementById('offer-preview-content') && (document.getElementById('offer-preview-content').innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-icon" style="font-size:32px;">📋</div><div class="empty-desc">Fill in the form to preview.</div></div>');
}

// ══════════════════════════════════════════════════════════════
// MY LENDING ACTIVITY
// ══════════════════════════════════════════════════════════════
async function loadMyLending() {
  if (!window.web3.isConnected()) {
    document.getElementById('my-offers-tbody').innerHTML =
      `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🔗</div><div class="empty-title">Connect wallet to view your offers</div></div></td></tr>`;
    return;
  }
  if (!window.web3.marketplaceContract) {
    document.getElementById('my-offers-tbody').innerHTML =
      `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🔧</div><div class="empty-title">Marketplace contract not configured</div></div></td></tr>`;
    return;
  }

  document.getElementById('my-offers-tbody').innerHTML =
    `<tr><td colspan="9"><div class="empty-state"><div class="spinner dark"></div></div></td></tr>`;

  try {
    const myOffers = await window.web3.getLenderOffers();

    // Summary stats
    const activeCount   = myOffers.filter(o => o.statusLabel === 'ACTIVE').length;
    const totalDeployed = myOffers.reduce((s,o) => s + parseFloat(o.allocatedLiquidity||0), 0);
    const totalRepaid   = myOffers.reduce((s,o) => s + parseFloat(o.totalRepaid||0), 0);
    const totalActive   = myOffers.reduce((s,o) => s + (o.totalLoansIssued||0), 0);

    document.getElementById('ml-stat-offers')      && (document.getElementById('ml-stat-offers').textContent      = activeCount);
    document.getElementById('ml-stat-deployed')    && (document.getElementById('ml-stat-deployed').textContent    = `$${totalDeployed.toFixed(0)}`);
    document.getElementById('ml-stat-repaid')      && (document.getElementById('ml-stat-repaid').textContent      = `$${totalRepaid.toFixed(0)}`);
    document.getElementById('ml-stat-active-loans')&& (document.getElementById('ml-stat-active-loans').textContent= totalActive);

    if (!myOffers.length) {
      document.getElementById('my-offers-tbody').innerHTML =
        `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No offers yet</div><div class="empty-desc">Create your first offer in the Lend tab.</div></div></td></tr>`;
      return;
    }

    document.getElementById('my-offers-tbody').innerHTML = myOffers.map(offer => {
      const util = offer.utilizationRate || 0;
      const statusBadgeMap = { ACTIVE:'badge-active', PAUSED:'badge-pending', CLOSED:'badge-cancelled' };
      return `
        <tr>
          <td class="mono font-bold" style="color:var(--cyan);">#${offer.id}</td>
          <td style="max-width:140px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(offer.lenderName)}</td>
          <td class="mono text-cyan font-bold">${offer.interestRatePct}%/mo</td>
          <td class="mono">$${parseFloat(offer.totalLiquidity).toLocaleString()}</td>
          <td class="mono text-amber">$${parseFloat(offer.allocatedLiquidity||0).toLocaleString()}</td>
          <td style="min-width:100px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <div class="progress-track" style="flex:1; height:4px;"><div class="progress-fill ${util>80?'red':util>50?'':'green'}" style="width:${util}%;"></div></div>
              <span class="mono text-xs text-muted">${util}%</span>
            </div>
          </td>
          <td>${offer.totalLoansIssued}</td>
          <td><span class="badge ${statusBadgeMap[offer.statusLabel]||'badge-pending'}"><span class="badge-dot"></span>${offer.statusLabel}</span></td>
          <td>
            <div class="flex" style="gap:6px; flex-wrap:wrap;">
              ${offer.statusLabel === 'ACTIVE' ? `
                <button class="btn btn-secondary btn-sm" onclick="openAddLiquidityModal(${offer.id})">+ Add</button>
                <button class="btn btn-secondary btn-sm" onclick="openWithdrawLiquidityModal(${offer.id}, ${parseFloat(offer.availableLiquidity)})">↓ Withdraw</button>
                <button class="btn btn-secondary btn-sm" onclick="pauseOfferAction(${offer.id})"><i class="fa-solid fa-pause"></i></button>
              ` : offer.statusLabel === 'PAUSED' ? `
                <button class="btn btn-primary btn-sm" onclick="resumeOfferAction(${offer.id})"><i class="fa-solid fa-play"></i> Resume</button>
              ` : ''}
              ${offer.statusLabel !== 'CLOSED' ? `
                <button class="btn btn-danger btn-sm" onclick="closeOfferAction(${offer.id})"><i class="fa-solid fa-xmark"></i></button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Load active loans from my offers
    await loadMyLendingActiveLoans(myOffers);
  } catch (err) {
    document.getElementById('my-offers-tbody').innerHTML =
      `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error loading</div><div class="empty-desc">${err.message}</div></div></td></tr>`;
  }
}

async function loadMyLendingActiveLoans(myOffers) {
  const tbody = document.getElementById('ml-active-loans-tbody');
  if (!tbody || !window.web3.contract) return;

  try {
    // Gather all loan IDs from all my offers
    const allLoanIds = [];
    for (const offer of myOffers) {
      try {
        const ids = await window.web3.marketplaceContract.getOfferActiveLoanIds(offer.id);
        ids.forEach(id => allLoanIds.push({ loanId: id.toString(), offerId: offer.id }));
      } catch { /* silent */ }
    }

    if (!allLoanIds.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No active loans from your offers yet</div></div></td></tr>`;
      return;
    }

    // Also load from lender loans on loan platform
    const lenderLoans = await window.web3.getLenderLoans();
    const activeLender = lenderLoans.filter(l => l.statusLabel === 'ACTIVE');

    if (!activeLender.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No active loans yet</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = activeLender.map(loan => {
      const pct = loan.totalInstallments ? Math.round((loan.paidInstallments/loan.totalInstallments)*100) : 0;
      return `
        <tr>
          <td class="mono font-bold" style="color:var(--cyan);">#${loan.id}</td>
          <td>
            <div style="font-weight:600; font-size:13px;">${loan.borrowerInfo?.fullName||'N/A'}</div>
            <div class="mono" style="font-size:10px; color:var(--text-muted);">${loan.borrower.slice(0,8)}…${loan.borrower.slice(-4)}</div>
          </td>
          <td class="mono text-cyan">$${parseFloat(loan.principalAmount).toFixed(2)}</td>
          <td style="min-width:120px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <div class="progress-track" style="flex:1; height:4px;"><div class="progress-fill" style="width:${pct}%;"></div></div>
              <span class="mono text-xs">${loan.paidInstallments}/${loan.totalInstallments}</span>
            </div>
          </td>
          <td>${collateralBadge(loan.collateral?.colTypeLabel)}</td>
          <td>${statusBadge(loan.statusLabel)}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="viewLoanDetails(${loan.id})"><i class="fa-solid fa-eye"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('loadMyLendingActiveLoans:', e);
  }
}

// ── Offer Management Actions ───────────────────────────────────────────────────
function openAddLiquidityModal(offerId) {
  showModal({
    title: `💰 Add Liquidity to Offer #${offerId}`,
    content: `
      <div class="form-section">
        <div class="form-group">
          <label class="form-label">USDC Amount to Add <span class="req">*</span></label>
          <div class="input-group">
            <input id="add-liq-amount" class="form-control" type="number" min="1" placeholder="e.g. 5000" />
            <span class="input-suffix">USDC</span>
          </div>
        </div>
      </div>
    `,
    size: 'modal-sm',
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      { label: '+ Add Liquidity', primary: true, onClick: async (close) => {
        const amount = parseFloat(document.getElementById('add-liq-amount').value);
        if (!amount || amount <= 0) { showToast('Enter valid amount','error'); return; }
        close();
        const t = showToast('Adding liquidity…', 'info', 0);
        try {
          await window.web3.addLiquidity(offerId, amount);
          t.remove?.();
          showToast(`$${amount} USDC added to Offer #${offerId}!`, 'success');
          loadMyLending();
        } catch (err) {
          t.remove?.();
          showToast(err.message, 'error', 8000);
        }
      }}
    ]
  });
}

function openWithdrawLiquidityModal(offerId, available) {
  showModal({
    title: `↓ Withdraw Liquidity from Offer #${offerId}`,
    content: `
      <div class="form-section">
        <div class="legal-banner legal-banner-info" style="margin-bottom:16px;">
          <i class="fa-solid fa-info-circle"></i>
          <div>Available (unallocated) liquidity: <strong>$${available.toFixed(2)} USDC</strong></div>
        </div>
        <div class="form-group">
          <label class="form-label">Amount to Withdraw <span class="req">*</span></label>
          <div class="input-group">
            <input id="withdraw-liq-amount" class="form-control" type="number" min="1" max="${available}" placeholder="Max: ${available.toFixed(2)}" />
            <span class="input-suffix">USDC</span>
          </div>
        </div>
      </div>
    `,
    size: 'modal-sm',
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      { label: 'Withdraw', primary: true, onClick: async (close) => {
        const amount = parseFloat(document.getElementById('withdraw-liq-amount').value);
        if (!amount || amount <= 0 || amount > available) { showToast('Invalid amount','error'); return; }
        close();
        const t = showToast('Withdrawing…', 'info', 0);
        try {
          await window.web3.withdrawLiquidity(offerId, amount);
          t.remove?.();
          showToast(`$${amount} USDC withdrawn!`, 'success');
          loadMyLending();
        } catch (err) {
          t.remove?.();
          showToast(err.message, 'error', 8000);
        }
      }}
    ]
  });
}

async function pauseOfferAction(offerId) {
  const confirmed = await confirmAction(`Pause Offer #${offerId}?`, 'The offer will be hidden from the marketplace. Existing loans continue normally.');
  if (!confirmed) return;
  const t = showToast('Pausing offer…', 'info', 0);
  try {
    await window.web3.pauseOffer(offerId);
    t.remove?.();
    showToast(`Offer #${offerId} paused.`, 'info');
    loadMyLending();
  } catch (err) {
    t.remove?.();
    showToast(err.message, 'error', 8000);
  }
}

async function resumeOfferAction(offerId) {
  const confirmed = await confirmAction(`Resume Offer #${offerId}?`, 'The offer will become visible on the marketplace again.');
  if (!confirmed) return;
  const t = showToast('Resuming offer…', 'info', 0);
  try {
    await window.web3.resumeOffer(offerId);
    t.remove?.();
    showToast(`Offer #${offerId} resumed!`, 'success');
    loadMyLending();
  } catch (err) {
    t.remove?.();
    showToast(err.message, 'error', 8000);
  }
}

async function closeOfferAction(offerId) {
  const confirmed = await confirmAction(
    `Close Offer #${offerId}?`,
    'This is permanent. All available (unallocated) liquidity will be returned to your wallet. Active loans continue until completion.'
  );
  if (!confirmed) return;
  const t = showToast('Closing offer…', 'info', 0);
  try {
    await window.web3.closeOffer(offerId);
    t.remove?.();
    showToast(`Offer #${offerId} closed. Liquidity returned.`, 'info');
    loadMyLending();
  } catch (err) {
    t.remove?.();
    showToast(err.message, 'error', 8000);
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
