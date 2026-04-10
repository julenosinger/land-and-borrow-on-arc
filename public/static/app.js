/**
 * DaatFI — Main Application Logic
 * Dark/Light mode · English · Arc Testnet · Production Grade
 */

// ── Platform fee (display-only — not enforced on-chain) ────────────────────
const PLATFORM_FEE_PCT = 0.02; // 2% flat fee on principal

// ══════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════
function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light');
  setTheme(isLight ? 'dark' : 'light');
}

function setTheme(mode) {
  document.documentElement.className = mode;
  localStorage.setItem('arcfi-theme', mode);
  const sunIcon  = document.getElementById('icon-sun');
  const moonIcon = document.getElementById('icon-moon');
  if (mode === 'light') {
    sunIcon  && (sunIcon.style.display  = 'block');
    moonIcon && (moonIcon.style.display = 'none');
    document.getElementById('theme-light-btn')?.classList.add('selected');
    document.getElementById('theme-dark-btn')?.classList.remove('selected');
  } else {
    sunIcon  && (sunIcon.style.display  = 'none');
    moonIcon && (moonIcon.style.display = 'block');
    document.getElementById('theme-dark-btn')?.classList.add('selected');
    document.getElementById('theme-light-btn')?.classList.remove('selected');
  }
}

// Apply on load
(function initTheme() {
  const saved = localStorage.getItem('arcfi-theme') || 'dark';
  setTheme(saved);
})();

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  const btn = document.querySelector(`[data-page="${pageId}"]`);
  if (btn) btn.classList.add('active');

  // Lazy-load page data
  if (pageId === 'marketplace') loadMarketplace();
  if (pageId === 'lend')        { loadLenderLoans(); refreshOfferBalance && refreshOfferBalance(); }
  if (pageId === 'my-lending')  loadMyLending();
  if (pageId === 'dashboard')   loadDashboard();
  if (pageId === 'payments')    loadPayments();
  if (pageId === 'home')        loadHomeStats();
  if (pageId === 'settings')    loadSettingsValues();
}

// ══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════════
function showToast(message, type = 'info', duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-body">
      <div class="toast-title">${titles[type] || 'Notice'}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  return toast;
}

// Expose to UI module
window.showToast = showToast;
if (window.UI) window.UI.showToast = showToast;

// ══════════════════════════════════════════════════════════════
// MODAL SYSTEM
// ══════════════════════════════════════════════════════════════
function showModal({ title, content, size = 'modal-md', actions = [], onClose }) {
  closeModal();
  const container = document.getElementById('modal-container');
  const actionBtns = actions.map((a, i) =>
    `<button class="btn ${a.primary ? 'btn-primary' : (a.danger ? 'btn-danger' : 'btn-secondary')}" id="modal-action-${i}">${a.label}</button>`
  ).join('');

  container.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-box ${size}">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">${content}</div>
        ${actions.length ? `<div class="modal-footer">${actionBtns}</div>` : ''}
      </div>
    </div>
  `;

  requestAnimationFrame(() => document.getElementById('modal-backdrop')?.classList.add('show'));

  document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  actions.forEach((a, i) => {
    document.getElementById(`modal-action-${i}`)?.addEventListener('click', () => {
      if (a.onClick) a.onClick(closeModal);
    });
  });

  return { close: closeModal };
}

function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('show');
  setTimeout(() => { document.getElementById('modal-container').innerHTML = ''; }, 250);
}

// ══════════════════════════════════════════════════════════════
// WALLET
// ══════════════════════════════════════════════════════════════
async function connectWallet() {
  const btn = document.getElementById('wallet-btn');
  const label = document.getElementById('wallet-label');
  if (!btn || !label) return;

  try {
    btn.disabled = true;
    label.innerHTML = '<span class="spinner"></span> Connecting…';

    const address = await window.web3.connectWallet();
    updateWalletUI(address);
    showToast(`Wallet connected: ${window.web3.getShortAddress()}`, 'success');

    // Reload current page data
    const activePage = document.querySelector('.nav-btn.active')?.dataset?.page;
    if (activePage) showPage(activePage);
  } catch (err) {
    showToast(err.message || 'Wallet connection failed', 'error');
    updateWalletUI(null);
  } finally {
    btn.disabled = false;
  }
}

function updateWalletUI(address) {
  const btn   = document.getElementById('wallet-btn');
  const label = document.getElementById('wallet-label');
  if (!btn || !label) return;

  if (address) {
    btn.className = 'wallet-btn connected';
    label.innerHTML = `<span class="dot"></span>${window.web3.getShortAddress()}`;
    btn.onclick = () => showWalletInfo();
  } else {
    btn.className = 'wallet-btn disconnected';
    label.innerHTML = 'Connect Wallet';
    btn.onclick = connectWallet;
  }

  // Update footer wallet display
  updateFooterWallet(address);
}

function updateFooterWallet(address) {
  const row  = document.getElementById('footer-wallet-row');
  const addr = document.getElementById('footer-wallet-addr');
  if (!row || !addr) return;
  if (address) {
    const short = address.slice(0,6) + '…' + address.slice(-4);
    addr.textContent = short;
    row.style.display = 'flex';
  } else {
    row.style.display = 'none';
  }
}

function showWalletInfo() {
  showModal({
    title: '🔗 Wallet Info',
    content: `
      <div class="space-y-4">
        <div class="detail-row">
          <span class="detail-label">Address</span>
          <span class="detail-value mono text-xs break-all">${window.web3.address}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Network</span>
          <span class="detail-value">Arc Testnet (${window.web3.chainId})</span>
        </div>
        <div class="detail-row" style="border:none;">
          <span class="detail-label">USDC Balance</span>
          <span class="detail-value" id="modal-usdc-bal">Loading…</span>
        </div>
      </div>
    `,
    size: 'modal-sm',
    actions: [
      { label: 'Copy Address', onClick: () => { navigator.clipboard.writeText(window.web3.address); showToast('Address copied!','success',2000); } },
      { label: 'Disconnect', danger: true, onClick: (close) => { window.web3.address = null; updateWalletUI(null); close(); } }
    ]
  });
  window.web3.getUSDCBalance().then(b => {
    const el = document.getElementById('modal-usdc-bal');
    if (el) el.textContent = `$${parseFloat(b).toFixed(2)} USDC`;
  });
}

// Listen for wallet events
window.web3.on('connected',      ({ address }) => updateWalletUI(address));
window.web3.on('disconnected',   ()            => updateWalletUI(null));
window.web3.on('accountChanged', ({ address }) => { updateWalletUI(address); showPage(document.querySelector('.nav-btn.active')?.dataset?.page || 'home'); });

// ══════════════════════════════════════════════════════════════
// HOME STATS
// ══════════════════════════════════════════════════════════════
async function loadHomeStats() {
  if (window.web3.contract) {
    try {
      const loans = await window.web3.getAllLoans();
      document.getElementById('home-stat-loans').textContent = loans.length;
    } catch { /* silent */ }
  }
  if (window.web3.marketplaceContract) {
    try {
      const offers = await window.web3.getActiveOffers();
      const totalLiq = offers.reduce((s,o) => s + parseFloat(o.availableLiquidity||0), 0);
      document.getElementById('home-stat-offers') && (document.getElementById('home-stat-offers').textContent = offers.length);
      document.getElementById('home-stat-vol')    && (document.getElementById('home-stat-vol').textContent    = `$${totalLiq.toFixed(0)}`);
    } catch { /* silent */ }
  }
}

// ══════════════════════════════════════════════════════════════
// BORROW WIZARD
// ══════════════════════════════════════════════════════════════
let borrowerType   = 'individual';
let collateralType = 'rwa';
let rwaCryptoToken = 'usdc';
let uploadedDocHash = null;
let uploadedDocURI  = null;
let uploadedDocFile = null;

function selectBorrowerType(el, type) {
  borrowerType = type;
  document.querySelectorAll('[data-borrower-type]').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  // Show/hide company notice (new design)
  const notice = document.getElementById('bw-company-notice');
  if (notice) notice.style.display = type === 'company' ? 'flex' : 'none';
}

// ── Loan purpose chip selection ───────────────────────────────
function selectLoanPurpose(el, purpose) {
  document.querySelectorAll('.bw-purpose-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  // Append purpose to textarea if empty
  const textarea = document.getElementById('b-purpose');
  if (textarea && !textarea.value.trim()) {
    textarea.value = purpose !== 'Custom' ? purpose : '';
    if (purpose === 'Custom') textarea.focus();
  }
}

// ── Inline blur validation helpers ───────────────────────────
function bwValidateField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const val = el.value?.trim();
  const errEl = document.getElementById(`${id}-err`);
  const checkEl = document.getElementById(`${id}-check`);

  let msg = '';
  if (!val) {
    const labels = {
      'b-fullname':'Full name is required','b-email':'Email is required',
      'b-country':'Country is required','b-city':'City is required',
      'b-amount':'Loan amount is required','b-installments':'Select number of installments',
      'rwa-asset-type':'Select an asset type','rwa-description':'Description is required',
      'rwa-value':'Estimated value is required','rwa-jurisdiction':'Jurisdiction is required',
      'crypto-amount':'Collateral amount is required'
    };
    msg = labels[id] || 'This field is required';
  } else if (id === 'b-email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    msg = 'Enter a valid email address';
  }

  if (msg) {
    el.classList.add('bw-input-error'); el.classList.remove('bw-input-valid');
    if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
    if (checkEl) checkEl.classList.remove('visible');
  } else {
    el.classList.remove('bw-input-error'); el.classList.add('bw-input-valid');
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }
    if (checkEl) checkEl.classList.add('visible');
  }
}

function bwClearField(id) {
  const el  = document.getElementById(id);
  const err = document.getElementById(`${id}-err`);
  if (el)  { el.classList.remove('bw-input-error'); }
  if (err) { err.textContent = ''; err.classList.remove('show'); }
}

function selectCollateralType(type) {
  collateralType = type;
  document.getElementById('col-rwa-card')?.classList.toggle('selected', type === 'rwa');
  document.getElementById('col-crypto-card')?.classList.toggle('selected', type === 'crypto');
  document.getElementById('col-rwa-form').style.display    = type === 'rwa'    ? 'flex' : 'none';
  document.getElementById('col-crypto-form').style.display = type === 'crypto' ? 'flex' : 'none';
}

function selectCryptoToken(el, token) {
  rwaCryptoToken = token;
  document.querySelectorAll('#crypto-token-chips .bw-token-chip').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('crypto-custom-addr-group').style.display = token === 'custom' ? 'flex' : 'none';
  document.getElementById('crypto-token-symbol').textContent = token === 'usdc' ? 'USDC' : 'TOKEN';
  updateCollateralRatio();
}

function handleRwaCustom(sel) {
  document.getElementById('rwa-custom-group').style.display = sel.value === 'custom' ? 'flex' : 'none';
}

async function handleDocUpload(input) {
  const file = input.files[0];
  if (!file) return;
  uploadedDocFile = file;
  const zone = document.getElementById('rwa-upload-zone');
  zone.classList.add('has-file');

  showToast('Computing document hash…', 'info', 3000);
  try {
    const hash = await window.web3.hashFile(file);
    uploadedDocHash = hash;
    uploadedDocURI  = `file://${file.name}`;

    document.getElementById('rwa-doc-info').style.display = 'flex';
    document.getElementById('rwa-doc-name').textContent  = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    document.getElementById('rwa-doc-hash').textContent  = `SHA-256: ${hash}`;
    document.getElementById('rwa-doc-err').classList.remove('show');
    showToast('Document hash computed ✓', 'success', 3000);

    // Always try IPFS upload via backend proxy (PINATA_JWT stored as Cloudflare secret)
    showToast('Uploading to IPFS…', 'info', 0);
    try {
      const result = await window.web3.uploadToIPFS(file);
      uploadedDocHash = result.hash.startsWith('0x') ? result.hash : `0x${result.hash}`;
      uploadedDocURI  = result.uri;
      if (result.localOnly) {
        showToast('IPFS upload unavailable — local hash saved', 'warning');
      } else {
        showToast('Document uploaded to IPFS ✓', 'success');
      }
    } catch { showToast('IPFS upload failed — local hash used', 'warning'); }
  } catch (err) {
    showToast('Failed to process document: ' + err.message, 'error');
  }
}

function updateLoanPreview() {
  const amount = parseFloat(document.getElementById('b-amount')?.value || 0);
  const installments = parseInt(document.getElementById('b-installments')?.value || 0);
  const preview = document.getElementById('loan-preview');

  if (!amount || !installments) { if(preview) preview.style.display = 'none'; return; }

  // Max rate preview (worst-case 5%/mo) + 2% platform fee on principal
  const monthlyRate = 0.05;
  const totalInterest = amount * monthlyRate * installments;
  const platformFee   = amount * PLATFORM_FEE_PCT;
  const total    = amount + totalInterest + platformFee;
  const perInst  = total / installments;

  const fmt = n => `$${n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  document.getElementById('prev-principal').textContent = fmt(amount);
  document.getElementById('prev-total').textContent     = fmt(total);
  document.getElementById('prev-inst').textContent      = fmt(perInst);
  const interestEl = document.getElementById('prev-interest');
  if (interestEl) interestEl.textContent = fmt(totalInterest);
  const feeEl = document.getElementById('prev-fee');
  if (feeEl) feeEl.textContent = fmt(platformFee);
  if(preview) preview.style.display = 'block';
}

document.getElementById('b-amount')?.addEventListener('input', updateLoanPreview);

function updateRatioDisplay(val) {
  document.getElementById('ratio-display').textContent = `${val}%`;
  updateCollateralRatio();
}

function updateCollateralRatio() {
  const loanAmt = parseFloat(document.getElementById('b-amount')?.value || 0);
  const colAmt  = parseFloat(document.getElementById('crypto-amount')?.value || 0);
  const ratio   = parseInt(document.getElementById('crypto-ratio')?.value || 120);

  if (!loanAmt) return;
  const requiredCol = (loanAmt * ratio) / 100;
  const coverage    = colAmt > 0 ? ((colAmt / loanAmt) * 100).toFixed(0) : 0;
  const pct         = Math.min((colAmt / requiredCol) * 100, 100);

  document.getElementById('ratio-coverage-text').textContent = `${coverage}% coverage`;
  document.getElementById('ratio-bar').style.width           = `${pct}%`;
  document.getElementById('ratio-loan-val').textContent      = `$${loanAmt.toFixed(2)}`;
  document.getElementById('ratio-col-val').textContent       = `$${colAmt.toFixed(2)}`;

  const bar = document.getElementById('ratio-bar');
  bar.className = 'bw-coverage-fill';
  if (coverage >= 150)  bar.classList.add('green');
  else bar.classList.add('red');
}

// ── Step navigation ───────────────────────────────────────────
function borrowStep(step) {
  // Validate current step before moving forward
  const currentStep = getCurrentStep();
  if (step > currentStep && !validateBorrowStep(currentStep)) return;

  // Hide all steps
  [1,2,3,4].forEach(i => {
    const el = document.getElementById(`borrow-step-${i}`);
    if (el) { el.style.display = 'none'; el.classList.remove('bw-animate-in'); }
  });
  const active = document.getElementById(`borrow-step-${step}`);
  if (active) {
    active.style.display = 'block';
    requestAnimationFrame(() => active.classList.add('bw-animate-in'));
  }

  // Update stepper nodes
  [1,2,3,4].forEach(i => {
    const node = document.getElementById(`step-${i}`);
    if (!node) return;
    node.classList.remove('active','done');
    if (i < step)        node.classList.add('done');
    else if (i === step) node.classList.add('active');
    // connector lines
    const line = document.getElementById(`step-line-${i}`);
    if (line) line.classList.toggle('done', i < step);
  });

  // Update progress bar
  const pct = ((step - 1) / 3) * 100;
  const fill = document.getElementById('bw-progress-fill');
  const lbl  = document.getElementById('bw-progress-label');
  if (fill) fill.style.width = `${pct}%`;
  if (lbl)  lbl.textContent  = `Step ${step} of 4`;

  if (step === 4) buildReviewPanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getCurrentStep() {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`borrow-step-${i}`);
    if (el && el.style.display !== 'none') return i;
  }
  return 1;
}

// ── Validation ────────────────────────────────────────────────
function clearFieldError(id) {
  const el = document.getElementById(`${id}-err`);
  if (el) { el.textContent = ''; el.classList.remove('show'); }
  document.getElementById(id)?.classList.remove('is-error');
}
function setFieldError(id, msg) {
  const el = document.getElementById(`${id}-err`);
  if (el) { el.textContent = msg; el.classList.add('show'); }
  document.getElementById(id)?.classList.add('is-error');
}

function validateBorrowStep(step) {
  let valid = true;
  if (step === 1) {
    const fields = ['b-fullname','b-email','b-country','b-city'];
    fields.forEach(f => clearFieldError(f));
    if (!document.getElementById('b-fullname').value.trim()) { setFieldError('b-fullname','Full name is required'); valid=false; }
    const email = document.getElementById('b-email').value.trim();
    if (!email) { setFieldError('b-email','Email is required'); valid=false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('b-email','Enter a valid email'); valid=false; }
    if (!document.getElementById('b-country').value) { setFieldError('b-country','Country is required'); valid=false; }
    if (!document.getElementById('b-city').value.trim()) { setFieldError('b-city','City is required'); valid=false; }
  }
  if (step === 2) {
    clearFieldError('b-amount'); clearFieldError('b-installments');
    const amt = parseFloat(document.getElementById('b-amount').value);
    if (!amt || amt <= 0) { setFieldError('b-amount','Enter a valid loan amount'); valid=false; }
    if (!document.getElementById('b-installments').value) { setFieldError('b-installments','Select number of installments'); valid=false; }
  }
  if (step === 3) {
    if (collateralType === 'rwa') {
      ['rwa-asset-type','rwa-description','rwa-value','rwa-jurisdiction'].forEach(f => clearFieldError(f));
      const assetType = document.getElementById('rwa-asset-type').value;
      const customVal = document.getElementById('rwa-asset-custom').value.trim();
      if (!assetType) { setFieldError('rwa-asset-type','Select an asset type'); valid=false; }
      if (assetType === 'custom' && !customVal) { setFieldError('rwa-asset-type','Enter a custom asset type'); valid=false; }
      if (!document.getElementById('rwa-description').value.trim()) { setFieldError('rwa-description','Provide asset description'); valid=false; }
      if (!document.getElementById('rwa-value').value || parseFloat(document.getElementById('rwa-value').value) <= 0) { setFieldError('rwa-value','Enter estimated value'); valid=false; }
      if (!document.getElementById('rwa-jurisdiction').value.trim()) { setFieldError('rwa-jurisdiction','Enter jurisdiction'); valid=false; }
      if (!uploadedDocHash) { const el = document.getElementById('rwa-doc-err'); if(el){el.textContent='Upload a notarized document'; el.classList.add('show');} valid=false; }
    }
    if (collateralType === 'crypto') {
      clearFieldError('crypto-amount');
      const amt = parseFloat(document.getElementById('crypto-amount').value);
      const loan = parseFloat(document.getElementById('b-amount').value);
      const ratio = parseInt(document.getElementById('crypto-ratio').value);
      if (!amt || amt <= 0) { setFieldError('crypto-amount','Enter collateral amount'); valid=false; }
      else if (amt < (loan * ratio / 100)) { setFieldError('crypto-amount',`Collateral must be at least ${ratio}% of loan ($${(loan*ratio/100).toFixed(2)})`); valid=false; }
    }
  }
  if (!valid) showToast('Please fix the highlighted errors before continuing.', 'error', 4000);
  return valid;
}

// ── Review panel ──────────────────────────────────────────────
function buildReviewPanel() {
  const fullName   = document.getElementById('b-fullname').value;
  const email      = document.getElementById('b-email').value;
  const country    = document.getElementById('b-country').value;
  const city       = document.getElementById('b-city').value;
  const employment = document.getElementById('b-employment').value;
  const amount     = document.getElementById('b-amount').value;
  const installments = document.getElementById('b-installments').value;

  const assetTypeRaw = document.getElementById('rwa-asset-type')?.value;
  const assetType = assetTypeRaw === 'custom' ? document.getElementById('rwa-asset-custom').value : assetTypeRaw;
  const rwaVal    = document.getElementById('rwa-value')?.value;
  const cryptoAmt = document.getElementById('crypto-amount')?.value;
  const ratio     = document.getElementById('crypto-ratio')?.value;

  const html = `
    <div class="bw-review-card">
      <div class="bw-review-card-header">
        <span><i class="fa-solid fa-user"></i> Personal information</span>
        <button class="bw-review-edit" onclick="borrowStep(1)"><i class="fa-solid fa-pen"></i> Edit</button>
      </div>
      <div class="bw-review-rows">
        <div class="bw-review-row"><span class="bw-review-lbl">Full name</span><span class="bw-review-val">${fullName}</span></div>
        <div class="bw-review-row"><span class="bw-review-lbl">Email</span><span class="bw-review-val">${email}</span></div>
        <div class="bw-review-row"><span class="bw-review-lbl">Location</span><span class="bw-review-val">${city}, ${country}</span></div>
        <div class="bw-review-row"><span class="bw-review-lbl">Type</span><span class="bw-review-val">${borrowerType === 'company' ? '🏢 Company' : '👤 Individual'}${employment ? ' — ' + employment : ''}</span></div>
      </div>
    </div>
    <div class="bw-review-card">
      <div class="bw-review-card-header">
        <span><i class="fa-solid fa-file-invoice-dollar"></i> Loan terms</span>
        <button class="bw-review-edit" onclick="borrowStep(2)"><i class="fa-solid fa-pen"></i> Edit</button>
      </div>
      <div class="bw-review-rows">
        <div class="bw-review-row"><span class="bw-review-lbl">Principal amount</span><span class="bw-review-val bw-mono bw-text-cyan">$${parseFloat(amount).toFixed(2)} USDC</span></div>
        <div class="bw-review-row"><span class="bw-review-lbl">Installments</span><span class="bw-review-val">${installments}</span></div>
        <div class="bw-review-row"><span class="bw-review-lbl">Interest rate</span><span class="bw-review-val bw-text-green">Set by lender (≤ 5%/month)</span></div>
      </div>
    </div>
    <div class="bw-review-card">
      <div class="bw-review-card-header">
        <span><i class="fa-solid fa-shield-halved"></i> Collateral</span>
        <button class="bw-review-edit" onclick="borrowStep(3)"><i class="fa-solid fa-pen"></i> Edit</button>
      </div>
      <div class="bw-review-rows">
        ${collateralType === 'rwa' ? `
          <div class="bw-review-row"><span class="bw-review-lbl">Type</span><span class="badge badge-rwa">🏠 Real-World Asset</span></div>
          <div class="bw-review-row"><span class="bw-review-lbl">Asset</span><span class="bw-review-val">${assetType}</span></div>
          <div class="bw-review-row"><span class="bw-review-lbl">Estimated value</span><span class="bw-review-val bw-mono">$${parseFloat(rwaVal||0).toFixed(2)}</span></div>
          <div class="bw-review-row"><span class="bw-review-lbl">Document hash</span><span class="bw-review-val bw-mono" style="font-size:11px;">${uploadedDocHash ? uploadedDocHash.slice(0,32)+'…' : '—'}</span></div>
        ` : `
          <div class="bw-review-row"><span class="bw-review-lbl">Type</span><span class="badge badge-crypto">🔐 Crypto Escrow</span></div>
          <div class="bw-review-row"><span class="bw-review-lbl">Token</span><span class="bw-review-val">${(typeof rwaCryptoToken !== 'undefined' ? rwaCryptoToken : 'usdc').toUpperCase()}</span></div>
          <div class="bw-review-row"><span class="bw-review-lbl">Amount</span><span class="bw-review-val bw-mono bw-text-cyan">${parseFloat(cryptoAmt||0).toFixed(2)}</span></div>
          <div class="bw-review-row"><span class="bw-review-lbl">Coverage ratio</span><span class="bw-review-val">${ratio}%</span></div>
        `}
      </div>
    </div>
  `;
  document.getElementById('loan-review-content').innerHTML = html;

  // Financial summary strip
  const amt = parseFloat(amount) || 0;
  const inst = parseInt(installments) || 0;
  const total = amt + amt * 0.05 * inst;
  const fmt = n => `$${n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} USDC`;
  const fmtEl = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  fmtEl('bw-fin-principal', fmt(amt));
  fmtEl('bw-fin-installments', inst ? `${inst} × ${fmt(total/inst)}` : '—');
  fmtEl('bw-fin-total', fmt(total));
}

// ── Submit loan ───────────────────────────────────────────────
async function submitLoan() {
  if (!window.web3.isConnected()) {
    showToast('Connect your wallet first', 'error'); return;
  }
  if (!window.web3.contract) {
    showToast('Contract not configured. Go to Settings.', 'error'); return;
  }

  const btn = document.getElementById('submit-loan-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing & Submitting…';

  const borrowerInfo = {
    fullName:         document.getElementById('b-fullname').value.trim(),
    email:            document.getElementById('b-email').value.trim(),
    country:          document.getElementById('b-country').value,
    city:             document.getElementById('b-city').value.trim(),
    employmentStatus: document.getElementById('b-employment').value
  };
  const amount      = document.getElementById('b-amount').value;
  const installments = document.getElementById('b-installments').value;

  try {
    let result;
    if (collateralType === 'rwa') {
      const assetTypeRaw = document.getElementById('rwa-asset-type').value;
      const assetType = assetTypeRaw === 'custom' ? document.getElementById('rwa-asset-custom').value : assetTypeRaw;
      const docHashHex = uploadedDocHash && uploadedDocHash.startsWith('0x')
        ? uploadedDocHash.padEnd(66, '0').slice(0, 66)
        : '0x' + (uploadedDocHash || '0').replace('0x','').padEnd(64,'0').slice(0,64);

      result = await window.web3.createLoanWithRWA(borrowerInfo, amount, installments, {
        assetType,
        description:      document.getElementById('rwa-description').value.trim(),
        estimatedValueUSD: document.getElementById('rwa-value').value,
        jurisdiction:     document.getElementById('rwa-jurisdiction').value.trim(),
        documentHash:     docHashHex,
        documentURI:      uploadedDocURI || ''
      });
    } else {
      const tokenAddr = rwaCryptoToken === 'usdc'
        ? window.USDC_ADDRESS
        : document.getElementById('crypto-token-addr').value.trim();
      result = await window.web3.createLoanWithCrypto(borrowerInfo, amount, installments, {
        tokenAddress: tokenAddr,
        amount:       document.getElementById('crypto-amount').value,
        ratioBps:     parseInt(document.getElementById('crypto-ratio').value) * 100
      });
    }

    showToast(`Loan #${result.loanId} submitted successfully!`, 'success');
    showLoanSuccessModal(result.loanId, result.tx.hash);
    resetBorrowForm();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Transaction failed', 'error', 8000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Sign & Submit Loan';
  }
}

function showLoanSuccessModal(loanId, txHash) {
  showModal({
    title: '🎉 Loan Submitted!',
    content: `
      <div class="text-center space-y-4" style="padding:12px 0;">
        <div style="font-size:56px;">🎉</div>
        <div>
          <div style="font-size:20px; font-weight:800; color:var(--text-primary); margin-bottom:6px;">Loan #${loanId} Created</div>
          <div style="font-size:14px; color:var(--text-secondary);">Your loan request is now on Arc Testnet.</div>
        </div>
        <div class="card card-sm" style="background:var(--bg-input); text-align:left;">
          <div class="detail-row"><span class="detail-label">Loan ID</span><span class="detail-value mono">#${loanId}</span></div>
          <div class="detail-row" style="border:none;"><span class="detail-label">Tx Hash</span>
            <a href="https://testnet.arcscan.app/tx/${txHash}" target="_blank" class="underline-link mono text-xs">${txHash.slice(0,16)}…</a>
          </div>
        </div>
        <div style="font-size:13px; color:var(--text-muted);">A lender will review your request and set the interest rate. You'll see updates in your Dashboard.</div>
      </div>
    `,
    size: 'modal-sm',
    actions: [
      { label: 'View Dashboard', primary: true, onClick: (c) => { c(); showPage('dashboard'); } },
      { label: 'Apply Another', onClick: (c) => { c(); showPage('borrow'); } }
    ]
  });
}

function resetBorrowForm() {
  borrowStep(1);
  ['b-fullname','b-email','b-city','b-amount','b-purpose','rwa-description','rwa-value','rwa-jurisdiction','crypto-amount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['b-country','b-installments','b-employment','rwa-asset-type'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  uploadedDocHash = null; uploadedDocURI = null; uploadedDocFile = null;
  document.getElementById('rwa-doc-info').style.display = 'none';
  document.getElementById('rwa-upload-zone').classList.remove('has-file');
  document.getElementById('loan-preview').style.display = 'none';
  selectCollateralType('rwa');
}

// ══════════════════════════════════════════════════════════════
// LENDER DASHBOARD
// (loadLenderLoans, filterLenderLoans, _lendRender defined in marketplace.js)
// ══════════════════════════════════════════════════════════════

function openApproveLoanModal(loanId) {
  showModal({
    title: `✅ Approve Loan #${loanId}`,
    content: `
      <div class="form-section">
        <div class="legal-banner legal-banner-info" style="margin-bottom:16px;">
          <i class="fa-solid fa-info-circle"></i>
          <div>You are about to approve this loan. Set the interest rate (≤ 5%/month) and installment schedule. You will then need to disburse USDC.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Monthly Interest Rate <span class="req">*</span></label>
          <div class="input-group">
            <input id="approve-rate" class="form-control" type="number" min="0" max="5" step="0.1" placeholder="e.g. 3.5" value="3" />
            <span class="input-suffix">% / month</span>
          </div>
          <span class="field-hint">Maximum 5% per month — Fixed, no compounding</span>
        </div>
        <div class="form-group">
          <label class="form-label">Installment Interval <span class="req">*</span></label>
          <select id="approve-days" class="form-control">
            <option value="7">Weekly (7 days)</option>
            <option value="14">Bi-weekly (14 days)</option>
            <option value="30" selected>Monthly (30 days)</option>
            <option value="60">Bi-monthly (60 days)</option>
            <option value="90">Quarterly (90 days)</option>
          </select>
        </div>
      </div>
    `,
    size: 'modal-sm',
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      { label: '✅ Approve', primary: true, onClick: async (close) => {
        const rate = parseFloat(document.getElementById('approve-rate').value);
        const days = parseInt(document.getElementById('approve-days').value);
        if (isNaN(rate) || rate < 0 || rate > 5) { showToast('Invalid rate (0–5%)', 'error'); return; }
        close();
        await doApproveLoan(loanId, rate, days);
      }}
    ]
  });
}

async function doApproveLoan(loanId, ratePct, days) {
  const toast = showToast('Approving loan…', 'info', 0);
  try {
    // Contract expects integer % (1-5), not basis points
    const rateInt = Math.round(ratePct);
    await window.web3.approveLoan(loanId, rateInt);
    toast.remove?.();
    showToast(`Loan #${loanId} approved at ${ratePct}%/month!`, 'success');
    loadLenderLoans();
  } catch (err) {
    toast.remove?.();
    showToast(err.message || 'Approval failed', 'error', 8000);
  }
}

async function rejectLoan(loanId) {
  const confirmed = await confirmAction(`Reject Loan #${loanId}?`, 'This will permanently reject the loan request. Crypto collateral (if any) will be returned to the borrower.');
  if (!confirmed) return;
  const toast = showToast('Rejecting loan…', 'info', 0);
  try {
    await window.web3.rejectLoan(loanId);
    toast.remove?.();
    showToast(`Loan #${loanId} rejected.`, 'info');
    loadLenderLoans();
  } catch (err) {
    toast.remove?.();
    showToast(err.message, 'error', 8000);
  }
}

async function disburseLoan(loanId, amount) {
  const confirmed = await confirmAction(`Disburse Loan #${loanId}?`, `You will send $${parseFloat(amount).toFixed(2)} USDC to the borrower. Make sure you have approved the USDC spend.`);
  if (!confirmed) return;
  const toast = showToast('Disbursing USDC…', 'info', 0);
  try {
    await window.web3.disburseLoan(loanId, amount);
    toast.remove?.();
    showToast(`Loan #${loanId} funded! USDC sent to borrower.`, 'success');
    loadLenderLoans();
  } catch (err) {
    toast.remove?.();
    showToast(err.message, 'error', 8000);
  }
}

async function viewLoanDetails(loanId) {
  const loan = await window.web3.getLoanFull(loanId);
  if (!loan) { showToast('Failed to load loan', 'error'); return; }

  const col = loan.collateral;
  showModal({
    title: `📋 Loan #${loanId} Details`,
    size: 'modal-lg',
    content: `
      <div class="grid-2" style="gap:20px;">
        <div class="space-y-4">
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">👤 Borrower</div>
            <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${loan.borrowerInfo.fullName}</span></div>
            <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${loan.borrowerInfo.email}</span></div>
            <div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${loan.borrowerInfo.city}, ${loan.borrowerInfo.country}</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Address</span><span class="detail-value mono text-xs">${loan.borrower}</span></div>
          </div>
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">💵 Loan Terms</div>
            <div class="detail-row"><span class="detail-label">Principal</span><span class="detail-value mono text-cyan">$${parseFloat(loan.principalAmount).toFixed(2)}</span></div>
            <div class="detail-row"><span class="detail-label">Total Repayable</span><span class="detail-value mono">$${(parseFloat(loan.totalRepayable||0) + parseFloat(loan.principalAmount||0) * PLATFORM_FEE_PCT).toFixed(2)}</span></div>
            <div class="detail-row"><span class="detail-label">Platform Fee (2%)</span><span class="detail-value mono" style="color:var(--amber);">$${(parseFloat(loan.principalAmount||0) * PLATFORM_FEE_PCT).toFixed(2)} USDC</span></div>
            <div class="detail-row"><span class="detail-label">Interest Rate</span><span class="detail-value">${loan.interestRateMonthly > 0 ? loan.interestRateMonthly + '%' : 'Set by lender'} / month</span></div>
            <div class="detail-row"><span class="detail-label">Installments</span><span class="detail-value">${loan.paidInstallments}/${loan.totalInstallments} paid</span></div>
            <div class="detail-row" style="border:none;"><span class="detail-label">Status</span>${statusBadge(loan.statusLabel)}</div>
          </div>
        </div>
        <div class="space-y-4">
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:12px; color:var(--cyan);">🛡️ Collateral — ${collateralBadge(col.colTypeLabel)}</div>
            ${col.colTypeLabel === 'RWA' ? `
              <div class="detail-row"><span class="detail-label">Asset Type</span><span class="detail-value">${col.assetType}</span></div>
              <div class="detail-row"><span class="detail-label">Description</span><span class="detail-value text-xs">${col.description}</span></div>
              <div class="detail-row"><span class="detail-label">Est. Value</span><span class="detail-value mono">$${parseFloat(col.estimatedValueUSD).toFixed(2)}</span></div>
              <div class="detail-row"><span class="detail-label">Jurisdiction</span><span class="detail-value">${col.jurisdiction}</span></div>
              <div class="detail-row"><span class="detail-label">Verified</span>${col.rwaVerified ? '<span class="badge badge-active">✓ Verified</span>' : '<span class="badge badge-pending">Pending</span>'}</div>
              <div class="detail-row"><span class="detail-label">Doc Hash</span><span class="detail-value mono text-xs break-all">${col.documentHash}</span></div>
              ${col.documentURI && col.documentURI.startsWith('ipfs://')
                ? `<div class="detail-row" style="border:none;"><span class="detail-label">Proof Document</span><span class="detail-value"><a href="https://gateway.pinata.cloud/ipfs/${col.documentURI.replace('ipfs://','').replace(/^0x/,'')}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.3);border-radius:6px;color:var(--cyan);font-size:11px;text-decoration:none;font-weight:600;"><i class=\"fa-solid fa-file-arrow-down\"></i> View Document (IPFS)</a></span></div>`
                : col.documentURI && !col.documentURI.startsWith('file://')
                ? `<div class="detail-row" style="border:none;"><span class="detail-label">Proof Document</span><span class="detail-value"><a href="${col.documentURI}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);font-size:11px;"><i class="fa-solid fa-file-arrow-down"></i> View Document</a></span></div>`
                : `<div class="detail-row" style="border:none;"><span class="detail-label">Proof</span><span class="detail-value mono" style="font-size:9px;color:var(--text-muted);">Hash stored on-chain — no IPFS link (Pinata not configured)</span></div>`}

            ` : `
              <div class="detail-row"><span class="detail-label">Token</span><span class="detail-value mono text-xs">${col.cryptoToken}</span></div>
              <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value mono">${parseFloat(col.cryptoAmount).toFixed(2)}</span></div>
              <div class="detail-row"><span class="detail-label">Ratio</span><span class="detail-value">${col.collateralRatio}%</span></div>
              <div class="detail-row" style="border:none;"><span class="detail-label">Collateral</span><span class="badge badge-active">🔐 On-Chain</span></div>
            `}
          </div>
          <div class="card card-sm" style="background:var(--bg-input);">
            <div class="card-title" style="font-size:13px; margin-bottom:10px; color:var(--cyan);">📅 Schedule</div>
            <div class="space-y-2">
              ${loan.installments.map((inst,i) => `
                <div class="installment-row ${inst.status === 'Paid' ? 'paid' : inst.status === 'Overdue' ? 'overdue' : ''}">
                  <span class="text-xs font-mono" style="color:var(--text-muted); min-width:24px;">#${i+1}</span>
                  <span class="text-sm mono" style="flex:1;">$${parseFloat(inst.amount).toFixed(2)}</span>
                  <span class="text-xs text-muted">${formatDate(inst.dueDate)}</span>
                  ${statusBadge(inst.status)}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `,
    actions: [
      { label: 'Close', onClick: (c) => c() },
      ...(['Active','Repaid'].includes(loan.statusLabel) && window.RCPT?.getForLoan(loanId, loan.statusLabel === 'Repaid' ? 'LOAN_REPAID' : 'LOAN_FUNDED')
        ? [{ label: '<i class="fa-solid fa-file-pdf"></i> View Receipt', primary: false,
             onClick: (c) => { viewLoanReceipt(loanId, loan.statusLabel === 'Repaid' ? 'LOAN_REPAID' : 'LOAN_FUNDED'); } }]
        : [])
    ]
  });
}

async function verifyRWA(loanId) {
  const toast = showToast('Verifying RWA document…', 'info', 0);
  try {
    await window.web3.verifyRWA(loanId);
    toast.remove?.();
    showToast('RWA document verified ✓', 'success');
    closeModal();
    loadLenderLoans();
  } catch (err) {
    toast.remove?.();
    showToast(err.message, 'error', 8000);
  }
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function loadDashboard() {
  if (!window.web3.isConnected()) {
    document.getElementById('dashboard-loans-tbody').innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🔗</div><div class="empty-title">Wallet not connected</div><div class="empty-desc">Connect your wallet to view your dashboard.</div></div></td></tr>`;
    return;
  }
  if (!window.web3.contract) {
    document.getElementById('dashboard-loans-tbody').innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🔧</div><div class="empty-title">Contract not configured</div></div></td></tr>`;
    return;
  }

  document.getElementById('dashboard-loans-tbody').innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="spinner dark"></div></div></td></tr>`;

  try {
    const loans = await window.web3.getBorrowerLoans();
    const active    = loans.filter(l => l.statusLabel === 'Active').length;
    const completed = loans.filter(l => l.statusLabel === 'Repaid').length;
    const borrowed  = loans.reduce((s,l) => s + parseFloat(l.principalAmount||0), 0);
    let   remaining = 0;
    for (const l of loans.filter(l => l.statusLabel === 'Active')) {
      const rem = await window.web3.getRemainingAmount(l.id);
      remaining += parseFloat(rem?.remaining || 0);
    }

    document.getElementById('ds-active').textContent    = active;
    document.getElementById('ds-borrowed').textContent  = `$${borrowed.toFixed(0)}`;
    document.getElementById('ds-remaining').textContent = `$${remaining.toFixed(0)}`;
    document.getElementById('ds-completed').textContent = completed;

    if (!loans.length) {
      document.getElementById('dashboard-loans-tbody').innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No loans found</div><div class="empty-desc">Apply for a loan to get started.</div></div></td></tr>`;
      return;
    }

    document.getElementById('dashboard-loans-tbody').innerHTML = loans.map(loan => `
      <tr>
        <td class="mono font-bold" style="color:var(--cyan);">#${loan.id}</td>
        <td class="mono" style="color:var(--text-primary);">$${parseFloat(loan.principalAmount).toFixed(2)}</td>
        <td style="color:var(--green); font-size:12px;">${loan.interestRateMonthly > 0 ? loan.interestRateMonthly + '%/mo' : '—'}</td>
        <td>${loan.totalInstallments}</td>
        <td style="min-width:140px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="progress-track" style="flex:1; height:5px;">
              <div class="progress-fill" style="width:${loan.totalInstallments ? (loan.paidInstallments/loan.totalInstallments*100).toFixed(0) : 0}%;"></div>
            </div>
            <span class="mono text-xs text-muted">${loan.paidInstallments}/${loan.totalInstallments}</span>
          </div>
        </td>
        <td>${statusBadge(loan.statusLabel)}</td>
        <td>
          <div class="flex" style="gap:6px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="viewLoanDetails(${loan.id})"><i class="fa-solid fa-eye"></i></button>
            ${loan.statusLabel === 'Active' ? `
              <button class="btn btn-primary btn-sm" onclick="showPage('payments'); setTimeout(()=>loadLoanInstallments(${loan.id}),300)">
                <i class="fa-solid fa-credit-card"></i> Pay
              </button>` : ''}
            ${loan.statusLabel === 'Requested' ? `
              <button class="btn btn-danger btn-sm" onclick="cancelLoan(${loan.id})">Cancel</button>` : ''}
            ${(loan.statusLabel === 'Active' || loan.statusLabel === 'Repaid') ? `
              ${_rcptBtnHtml(loan.id, loan.statusLabel === 'Repaid' ? 'LOAN_REPAID' : 'LOAN_FUNDED')}` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('dashboard-loans-tbody').innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">Error loading</div><div class="empty-desc">${err.message}</div></div></td></tr>`;
  }
}

async function cancelLoan(loanId) {
  const confirmed = await confirmAction(`Cancel Loan #${loanId}?`, 'This will cancel your pending loan request. Any locked crypto collateral will be returned.');
  if (!confirmed) return;
  const toast = showToast('Cancelling…', 'info', 0);
  try {
    await window.web3.cancelLoan(loanId);
    toast.remove?.();
    showToast(`Loan #${loanId} cancelled.`, 'info');
    loadDashboard();
  } catch (err) {
    toast.remove?.();
    showToast(err.message, 'error', 8000);
  }
}

// ══════════════════════════════════════════════════════════════
// PAYMENT CENTER
// ══════════════════════════════════════════════════════════════
async function loadPayments() {
  if (!window.web3.isConnected() || !window.web3.contract) return;
  refreshWalletBalance();

  const loans = await window.web3.getBorrowerLoans();
  const select = document.getElementById('pay-loan-select');
  select.innerHTML = '<option value="">— Select a loan —</option>';
  loans.filter(l => l.statusLabel === 'Active').forEach(l => {
    select.innerHTML += `<option value="${l.id}">Loan #${l.id} — $${parseFloat(l.principalAmount).toFixed(2)} USDC (${l.paidInstallments}/${l.totalInstallments} paid)</option>`;
  });
}

async function loadLoanInstallments(loanId) {
  if (!loanId) {
    document.getElementById('installments-card').style.display = 'none';
    document.getElementById('pay-full-card').style.display     = 'none';
    document.getElementById('payment-history-list').innerHTML  = '<div class="empty-state" style="padding:24px;"><div class="empty-icon" style="font-size:32px;">🧾</div><div class="empty-title">Select a loan</div></div>';
    return;
  }

  const loan = await window.web3.getLoanFull(loanId);
  if (!loan) return;

  // Update select
  const select = document.getElementById('pay-loan-select');
  if (select) select.value = loanId;

  // Progress
  const paid  = loan.paidInstallments;
  const total = loan.totalInstallments;
  const pct   = total ? Math.round((paid/total)*100) : 0;
  document.getElementById('pay-progress-label').textContent = `${paid} of ${total} installments paid`;
  document.getElementById('pay-pct').textContent            = `${pct}%`;
  document.getElementById('pay-progress-bar').style.width   = `${pct}%`;
  document.getElementById('installments-progress-badge').className = `badge ${pct===100 ? 'badge-completed' : 'badge-active'}`;
  document.getElementById('installments-progress-badge').textContent = `${pct}% complete`;

  // Installment list
  const list = document.getElementById('installments-list');
  list.innerHTML = loan.installments.map((inst, i) => {
    const isPaid = inst.status === 'Paid';
    const isOverdue = inst.status === 'Overdue';
    return `
      <div class="installment-row ${isPaid ? 'paid' : isOverdue ? 'overdue' : ''}">
        <span class="text-xs mono text-muted" style="min-width:20px;">#${i+1}</span>
        <div style="flex:1;">
          <div class="text-sm font-bold mono" style="color:var(--text-primary);">$${parseFloat(inst.amount).toFixed(2)} USDC</div>
          <div class="text-xs text-muted">Due: ${formatDate(inst.dueDate)}${inst.paidDate ? ` · Paid: ${formatDate(inst.paidDate)}` : ''}</div>
        </div>
        ${statusBadge(inst.status)}
        ${!isPaid && loan.statusLabel === 'Active' ? `
          <button class="btn btn-primary btn-sm" onclick="payInstallment(${loanId}, ${i}, ${inst.amount})">
            <i class="fa-solid fa-circle-dollar-to-slot"></i> Pay
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  document.getElementById('installments-card').style.display = 'block';

  // Full repay
  const remaining = loan.installments.filter(i => i.status === 'Pending').reduce((s,i) => s+parseFloat(i.amount),0);
  const pendingCount = loan.installments.filter(i => i.status === 'Pending').length;
  if (pendingCount > 0 && loan.statusLabel === 'Active') {
    document.getElementById('pay-remaining-total').textContent = `$${remaining.toFixed(2)} USDC`;
    document.getElementById('pay-pending-count').textContent   = pendingCount;
    document.getElementById('pay-full-card').style.display     = 'block';
    document.getElementById('pay-full-card')._loanId           = loanId;
    document.getElementById('pay-full-card')._remaining        = remaining;
  }

  // Payment history
  renderPaymentHistory(loan);
}

function renderPaymentHistory(loan) {
  const paidInst = loan.installments.filter(i => i.status === 'Paid');
  const container = document.getElementById('payment-history-list');
  if (!paidInst.length) {
    container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-icon" style="font-size:32px;">💳</div><div class="empty-title">No payments yet</div></div>';
    return;
  }
  container.innerHTML = paidInst.map(inst => `
    <div class="installment-row paid">
      <span style="font-size:20px;">✅</span>
      <div style="flex:1;">
        <div class="text-sm font-bold" style="color:var(--text-primary);">Installment #${inst.index+1} — $${parseFloat(inst.amount).toFixed(2)} USDC</div>
        <div class="text-xs text-muted">Paid: ${formatDate(inst.paidDate)}</div>
        ${inst.txHash && inst.txHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
          ? `<a href="${window.ARC_EXPLORER}/tx/${inst.txHash}" target="_blank" class="underline-link mono" style="font-size:10px;">View on Explorer →</a>` : ''}
      </div>
      <span class="badge badge-paid">Paid</span>
    </div>
  `).join('');
}

async function payInstallment(loanId, index, amount) {
  const confirmed = await confirmAction(
    `Pay Installment #${index+1}?`,
    `This will transfer $${parseFloat(amount).toFixed(2)} USDC from your wallet. Approve the transaction in your wallet.`
  );
  if (!confirmed) return;

  const toast = showToast('Approving & sending payment…', 'info', 0);
  try {
    const result = await window.web3.payInstallment(loanId, index, amount);
    toast.remove?.();
    showToast(`Installment #${index+1} paid! Tx: ${result.txHash.slice(0,10)}…`, 'success');
    showReceiptModal({ loanId, installmentIndex: index, amount, txHash: result.txHash, type: 'Installment Payment' });
    loadLoanInstallments(loanId);
  } catch (err) {
    toast.remove?.();
    showToast(err.message || 'Payment failed', 'error', 8000);
  }
}

async function payFullLoan() {
  const card      = document.getElementById('pay-full-card');
  const loanId    = card._loanId;
  const remaining = card._remaining;
  if (!loanId) return;

  const confirmed = await confirmAction(
    `Repay Full Loan #${loanId}?`,
    `This will pay all remaining installments totalling $${parseFloat(remaining).toFixed(2)} USDC. Multiple transactions may be needed.`
  );
  if (!confirmed) return;

  const btn = document.getElementById('pay-full-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processing…';

  try {
    const loan = await window.web3.getLoanFull(loanId);
    const pending = loan.installments.filter(i => i.status === 'Pending');
    let lastTx = null;

    for (const inst of pending) {
      showToast(`Paying installment #${inst.index+1}…`, 'info', 2000);
      lastTx = await window.web3.payInstallment(loanId, inst.index, inst.amount);
    }

    showToast(`Loan #${loanId} fully repaid! 🎉`, 'success');
    if (lastTx) showReceiptModal({ loanId, amount: remaining, txHash: lastTx.txHash, type: 'Full Loan Repayment' });

    // ── Generate PDF receipt for full repayment (background) ──────────────────
    if (window.RCPT) {
      try {
        const loanFull = await window.web3.getLoanFull(loanId);
        const repayTx = lastTx?.txHash || '';
        const receiptId = await window.RCPT.generate(
          loanFull,
          'LOAN_REPAID',
          { repay: repayTx },
          { wallet: window.web3?.address }
        );
        showToast(`📄 Repayment receipt ready — Loan #${loanId}`, 'info', 5000);
        // Show View Receipt button in a follow-up toast-style banner
        _showReceiptBanner(loanId, receiptId, 'LOAN_REPAID');
      } catch (rErr) {
        console.warn('[DaatFI Receipt] Receipt generation error:', rErr);
      }
    }

    loadLoanInstallments(loanId);
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Payment failed', 'error', 8000);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Repay Entire Loan';
  }
}

async function refreshWalletBalance() {
  if (!window.web3.isConnected()) return;
  const bal = await window.web3.getUSDCBalance();
  document.getElementById('pay-wallet-balance').textContent = `$${parseFloat(bal).toFixed(2)}`;
}

// ══════════════════════════════════════════════════════════════
// RECEIPT MODAL
// ══════════════════════════════════════════════════════════════
function showReceiptModal(data) {
  const html = `
    <div class="receipt-paper">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <div style="font-size:18px; font-weight:800; color:var(--text-primary);">🧾 DaatFI Receipt</div>
          <div style="font-size:11px; color:var(--text-muted);">Arc Testnet — Chain ID: ${window.ARC_CHAIN_ID}</div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); text-align:right;">${new Date().toLocaleString()}</div>
      </div>
      <hr class="receipt-divider"/>
      <div class="detail-row"><span class="detail-label">Loan ID</span><span class="detail-value mono">#${data.loanId}</span></div>
      <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${data.type || 'Payment'}</span></div>
      ${data.installmentIndex !== undefined ? `<div class="detail-row"><span class="detail-label">Installment</span><span class="detail-value">#${data.installmentIndex+1}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value mono text-green font-bold">$${parseFloat(data.amount).toFixed(2)} USDC</span></div>
      <div class="detail-row"><span class="detail-label">From</span><span class="detail-value mono text-xs">${window.web3.address}</span></div>
      <hr class="receipt-divider"/>
      ${data.txHash ? `
        <div style="margin-top:4px;">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Transaction Hash</div>
          <div class="mono text-xs break-all" style="color:var(--cyan);">${data.txHash}</div>
          <a href="${window.ARC_EXPLORER}/tx/${data.txHash}" target="_blank" class="underline-link" style="margin-top:6px; display:inline-block;">View on Explorer →</a>
        </div>
      ` : ''}
    </div>
  `;

  showModal({
    title: '🧾 Payment Receipt',
    content: html,
    size: 'modal-sm',
    actions: [
      { label: 'Copy Tx Hash', onClick: () => { navigator.clipboard.writeText(data.txHash || ''); showToast('Copied!','success',2000); }},
      { label: 'Close', primary: true, onClick: (c) => c() }
    ]
  });

  // Store receipt locally (no backend — fully on-chain DApp)
  try {
    const receipts = JSON.parse(localStorage.getItem('arcfi-receipts') || '[]');
    receipts.unshift({ ...data, wallet: window.web3.address, timestamp: Date.now() });
    if (receipts.length > 50) receipts.length = 50;
    localStorage.setItem('arcfi-receipts', JSON.stringify(receipts));
  } catch {}
}

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
function loadSettingsValues() {
  document.getElementById('cfg-contract').value      = localStorage.getItem('arcfi-contract') || '';
  document.getElementById('cfg-marketplace').value   = localStorage.getItem('arcfi-marketplace') || '';
  document.getElementById('cfg-usdc').value          = localStorage.getItem('arcfi-usdc') || '';
  document.getElementById('cfg-pinata-key').value    = localStorage.getItem('arcfi-pinata-key') || '';
  document.getElementById('cfg-pinata-secret').value = localStorage.getItem('arcfi-pinata-secret') || '';
}

function saveSettings() {
  const contractAddr   = document.getElementById('cfg-contract').value.trim();
  const marketplaceAddr= document.getElementById('cfg-marketplace').value.trim();
  const usdcAddr       = document.getElementById('cfg-usdc').value.trim();
  const pinataKey      = document.getElementById('cfg-pinata-key').value.trim();
  const pinataSecret   = document.getElementById('cfg-pinata-secret').value.trim();

  if (contractAddr)    localStorage.setItem('arcfi-contract', contractAddr);
  if (marketplaceAddr) localStorage.setItem('arcfi-marketplace', marketplaceAddr);
  if (usdcAddr)        localStorage.setItem('arcfi-usdc', usdcAddr);
  if (pinataKey)       localStorage.setItem('arcfi-pinata-key', pinataKey);
  if (pinataSecret)    localStorage.setItem('arcfi-pinata-secret', pinataSecret);

  // Apply to globals
  window.LOAN_CONTRACT_ADDRESS        = contractAddr;
  window.USDC_CONTRACT_ADDRESS        = usdcAddr;
  window.MARKETPLACE_CONTRACT_ADDRESS = marketplaceAddr;
  window.CONTRACT_ADDRESS             = contractAddr;
  window.USDC_ADDRESS                 = usdcAddr;
  window.MARKETPLACE_ADDRESS          = marketplaceAddr;
  window.PINATA_API_KEY               = pinataKey;
  window.PINATA_SECRET_KEY            = pinataSecret;

  // Re-init contracts if wallet connected
  if (window.web3.signer) {
    if (contractAddr)    window.web3.contract             = new ethers.Contract(contractAddr,    window.LOAN_ABI,        window.web3.signer);
    if (usdcAddr)        window.web3.usdcContract         = new ethers.Contract(usdcAddr,        window.ERC20_ABI,       window.web3.signer);
    if (marketplaceAddr) window.web3.marketplaceContract  = new ethers.Contract(marketplaceAddr, window.MARKETPLACE_ABI, window.web3.signer);
  }

  // Hide config banner if all critical are set
  if (contractAddr && usdcAddr) document.getElementById('config-banner').style.display = 'none';

  document.getElementById('settings-saved-msg').style.display = 'flex';
  showToast('Settings saved!', 'success');
}

async function addArcNetwork() {
  if (!window.ethereum) { showToast('No wallet detected', 'error'); return; }
  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: ethers.utils.hexValue(5042002),
        chainName: 'Arc Testnet',
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
        rpcUrls: ['https://rpc.testnet.arc.network'],
        blockExplorerUrls: ['https://testnet.arcscan.app']
      }]
    });
    showToast('Arc Testnet added to wallet ✓', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to add network', 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// CHATBOT INTEGRATION
// ══════════════════════════════════════════════════════════════
function chatQuick(msg) {
  const input = document.getElementById('chat-input');
  if (input) { input.value = msg; sendChatMessage(); }
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text  = input?.value?.trim();
  if (!text || !window.chatbot?.agent) return;
  input.value = '';

  addChatMessage('user', text);
  document.getElementById('chat-typing').style.display = 'block';

  try {
    let response;
    if (/^(confirm|yes|ok|sure|proceed)$/i.test(text) && window.chatbot.agent.pendingAction) {
      response = await window.chatbot.agent.executePendingAction();
    } else if (/^(cancel|no|abort)$/i.test(text) && window.chatbot.agent.pendingAction) {
      response = await window.chatbot.agent.cancelPendingAction();
    } else {
      response = await window.chatbot.agent.process(text);
    }

    await new Promise(r => setTimeout(r, 500));
    document.getElementById('chat-typing').style.display = 'none';
    addChatMessage('bot', response.text, response.type);

    if (response.action?.type === 'NAVIGATE') showPage(response.action.target);
    if (response.txHash) showReceiptModal({ loanId: 'N/A', amount: 0, txHash: response.txHash, type: 'AI Payment' });
  } catch (err) {
    document.getElementById('chat-typing').style.display = 'none';
    addChatMessage('bot', `❌ ${err.message}`, 'error');
  }
}

function addChatMessage(role, text, type = '') {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary)">$1</strong>')
    .replace(/\n/g, '<br/>');

  const div = document.createElement('div');
  div.className = `chat-msg ${role} ${type || ''}`;
  div.innerHTML = `<div class="chat-bubble">${formatted}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  if (role === 'bot' && !window.chatbot?.isOpen) {
    document.getElementById('chat-unread').classList.add('show');
  }
}

// Patch chatbot toggle to update unread
if (window.chatbot) {
  const origToggle = window.chatbot.toggle.bind(window.chatbot);
  window.chatbot.toggle = function() {
    origToggle();
    if (window.chatbot.isOpen) document.getElementById('chat-unread').classList.remove('show');
  };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function statusBadge(status) {
  // Supports both on-chain labels (title-case) and legacy UPPERCASE labels
  const map = {
    // On-chain labels from ArcFiLoanManager
    'Requested': 'badge-pending',
    'Approved':  'badge-approved',
    'Active':    'badge-active',
    'Repaid':    'badge-completed',
    'Defaulted': 'badge-defaulted',
    // Installment labels (from _normalizeLoan)
    'Paid':    'badge-paid',
    'Pending': 'badge-pending',
    'Overdue': 'badge-overdue',
    // Legacy UPPERCASE — kept for backward-compat
    PENDING:'badge-pending', APPROVED:'badge-approved', ACTIVE:'badge-active',
    COMPLETED:'badge-completed', DEFAULTED:'badge-defaulted', REJECTED:'badge-rejected',
    CANCELLED:'badge-cancelled', PAID:'badge-paid', OVERDUE:'badge-overdue'
  };
  return `<span class="badge ${map[status]||'badge-pending'}"><span class="badge-dot"></span>${status}</span>`;
}

function collateralBadge(type) {
  const map = { RWA:'badge-rwa', CRYPTO:'badge-crypto' };
  const icon = type === 'RWA' ? '🏠' : type === 'CRYPTO' ? '🔐' : '—';
  return `<span class="badge ${map[type]||''}">${icon} ${type}</span>`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}

function confirmAction(title, message) {
  return new Promise(resolve => {
    showModal({
      title: `⚠️ ${title}`,
      content: `<p style="color:var(--text-secondary); font-size:14px; line-height:1.6;">${message}</p>`,
      size: 'modal-sm',
      actions: [
        { label: 'Cancel',  onClick: (c) => { c(); resolve(false); } },
        { label: 'Confirm', primary: true, onClick: (c) => { c(); resolve(true); } }
      ]
    });
  });
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  const savedContract   = localStorage.getItem('arcfi-contract');
  const savedMarketplace= localStorage.getItem('arcfi-marketplace');
  const savedUsdc       = localStorage.getItem('arcfi-usdc');
  const savedPinata     = localStorage.getItem('arcfi-pinata-key');
  const savedSecret     = localStorage.getItem('arcfi-pinata-secret');

  if (savedContract)    { window.LOAN_CONTRACT_ADDRESS = savedContract;    window.CONTRACT_ADDRESS     = savedContract; }
  if (savedMarketplace) { window.MARKETPLACE_CONTRACT_ADDRESS = savedMarketplace; window.MARKETPLACE_ADDRESS = savedMarketplace; }
  if (savedUsdc)        { window.USDC_CONTRACT_ADDRESS = savedUsdc;        window.USDC_ADDRESS         = savedUsdc; }
  if (savedPinata)      { window.PINATA_API_KEY     = savedPinata; }
  if (savedSecret)      { window.PINATA_SECRET_KEY  = savedSecret; }
  if (savedContract && savedUsdc) document.getElementById('config-banner').style.display = 'none';

  // Init chatbot welcome message
  setTimeout(() => {
    addChatMessage('bot', "👋 Hi! I'm **DaatFI AI**. I help you manage loans, payments, and marketplace offers on Arc Testnet.\n\nType **help** to see what I can do!");
  }, 1000);

  // Auto-connect if previously connected
  if (window.ethereum && localStorage.getItem('arcfi-wallet-connected')) {
    window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
      if (accounts?.length) connectWallet();
    });
  }

  // Save connected state
  window.web3.on('connected', () => localStorage.setItem('arcfi-wallet-connected', '1'));
  window.web3.on('disconnected', () => localStorage.removeItem('arcfi-wallet-connected'));

  // Theme buttons in settings
  const theme = localStorage.getItem('arcfi-theme') || 'dark';
  document.getElementById(`theme-${theme}-btn`)?.classList.add('selected');

  // Load home stats
  loadHomeStats();

  // Drag-and-drop for upload zone
  const zone = document.getElementById('rwa-upload-zone');
  if (zone) {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) {
        const input = document.getElementById('rwa-doc-file');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        handleDocUpload(input);
      }
    });
  }

  // Auto-fill wallet on lend page
  window.web3.on('connected', ({ address }) => {
    const ofWallet = document.getElementById('of-wallet');
    if (ofWallet) ofWallet.value = address;
    refreshOfferBalance && refreshOfferBalance();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Circle Faucet — request testnet USDC via server-side proxy
// ─────────────────────────────────────────────────────────────────────────────
async function circleRequestFaucet() {
  const statusEl = document.getElementById('faucet-status');
  const btn = document.querySelector('[onclick="circleRequestFaucet()"]');

  // Require connected wallet
  const address = window.web3?.address;
  if (!address) {
    showToast('Connect your wallet first to receive testnet USDC.', 'warning');
    return;
  }

  // UI: loading
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Requesting…'; }
  if (statusEl) { statusEl.style.display = 'none'; }

  try {
    const res = await fetch('/api/circle/faucet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '<div class="legal-banner legal-banner-info"><i class="fa-solid fa-check-circle"></i><span>Testnet USDC requested successfully! Tokens will arrive in your wallet shortly.</span></div>';
      }
      showToast('✅ Testnet USDC requested via Circle! Check your wallet in a few seconds.', 'success', 6000);
    } else {
      const msg = data.error || data.detail?.message || 'Request failed';
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<div class="legal-banner legal-banner-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>${msg}</span></div>`;
      }
      showToast('⚠ Faucet: ' + msg, 'warning', 6000);
    }
  } catch (err) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<div class="legal-banner legal-banner-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>Network error. Please try again.</span></div>';
    }
    showToast('❌ Faucet request failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-droplet"></i> Request Testnet USDC'; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PDF Receipt Integration Helpers (additive only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Show a non-blocking "View Receipt" banner after a receipt is generated.
 */
function _showReceiptBanner(loanId, receiptId, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const banner = document.createElement('div');
  banner.className = 'toast toast-info';
  banner.style.cssText = 'display:flex; align-items:center; gap:12px; padding:12px 16px; min-width:300px;';
  banner.innerHTML = `
    <i class="fa-solid fa-file-pdf" style="color:#38bdf8; font-size:18px;"></i>
    <div style="flex:1;">
      <div style="font-weight:700; font-size:13px;">Receipt Ready — Loan #${loanId}</div>
      <div style="font-size:11px; color:var(--text-muted);">${type === 'LOAN_FUNDED' ? 'Loan Funded' : 'Loan Repaid'} · PDF available</div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="window.RCPT&&window.RCPT.view('${receiptId}'); this.closest('.toast')?.remove();">
      <i class="fa-solid fa-eye"></i> View
    </button>
    <button style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;" onclick="this.closest('.toast')?.remove();">&times;</button>
  `;
  container.appendChild(banner);
  // Auto-remove after 15 seconds
  setTimeout(function () { banner.remove(); }, 15000);
}

/**
 * Open the receipt viewer for a given loan (called from dashboard/detail buttons).
 * type: 'LOAN_FUNDED' | 'LOAN_REPAID'
 */
function viewLoanReceipt(loanId, type) {
  if (!window.RCPT) { showToast('Receipt system not loaded.', 'warning'); return; }
  const existing = window.RCPT.getForLoan(loanId, type);
  if (existing) {
    window.RCPT.view(existing.receiptId);
  } else {
    showToast('No receipt available yet for this loan.', 'info', 4000);
  }
}

/**
 * Returns HTML for a "View Receipt" button if a receipt exists for this loan.
 * Safe for innerHTML injection (no user data in output).
 */
function _rcptBtnHtml(loanId, type) {
  if (!window.RCPT || !window.RCPT.getForLoan(loanId, type)) return '';
  return `<button class="btn btn-secondary btn-sm" style="margin-left:4px;" onclick="viewLoanReceipt('${loanId}','${type}')" title="View PDF Receipt">
    <i class="fa-solid fa-file-pdf"></i>
  </button>`;
}
