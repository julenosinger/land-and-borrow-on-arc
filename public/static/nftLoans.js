// ════════════════════════════════════════════════════════════════════════════
// DaatFI — NFT Loans Module  (STRICTLY ADDITIVE — no existing code touched)
// NFTLoanManager: 0x441fB638C3DAC841AF32F0DE90FccA79b346A7c9
// Arc Testnet — Chain ID 5042002
// ════════════════════════════════════════════════════════════════════════════
'use strict';

// ── Module-level state ────────────────────────────────────────────────────────
let _nftContract   = null;   // NFTLoanManager (with signer)
let _nftReadOnly   = null;   // NFTLoanManager (read-only)
let _selectedNFT   = null;   // { address, tokenId, name, collection, image }
let _myNftLoans    = [];     // cached borrower loans
let _countdownMap  = {};     // loanId => intervalId
let _nftCache      = {};     // address+tokenId => metadata
let _reputationScore = null; // cached score for connected wallet (null = not loaded)
let _searchMode    = 'contract'; // 'contract' | 'wallet'  — toggle state

// ── Helpers ───────────────────────────────────────────────────────────────────
function _fmt6(val) {
  if (!val) return '0.00';
  try { return (Number(val) / 1e6).toFixed(2); } catch { return '0.00'; }
}
function _shortAddr(a) {
  if (!a || a.length < 10) return a || '';
  return a.slice(0, 6) + '…' + a.slice(-4);
}
function _fmtDate(ts) {
  if (!ts || ts === '0') return '—';
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}
function _timeLeft(dueDate) {
  const now   = Math.floor(Date.now() / 1000);
  const due   = Number(dueDate);
  const delta = due - now;
  if (delta <= 0) return { text: 'Overdue', overdue: true };
  const d = Math.floor(delta / 86400);
  const h = Math.floor((delta % 86400) / 3600);
  const m = Math.floor((delta % 3600) / 60);
  if (d > 0)  return { text: `${d}d ${h}h remaining`, overdue: false };
  if (h > 0)  return { text: `${h}h ${m}m remaining`, overdue: false };
  return { text: `${m}m remaining`, overdue: false };
}
function _statusLabel(s) {
  const map = { 0: 'Requested', 1: 'Funded', 2: 'Repaid', 3: 'Defaulted', 4: 'Cancelled' };
  return map[Number(s)] || 'Unknown';
}
function _statusClass(s) {
  const map = { 0: 'nft-status-requested', 1: 'nft-status-funded', 2: 'nft-status-repaid', 3: 'nft-status-defaulted', 4: 'nft-status-cancelled' };
  return map[Number(s)] || '';
}
function _nftToast(msg, type = 'info') {
  if (window.showToast) window.showToast(msg, type);
  else console.log(`[NFT] ${type}: ${msg}`);
}
function _nftShowModal(html) {
  if (!window.showModal) { alert('Modal unavailable'); return; }
  window.showModal({ html, size: 'md' });
}

// ── Reputation helpers ────────────────────────────────────────────────────────
function _repTier(score) {
  if (score >= 80) return { label: 'Good',   cls: 'rep-good',   icon: '✅' };
  if (score >= 50) return { label: 'Medium', cls: 'rep-medium', icon: '⚠️' };
  return              { label: 'Risky',  cls: 'rep-risky',  icon: '🚫' };
}

async function _fetchReputation(addr) {
  try {
    const c = _getReadOnlyNFT();
    if (!c) return 100;
    const raw = await c.reputationScore(addr);
    return Number(raw);
  } catch { return 100; }
}

async function _renderReputationWidget(addr) {
  const el = document.getElementById('nft-reputation-widget');
  if (!el) return;

  el.innerHTML = '<span class="rep-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading score…</span>';

  const score = await _fetchReputation(addr);
  _reputationScore = score;

  const tier  = _repTier(score);
  const pct   = score; // 0–100 maps directly to 0–100%
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

  el.innerHTML = `
    <div class="rep-widget">
      <div class="rep-header">
        <span class="rep-title"><i class="fa-solid fa-star"></i> Reputation Score</span>
        <span class="rep-badge ${tier.cls}">${tier.icon} ${tier.label}</span>
      </div>
      <div class="rep-bar-wrap">
        <div class="rep-bar-track">
          <div class="rep-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <span class="rep-score-num" style="color:${color};">${score}<span style="font-size:12px;color:var(--text-muted);">/100</span></span>
      </div>
      <div class="rep-legend">
        <span class="rep-legend-item rep-good">80–100 Good</span>
        <span class="rep-legend-item rep-medium">50–79 Medium</span>
        <span class="rep-legend-item rep-risky">0–49 Risky</span>
      </div>
      ${score < 50 ? `
      <div class="rep-blocked-msg">
        <i class="fa-solid fa-ban"></i>
        Your reputation score is too low to request new loans.
      </div>` : ''}
    </div>
  `;
}

// ── Initialize contracts ──────────────────────────────────────────────────────
function _initNFTContracts() {
  try {
    const prov = new ethers.providers.JsonRpcProvider(window.ARC_RPC_URL);
    _nftReadOnly = new ethers.Contract(window.NFT_LOAN_ADDRESS, window.NFT_LOAN_ABI, prov);
    if (window.web3 && window.web3.signer) {
      _nftContract = new ethers.Contract(window.NFT_LOAN_ADDRESS, window.NFT_LOAN_ABI, window.web3.signer);
    }
    return true;
  } catch(e) {
    console.warn('[NFTLoan] init error:', e.message);
    return false;
  }
}
function _requireNFTSigner() {
  if (!window.web3 || !window.web3.address) throw new Error('Please connect your wallet first.');
  if (!window.web3.signer) throw new Error('Wallet signer not available. Reconnect.');
  if (!_nftContract) {
    _nftContract = new ethers.Contract(window.NFT_LOAN_ADDRESS, window.NFT_LOAN_ABI, window.web3.signer);
  }
  return _nftContract;
}
function _getReadOnlyNFT() {
  if (!_nftReadOnly) _initNFTContracts();
  return _nftReadOnly;
}

// ── NFT metadata resolution ───────────────────────────────────────────────────
async function _fetchNFTMeta(nftAddr, tokenId, provider) {
  const key = `${nftAddr}:${tokenId}`;
  if (_nftCache[key]) return _nftCache[key];
  try {
    const nft = new ethers.Contract(nftAddr, window.ERC721_ABI, provider);
    let collectionName = 'Unknown Collection';
    let tokenName      = `Token #${tokenId}`;
    let image          = null;

    try { collectionName = await nft.name(); } catch {}
    tokenName = `${collectionName} #${tokenId}`;

    // try tokenURI → fetch JSON
    try {
      let uri = await nft.tokenURI(tokenId);
      if (uri.startsWith('ipfs://')) uri = 'https://gateway.pinata.cloud/ipfs/' + uri.slice(7);
      const resp = await Promise.race([
        fetch(uri, { signal: AbortSignal.timeout(6000) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))
      ]);
      const meta = await resp.json();
      if (meta.name)  tokenName = meta.name;
      if (meta.image) {
        image = meta.image.startsWith('ipfs://')
          ? 'https://gateway.pinata.cloud/ipfs/' + meta.image.slice(7)
          : meta.image;
      }
    } catch {}

    const result = { name: tokenName, collection: collectionName, image };
    _nftCache[key] = result;
    return result;
  } catch(e) {
    return { name: `Token #${tokenId}`, collection: 'Unknown Collection', image: null };
  }
}

// ── NFT Image placeholder ─────────────────────────────────────────────────────
function _nftImgHtml(image, name, size = 80) {
  if (image) {
    return `<img src="${image}" alt="${name}" class="nft-img" style="width:${size}px;height:${size}px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="nft-img-fallback" style="display:none;width:${size}px;height:${size}px;"><i class="fa-solid fa-image"></i></div>`;
  }
  return `<div class="nft-img-fallback" style="width:${size}px;height:${size}px;"><i class="fa-solid fa-image"></i></div>`;
}

// ── Search mode toggle ────────────────────────────────────────────────────────
// NETWORK RULE: This system operates exclusively on ARC Network (testnet,
// Chain ID 5042002). Any ERC-721 NFT deployed on Arc Testnet is accepted as
// collateral. No collection whitelist, no rarity checks, no pricing oracle —
// the system is intentionally open and testnet-friendly.

/**
 * Switch between 'contract' and 'wallet' search modes.
 * Updates toggle button states and label/hint text — no search is triggered.
 */
function nftSetSearchMode(mode) {
  _searchMode = mode === 'wallet' ? 'wallet' : 'contract';

  // Update toggle button active state
  const btnC = document.getElementById('nft-stoggle-contract');
  const btnW = document.getElementById('nft-stoggle-wallet');
  if (btnC) btnC.classList.toggle('active', _searchMode === 'contract');
  if (btnW) btnW.classList.toggle('active', _searchMode === 'wallet');

  // Update label and hint
  const label = document.getElementById('nft-search-label');
  const hint  = document.getElementById('nft-search-hint');
  if (_searchMode === 'wallet') {
    if (label) label.textContent = 'Wallet Address';
    if (hint)  hint.textContent  = 'Enter a wallet address to browse all its ERC-721 NFTs across known collections';
  } else {
    if (label) label.textContent = 'ERC-721 Contract Address';
    if (hint)  hint.textContent  = 'Enter any ERC-721 contract deployed on Arc Testnet';
  }

  // Clear previous results on mode switch
  const grid    = document.getElementById('nft-wallet-grid');
  const emptyEl = document.getElementById('nft-wallet-empty');
  if (grid) grid.innerHTML = '';
  if (emptyEl) {
    emptyEl.style.display = 'block';
    emptyEl.innerHTML = _searchMode === 'wallet'
      ? '<i class="fa-solid fa-wallet"></i><br>Enter a wallet address above and click Search.'
      : '<i class="fa-solid fa-magnifying-glass"></i><br>Enter a contract or wallet address above and click Search.';
  }
}

/**
 * Search all NFTs owned by a wallet address across multiple ERC-721 events.
 * Uses Transfer event logs to discover contracts the wallet has interacted with,
 * then checks current balance for each unique contract found.
 * Called automatically by nftFetchWalletNFTs() when mode === 'wallet'.
 */
async function nftSearchByWallet(walletAddr) {
  const container = document.getElementById('nft-wallet-grid');
  const emptyEl   = document.getElementById('nft-wallet-empty');
  const loadEl    = document.getElementById('nft-wallet-loading');

  if (loadEl) loadEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';
  if (container) container.innerHTML = '';

  try {
    const provider = new ethers.providers.JsonRpcProvider(window.ARC_RPC_URL);

    // ── Discover NFT contracts the wallet has interacted with ─────────────────
    // ERC-721 Transfer topic: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
    const transferTopic = ethers.utils.id('Transfer(address,address,uint256)');
    const paddedAddr    = ethers.utils.hexZeroPad(walletAddr.toLowerCase(), 32);

    let contractsFound = new Set();

    // Logs where wallet is the RECEIVER (to = walletAddr)
    try {
      const logsIn = await provider.getLogs({
        fromBlock: 0,
        toBlock:   'latest',
        topics:    [transferTopic, null, paddedAddr]
      });
      logsIn.forEach(l => contractsFound.add(l.address.toLowerCase()));
    } catch { /* RPC may not support full range — continue */ }

    // Logs where wallet is the SENDER (from = walletAddr) — to catch any past ownership
    try {
      const logsOut = await provider.getLogs({
        fromBlock: 0,
        toBlock:   'latest',
        topics:    [transferTopic, paddedAddr]
      });
      logsOut.forEach(l => contractsFound.add(l.address.toLowerCase()));
    } catch {}

    if (loadEl) loadEl.style.display = 'none';

    if (contractsFound.size === 0) {
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = '<i class="fa-solid fa-box-open"></i><br>No NFT activity found for this wallet on Arc Testnet.';
      }
      return;
    }

    // ── For each discovered contract, check current balance ───────────────────
    let totalRendered = 0;

    for (const contractAddr of contractsFound) {
      try {
        const nft = new ethers.Contract(contractAddr, window.ERC721_ABI, provider);

        // Verify it responds to balanceOf (basic ERC-721 check)
        let bal;
        try { bal = await nft.balanceOf(walletAddr); } catch { continue; }
        const count = Math.min(Number(bal), 50);
        if (count === 0) continue;

        let tokenIds = [];

        // Try tokensOfOwner first (batch call)
        try {
          const tids = await nft.tokensOfOwner(walletAddr);
          tokenIds = tids.map(t => t.toString());
        } catch {
          // Fallback: tokenOfOwnerByIndex enumeration
          for (let i = 0; i < count; i++) {
            try {
              const tid = await nft.tokenOfOwnerByIndex(walletAddr, i);
              tokenIds.push(tid.toString());
            } catch {}
          }
        }

        // Render cards for this contract
        for (const tokenId of tokenIds) {
          const meta = await _fetchNFTMeta(contractAddr, tokenId, provider);
          const card = document.createElement('div');
          card.className = 'nft-card' + (
            _selectedNFT?.tokenId === tokenId && _selectedNFT?.address === contractAddr
              ? ' nft-card-selected' : ''
          );
          card.dataset.addr    = contractAddr;
          card.dataset.tokenId = tokenId;
          card.innerHTML = `
            <div class="nft-card-img">${_nftImgHtml(meta.image, meta.name, 120)}</div>
            <div class="nft-card-body">
              <div class="nft-card-name">${meta.name}</div>
              <div class="nft-card-coll">${meta.collection}</div>
              <div class="nft-card-id">Token #${tokenId}</div>
            </div>
            <div class="nft-card-select-overlay"><i class="fa-solid fa-circle-check"></i></div>
          `;
          card.addEventListener('click', () => nftSelectNFT(contractAddr, tokenId, meta));
          if (container) container.appendChild(card);
          totalRendered++;
        }

      } catch { /* skip unresponsive contracts silently */ }
    }

    if (totalRendered === 0 && emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = '<i class="fa-solid fa-box-open"></i><br>No NFTs currently held by this wallet on Arc Testnet.';
    }

  } catch(e) {
    if (loadEl) loadEl.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><br>Error: ${e.message}`;
    }
  }
}

async function nftFetchWalletNFTs() {
  const container = document.getElementById('nft-wallet-grid');
  const emptyEl   = document.getElementById('nft-wallet-empty');
  const loadEl    = document.getElementById('nft-wallet-loading');
  if (!container) return;

  // ── Input validation (shared for both modes) ─────────────────────────────
  const rawInput = document.getElementById('nft-contract-addr')?.value?.trim();

  if (!rawInput || !ethers.utils.isAddress(rawInput)) {
    if (loadEl) loadEl.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><br>Please enter a valid Ethereum address (0x…).';
    }
    return;
  }

  // ── Wallet mode: route to nftSearchByWallet ───────────────────────────────
  if (_searchMode === 'wallet') {
    return nftSearchByWallet(rawInput);
  }

  // ── Contract mode: original logic (unchanged) ─────────────────────────────
  if (!window.web3 || !window.web3.address) {
    if (loadEl) loadEl.style.display = 'none';
    if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.innerHTML = '<i class="fa-solid fa-wallet"></i><br>Connect your wallet to see your NFTs.'; }
    return;
  }

  if (loadEl)    loadEl.style.display   = 'flex';
  if (emptyEl)   emptyEl.style.display  = 'none';
  container.innerHTML = '';

  // In contract mode, rawInput is the ERC-721 contract; owner is the connected wallet
  const nftContractAddr = rawInput;
  const addr            = window.web3.address;

  try {
    const provider = new ethers.providers.JsonRpcProvider(window.ARC_RPC_URL);
    const nft = new ethers.Contract(nftContractAddr, window.ERC721_ABI, provider);

    let tokenIds = [];

    // Try tokensOfOwner first
    try {
      const tids = await nft.tokensOfOwner(addr);
      tokenIds = tids.map(t => t.toString());
    } catch {
      // Fallback: use balanceOf + tokenOfOwnerByIndex
      try {
        const bal = await nft.balanceOf(addr);
        const count = Math.min(Number(bal), 50); // cap at 50
        for (let i = 0; i < count; i++) {
          try {
            const tid = await nft.tokenOfOwnerByIndex(addr, i);
            tokenIds.push(tid.toString());
          } catch {}
        }
      } catch {}
    }

    if (loadEl) loadEl.style.display = 'none';

    if (tokenIds.length === 0) {
      if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.innerHTML = '<i class="fa-solid fa-box-open"></i><br>No NFTs found for this contract in your wallet.'; }
      return;
    }

    // Render cards
    for (const tokenId of tokenIds) {
      const meta = await _fetchNFTMeta(nftContractAddr, tokenId, provider);
      const card = document.createElement('div');
      card.className = 'nft-card' + (_selectedNFT?.tokenId === tokenId && _selectedNFT?.address === nftContractAddr ? ' nft-card-selected' : '');
      card.dataset.addr    = nftContractAddr;
      card.dataset.tokenId = tokenId;
      card.innerHTML = `
        <div class="nft-card-img">
          ${_nftImgHtml(meta.image, meta.name, 120)}
        </div>
        <div class="nft-card-body">
          <div class="nft-card-name">${meta.name}</div>
          <div class="nft-card-coll">${meta.collection}</div>
          <div class="nft-card-id">Token #${tokenId}</div>
        </div>
        <div class="nft-card-select-overlay"><i class="fa-solid fa-circle-check"></i></div>
      `;
      card.addEventListener('click', () => nftSelectNFT(nftContractAddr, tokenId, meta));
      container.appendChild(card);
    }

  } catch(e) {
    if (loadEl) loadEl.style.display = 'none';
    if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><br>Error: ${e.message}`; }
  }
}

// ── Select NFT ────────────────────────────────────────────────────────────────
function nftSelectNFT(address, tokenId, meta) {
  _selectedNFT = { address, tokenId, name: meta.name, collection: meta.collection, image: meta.image };

  // Update card highlight
  document.querySelectorAll('.nft-card').forEach(c => {
    const isThis = c.dataset.addr === address && c.dataset.tokenId === tokenId;
    c.classList.toggle('nft-card-selected', isThis);
  });

  // Show loan form
  const form = document.getElementById('nft-loan-form-panel');
  if (form) {
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Update selected NFT preview in form
  const preview = document.getElementById('nft-selected-preview');
  if (preview) {
    preview.innerHTML = `
      <div class="nft-selected-img">${_nftImgHtml(meta.image, meta.name, 64)}</div>
      <div>
        <div class="nft-selected-name">${meta.name}</div>
        <div class="nft-selected-addr">${_shortAddr(address)} · Token #${tokenId}</div>
      </div>
    `;
  }
  _nftUpdateLoanPreview();
}

// ── Live loan preview ─────────────────────────────────────────────────────────
function _nftUpdateLoanPreview() {
  const amt   = parseFloat(document.getElementById('nft-loan-amount')?.value || 0);
  const rate  = parseFloat(document.getElementById('nft-interest-rate')?.value || 0);
  const dur   = parseFloat(document.getElementById('nft-duration-days')?.value || 0);
  const prev  = document.getElementById('nft-loan-preview');
  if (!prev) return;
  if (!amt || !rate || !dur) { prev.style.display = 'none'; return; }
  const interest   = (amt * rate) / 100;
  const repayment  = amt + interest;
  prev.style.display = 'block';
  prev.innerHTML = `
    <div class="nft-preview-row"><span>Loan Amount</span><strong>${amt.toFixed(2)} USDC</strong></div>
    <div class="nft-preview-row"><span>Interest (${rate}%)</span><strong>+${interest.toFixed(2)} USDC</strong></div>
    <div class="nft-preview-row nft-preview-total"><span>Repayment Due</span><strong>${repayment.toFixed(2)} USDC</strong></div>
    <div class="nft-preview-row"><span>Duration</span><strong>${dur} day${dur !== 1 ? 's' : ''}</strong></div>
  `;
}

// ── Submit loan request ───────────────────────────────────────────────────────
async function nftSubmitLoanRequest() {
  if (!_selectedNFT) { _nftToast('Select an NFT first.', 'warning'); return; }

  // ── Reputation gate (frontend mirror of contract check) ──────────────────
  if (!window.web3 || !window.web3.address) {
    _nftToast('Connect your wallet first.', 'warning'); return;
  }
  const score = _reputationScore !== null
    ? _reputationScore
    : await _fetchReputation(window.web3.address);
  _reputationScore = score;

  if (score < 50) {
    _nftToast('Your reputation score is too low to request new loans.', 'error');
    _nftShowModal(`
      <div style="text-align:center;padding:16px 0;">
        <div style="font-size:48px;margin-bottom:12px;">🚫</div>
        <h3 style="margin:0 0 8px;font-size:18px;color:#ef4444;">Loan Blocked</h3>
        <p style="color:var(--text-secondary);font-size:14px;margin:0 0 16px;">
          Your reputation score is too low to request new loans.
        </p>
        <div class="rep-widget" style="margin:0 0 16px;">
          <div class="rep-bar-wrap">
            <div class="rep-bar-track">
              <div class="rep-bar-fill" style="width:${score}%;background:#ef4444;"></div>
            </div>
            <span class="rep-score-num" style="color:#ef4444;">${score}<span style="font-size:12px;color:var(--text-muted);">/100</span></span>
          </div>
          <div class="rep-blocked-msg"><i class="fa-solid fa-ban"></i> Minimum score required: 50</div>
        </div>
        <p style="color:var(--text-muted);font-size:12px;margin:0 0 16px;">
          Repay existing loans on time to increase your score (+3 per repayment).
        </p>
        <button class="btn btn-secondary btn-sm" onclick="window.closeModal&&window.closeModal()">Close</button>
      </div>
    `);
    return;
  }

  const amtRaw  = document.getElementById('nft-loan-amount')?.value?.trim();
  const rateRaw = document.getElementById('nft-interest-rate')?.value?.trim();
  const durRaw  = document.getElementById('nft-duration-days')?.value?.trim();

  if (!amtRaw || isNaN(amtRaw) || Number(amtRaw) <= 0)  { _nftToast('Enter a valid loan amount.', 'warning'); return; }
  if (!rateRaw || isNaN(rateRaw) || Number(rateRaw) < 0) { _nftToast('Enter a valid interest rate.', 'warning'); return; }
  if (!durRaw  || isNaN(durRaw)  || Number(durRaw) < 1)  { _nftToast('Duration must be at least 1 day.', 'warning'); return; }

  const loanAmt   = Math.round(Number(amtRaw) * 1e6);  // USDC 6 decimals
  const interestBps = Math.round(Number(rateRaw) * 100); // % → bps
  const duration   = Math.round(Number(durRaw));

  const repayment  = (Number(amtRaw) + (Number(amtRaw) * Number(rateRaw) / 100)).toFixed(2);

  // Confirmation modal
  _nftShowModal(`
    <div style="padding:8px 0;">
      <div class="nft-confirm-header">
        <div class="nft-confirm-nft">
          ${_nftImgHtml(_selectedNFT.image, _selectedNFT.name, 56)}
          <div>
            <div style="font-weight:700;font-size:15px;">${_selectedNFT.name}</div>
            <div style="color:var(--text-muted);font-size:12px;">${_shortAddr(_selectedNFT.address)} · #${_selectedNFT.tokenId}</div>
          </div>
        </div>
        <div class="nft-confirm-details">
          <div class="nft-preview-row"><span>Loan Amount</span><strong>${Number(amtRaw).toFixed(2)} USDC</strong></div>
          <div class="nft-preview-row"><span>Interest Rate</span><strong>${rateRaw}% (${interestBps} bps)</strong></div>
          <div class="nft-preview-row"><span>Duration</span><strong>${duration} days</strong></div>
          <div class="nft-preview-row nft-preview-total"><span>Repayment</span><strong>${repayment} USDC</strong></div>
        </div>
      </div>
      <div class="nft-confirm-warning">
        <i class="fa-solid fa-lock"></i>
        Your NFT will be locked in the smart contract escrow until the loan is repaid or defaulted.
      </div>
      <div style="display:flex;gap:12px;margin-top:16px;">
        <button class="btn btn-secondary" style="flex:1;" onclick="window.closeModal&&window.closeModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:1;" id="nft-confirm-lock-btn" onclick="nftExecuteLoanRequest(${loanAmt},${duration},${interestBps})">
          <i class="fa-solid fa-lock"></i> Lock NFT & Request Loan
        </button>
      </div>
    </div>
  `);
}

async function nftExecuteLoanRequest(loanAmt, duration, interestBps) {
  const btn = document.getElementById('nft-confirm-lock-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing…'; }

  try {
    const c = _requireNFTSigner();

    // Step 1: Approve NFT transfer
    _nftToast('Step 1/2: Approving NFT transfer to escrow…', 'info');
    const nftCon = new ethers.Contract(_selectedNFT.address, window.ERC721_ABI, window.web3.signer);
    const approveTx = await nftCon.approve(window.NFT_LOAN_ADDRESS, _selectedNFT.tokenId);
    await approveTx.wait();
    _nftToast('NFT approved ✓', 'success');

    // Step 2: Create loan request
    _nftToast('Step 2/2: Creating loan request and locking NFT…', 'info');
    const tx = await c.createLoanRequest(
      _selectedNFT.address,
      _selectedNFT.tokenId,
      loanAmt,
      duration,
      interestBps
    );
    const receipt = await tx.wait();

    // Parse loanId from LoanRequested event
    let loanId = '?';
    try {
      const iface = new ethers.utils.Interface(window.NFT_LOAN_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === 'LoanRequested') { loanId = parsed.args.loanId.toString(); break; }
        } catch {}
      }
    } catch {}

    if (window.closeModal) window.closeModal();
    _nftToast(`✅ NFT locked! Loan request #${loanId} created.`, 'success');

    // Show success modal
    if (window.showModal) {
      window.showModal({
        html: `
          <div style="text-align:center;padding:16px 0;">
            <div style="font-size:40px;margin-bottom:12px;">🔒</div>
            <h3 style="margin:0 0 8px;font-size:18px;">Loan Request Created!</h3>
            <p style="color:var(--text-secondary);font-size:14px;margin:0 0 16px;">
              Your NFT is now locked in escrow. Loan ID: <strong>#${loanId}</strong>
            </p>
            <div style="background:var(--bg-tertiary);border-radius:10px;padding:12px;margin-bottom:16px;text-align:left;">
              <div class="nft-preview-row"><span>Tx Hash</span><code style="font-size:11px;">${receipt.transactionHash.slice(0,20)}…</code></div>
              <div class="nft-preview-row"><span>Block</span><strong>${receipt.blockNumber}</strong></div>
            </div>
            <a href="${window.ARC_EXPLORER}/tx/${receipt.transactionHash}" target="_blank" class="btn btn-secondary btn-sm" style="margin-bottom:8px;display:inline-block;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> View on Explorer
            </a>
            <br>
            <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="window.closeModal&&window.closeModal();nftLoadMyLoans();">
              View My Loans
            </button>
          </div>
        `,
        size: 'sm'
      });
    }

    // Reset form
    _selectedNFT = null;
    document.querySelectorAll('.nft-card').forEach(c => c.classList.remove('nft-card-selected'));
    const fp = document.getElementById('nft-loan-form-panel');
    if (fp) fp.style.display = 'none';

    nftLoadMyLoans();
    // Refresh reputation score after successful repay
    _reputationScore = null;
    if (window.web3 && window.web3.address) _renderReputationWidget(window.web3.address);

  } catch(e) {
    if (window.closeModal) window.closeModal();
    _nftToast(`Error: ${e.reason || e.message}`, 'error');
    console.error('[NFTLoan] createLoanRequest error:', e);
  }
}

// ── Load my loans (borrower + lender) ────────────────────────────────────────
async function nftLoadMyLoans() {
  const container = document.getElementById('nft-my-loans-list');
  if (!container) return;

  if (!window.web3 || !window.web3.address) {
    container.innerHTML = '<div class="nft-loans-empty"><i class="fa-solid fa-wallet"></i><br>Connect wallet to see your loans.</div>';
    return;
  }

  container.innerHTML = '<div class="nft-loans-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading loans…</div>';

  try {
    const c    = _getReadOnlyNFT();
    const addr = window.web3.address;
    const prov = new ethers.providers.JsonRpcProvider(window.ARC_RPC_URL);

    // Get borrower AND lender loan IDs
    const [borrowerIds, lenderIds] = await Promise.all([
      c.getBorrowerLoans(addr).catch(() => []),
      c.getLenderLoans(addr).catch(() => [])
    ]);

    const allIds = [...new Set([...borrowerIds.map(i=>i.toString()), ...lenderIds.map(i=>i.toString())])];
    _myNftLoans = [];

    if (allIds.length === 0) {
      container.innerHTML = '<div class="nft-loans-empty"><i class="fa-solid fa-box-open"></i><br>No NFT loans found. Select an NFT above to get started.</div>';
      return;
    }

    // Fetch all loan details
    for (const id of allIds) {
      try {
        const loan = await c.getLoan(id);
        const meta = await _fetchNFTMeta(loan.nftAddress, loan.tokenId.toString(), prov);
        _myNftLoans.push({ ...loan, _meta: meta, _id: id, _role: borrowerIds.map(i=>i.toString()).includes(id) ? 'borrower' : 'lender' });
      } catch {}
    }

    if (_myNftLoans.length === 0) {
      container.innerHTML = '<div class="nft-loans-empty"><i class="fa-solid fa-box-open"></i><br>No loans found.</div>';
      return;
    }

    // Stop old countdowns
    Object.values(_countdownMap).forEach(clearInterval);
    _countdownMap = {};

    // Render
    container.innerHTML = _myNftLoans.map(loan => _renderLoanCard(loan)).join('');

    // Start countdown timers for FUNDED loans
    _myNftLoans.forEach(loan => {
      if (Number(loan.status) === 1 && Number(loan.dueDate) > 0) {
        const el = document.getElementById(`nft-timer-${loan._id}`);
        if (el) {
          _countdownMap[loan._id] = setInterval(() => {
            const t = _timeLeft(loan.dueDate);
            el.textContent = t.text;
            el.className   = 'nft-timer' + (t.overdue ? ' nft-timer-overdue' : '');
          }, 1000);
        }
      }
    });

  } catch(e) {
    container.innerHTML = `<div class="nft-loans-empty"><i class="fa-solid fa-triangle-exclamation"></i><br>Error loading loans: ${e.message}</div>`;
  }
}

function _renderLoanCard(loan) {
  const status     = Number(loan.status);
  const statusLbl  = _statusLabel(status);
  const statusCls  = _statusClass(status);
  const isBorrower = loan._role === 'borrower';
  const isFunded   = status === 1;
  const isRequested = status === 0;
  const t          = isFunded ? _timeLeft(loan.dueDate) : null;

  const actionBtns = (() => {
    if (isBorrower && isFunded) {
      return `<button class="btn btn-primary btn-sm" onclick="nftRepayLoan('${loan._id}')">
        <i class="fa-solid fa-rotate-left"></i> Repay Loan
      </button>`;
    }
    if (isBorrower && isRequested) {
      return `<button class="btn btn-danger btn-sm" onclick="nftCancelLoan('${loan._id}')">
        <i class="fa-solid fa-xmark"></i> Cancel Request
      </button>`;
    }
    if (!isBorrower && isFunded && t?.overdue) {
      return `<button class="btn btn-warning btn-sm" onclick="nftClaimDefault('${loan._id}')">
        <i class="fa-solid fa-gavel"></i> Claim Default
      </button>`;
    }
    return '';
  })();

  return `
    <div class="nft-loan-card" id="nft-loan-${loan._id}">
      <div class="nft-loan-card-header">
        <div class="nft-loan-nft-info">
          <div class="nft-loan-img">${_nftImgHtml(loan._meta?.image, loan._meta?.name, 56)}</div>
          <div>
            <div class="nft-loan-name">${loan._meta?.name || 'NFT #' + loan.tokenId}</div>
            <div class="nft-loan-addr">${_shortAddr(loan.nftAddress)} · #${loan.tokenId}</div>
          </div>
        </div>
        <div class="nft-loan-right">
          <span class="nft-loan-role-badge ${isBorrower ? 'nft-role-borrower' : 'nft-role-lender'}">${isBorrower ? 'Borrower' : 'Lender'}</span>
          <span class="nft-loan-status ${statusCls}">${statusLbl}</span>
        </div>
      </div>
      <div class="nft-loan-card-body">
        <div class="nft-loan-row"><span>Loan ID</span><strong>#${loan._id}</strong></div>
        <div class="nft-loan-row"><span>Loan Amount</span><strong>${_fmt6(loan.loanAmount)} USDC</strong></div>
        <div class="nft-loan-row"><span>Repayment</span><strong>${_fmt6(loan.repaymentAmount)} USDC</strong></div>
        <div class="nft-loan-row"><span>Duration</span><strong>${loan.durationDays} days</strong></div>
        ${isFunded ? `<div class="nft-loan-row"><span>Due Date</span><strong>${_fmtDate(loan.dueDate)}</strong></div>` : ''}
        ${isFunded ? `<div class="nft-loan-row"><span>Time Left</span><strong id="nft-timer-${loan._id}" class="nft-timer${t?.overdue?' nft-timer-overdue':''}">${t?.text||''}</strong></div>` : ''}
        ${loan.lender && loan.lender !== '0x0000000000000000000000000000000000000000' ? `<div class="nft-loan-row"><span>Lender</span><strong>${_shortAddr(loan.lender)}</strong></div>` : ''}
      </div>
      ${actionBtns ? `<div class="nft-loan-card-footer">${actionBtns}<button class="btn btn-ghost btn-sm" onclick="nftViewDetails('${loan._id}')"><i class="fa-solid fa-eye"></i> Details</button></div>` : `<div class="nft-loan-card-footer"><button class="btn btn-ghost btn-sm" onclick="nftViewDetails('${loan._id}')"><i class="fa-solid fa-eye"></i> View Details</button></div>`}
    </div>
  `;
}

// ── Repay loan ────────────────────────────────────────────────────────────────
async function nftRepayLoan(loanId) {
  const loan = _myNftLoans.find(l => l._id === loanId.toString());
  if (!loan) { _nftToast('Loan not found.', 'error'); return; }

  const repayAmt = _fmt6(loan.repaymentAmount);

  _nftShowModal(`
    <div style="padding:8px 0;">
      <h3 style="margin:0 0 12px;"><i class="fa-solid fa-rotate-left text-cyan"></i> Repay Loan #${loanId}</h3>
      <div class="nft-confirm-details">
        <div class="nft-preview-row"><span>NFT</span><strong>${loan._meta?.name || '#'+loan.tokenId}</strong></div>
        <div class="nft-preview-row"><span>Repayment Amount</span><strong>${repayAmt} USDC</strong></div>
        <div class="nft-preview-row nft-preview-total"><span>You will receive</span><strong>Your NFT back</strong></div>
      </div>
      <div class="nft-confirm-warning" style="background:rgba(16,185,129,0.07);border-color:rgba(16,185,129,0.25);">
        <i class="fa-solid fa-circle-check" style="color:var(--green);"></i>
        USDC will be transferred to the lender and your NFT will be returned immediately.
      </div>
      <div style="display:flex;gap:12px;margin-top:16px;">
        <button class="btn btn-secondary" style="flex:1;" onclick="window.closeModal&&window.closeModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:1;" id="nft-repay-btn-${loanId}" onclick="nftExecuteRepay('${loanId}','${loan.repaymentAmount}')">
          <i class="fa-solid fa-rotate-left"></i> Repay ${repayAmt} USDC
        </button>
      </div>
    </div>
  `);
}

async function nftExecuteRepay(loanId, repaymentAmount) {
  const btn = document.getElementById(`nft-repay-btn-${loanId}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing…'; }

  try {
    const c = _requireNFTSigner();

    // Step 1: Approve USDC
    _nftToast('Step 1/2: Approving USDC repayment…', 'info');
    const usdc = new ethers.Contract(window.USDC_ADDRESS, window.ERC20_ABI, window.web3.signer);
    const approveTx = await usdc.approve(window.NFT_LOAN_ADDRESS, repaymentAmount);
    await approveTx.wait();
    _nftToast('USDC approved ✓', 'success');

    // Step 2: Repay
    _nftToast('Step 2/2: Repaying loan and recovering NFT…', 'info');
    const tx = await c.repayLoan(loanId);
    const receipt = await tx.wait();

    if (window.closeModal) window.closeModal();
    _nftToast(`✅ Loan #${loanId} repaid! NFT returned to your wallet.`, 'success');

    if (window.showModal) {
      window.showModal({
        html: `
          <div style="text-align:center;padding:16px 0;">
            <div style="font-size:40px;margin-bottom:12px;">🎉</div>
            <h3 style="margin:0 0 8px;">Loan Repaid!</h3>
            <p style="color:var(--text-secondary);font-size:14px;">Your NFT has been returned to your wallet.</p>
            <div style="margin:12px 0;background:var(--bg-tertiary);border-radius:10px;padding:12px;text-align:left;">
              <div class="nft-preview-row"><span>Tx Hash</span><code style="font-size:11px;">${receipt.transactionHash.slice(0,20)}…</code></div>
              <div class="nft-preview-row"><span>Block</span><strong>${receipt.blockNumber}</strong></div>
            </div>
            <a href="${window.ARC_EXPLORER}/tx/${receipt.transactionHash}" target="_blank" class="btn btn-secondary btn-sm">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> View on Explorer
            </a>
          </div>
        `,
        size: 'sm'
      });
    }

    nftLoadMyLoans();
  } catch(e) {
    if (window.closeModal) window.closeModal();
    _nftToast(`Error: ${e.reason || e.message}`, 'error');
  }
}

// ── Cancel loan request ───────────────────────────────────────────────────────
async function nftCancelLoan(loanId) {
  if (!confirm(`Cancel loan request #${loanId}? Your NFT will be returned immediately.`)) return;
  try {
    const c = _requireNFTSigner();
    _nftToast('Cancelling loan request…', 'info');
    const tx = await c.cancelLoanRequest(loanId);
    await tx.wait();
    _nftToast(`✅ Loan #${loanId} cancelled. NFT returned.`, 'success');
    nftLoadMyLoans();
  } catch(e) {
    _nftToast(`Error: ${e.reason || e.message}`, 'error');
  }
}

// ── Claim default ─────────────────────────────────────────────────────────────
async function nftClaimDefault(loanId) {
  if (!confirm(`Claim defaulted NFT for loan #${loanId}? The NFT will be transferred to your wallet.`)) return;
  try {
    const c = _requireNFTSigner();
    _nftToast('Claiming defaulted NFT…', 'info');
    const tx = await c.claimDefault(loanId);
    await tx.wait();
    _nftToast(`✅ Defaulted NFT claimed for loan #${loanId}.`, 'success');
    nftLoadMyLoans();
  } catch(e) {
    _nftToast(`Error: ${e.reason || e.message}`, 'error');
  }
}

// ── View loan details ─────────────────────────────────────────────────────────
async function nftViewDetails(loanId) {
  const loan = _myNftLoans.find(l => l._id === loanId.toString());
  if (!loan) { _nftToast('Loan data not available. Refresh the list.', 'warning'); return; }

  const t = Number(loan.status) === 1 ? _timeLeft(loan.dueDate) : null;

  _nftShowModal(`
    <div>
      <h3 style="margin:0 0 16px;"><i class="fa-solid fa-circle-info text-cyan"></i> NFT Loan #${loan._id} Details</h3>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        ${_nftImgHtml(loan._meta?.image, loan._meta?.name, 72)}
        <div>
          <div style="font-weight:700;font-size:15px;">${loan._meta?.name}</div>
          <div style="color:var(--text-muted);font-size:12px;">${loan._meta?.collection}</div>
          <div style="color:var(--text-muted);font-size:12px;">${loan.nftAddress} · #${loan.tokenId}</div>
        </div>
      </div>
      <div class="nft-confirm-details" style="gap:8px;">
        <div class="nft-preview-row"><span>Status</span><strong class="${_statusClass(loan.status)}">${_statusLabel(loan.status)}</strong></div>
        <div class="nft-preview-row"><span>Borrower</span><code style="font-size:11px;">${loan.borrower}</code></div>
        ${loan.lender && loan.lender !== '0x0000000000000000000000000000000000000000' ? `<div class="nft-preview-row"><span>Lender</span><code style="font-size:11px;">${loan.lender}</code></div>` : ''}
        <div class="nft-preview-row"><span>Loan Amount</span><strong>${_fmt6(loan.loanAmount)} USDC</strong></div>
        <div class="nft-preview-row"><span>Repayment</span><strong>${_fmt6(loan.repaymentAmount)} USDC</strong></div>
        <div class="nft-preview-row"><span>Interest</span><strong>${(Number(loan.interestBps)/100).toFixed(2)}%</strong></div>
        <div class="nft-preview-row"><span>Duration</span><strong>${loan.durationDays} days</strong></div>
        ${loan.fundedAt && loan.fundedAt !== '0' ? `<div class="nft-preview-row"><span>Funded At</span><strong>${_fmtDate(loan.fundedAt)}</strong></div>` : ''}
        ${loan.dueDate  && loan.dueDate  !== '0' ? `<div class="nft-preview-row"><span>Due Date</span><strong>${_fmtDate(loan.dueDate)}</strong></div>` : ''}
        ${t ? `<div class="nft-preview-row"><span>Time Left</span><strong class="nft-timer${t.overdue?' nft-timer-overdue':''}">${t.text}</strong></div>` : ''}
        <div class="nft-preview-row"><span>NFT In Escrow</span><strong>${loan.nftInEscrow ? '🔒 Yes' : '✅ No'}</strong></div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn btn-secondary btn-sm" onclick="window.closeModal&&window.closeModal()">Close</button>
      </div>
    </div>
  `);
}

// ── Page init (called by showPage) ────────────────────────────────────────────
function nftLoansInit() {
  _initNFTContracts();
  nftLoadMyLoans();

  // Load reputation widget if wallet already connected
  if (window.web3 && window.web3.address) {
    _renderReputationWidget(window.web3.address);
  }

  // Re-init signer if wallet connects after page load
  if (window.web3) {
    window.web3.on('connected', () => {
      _nftContract = new ethers.Contract(window.NFT_LOAN_ADDRESS, window.NFT_LOAN_ABI, window.web3.signer);
      _reputationScore = null; // reset cache
      nftLoadMyLoans();
      if (window.web3.address) _renderReputationWidget(window.web3.address);
    });
  }
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.nftLoansInit          = nftLoansInit;
window.nftFetchWalletNFTs    = nftFetchWalletNFTs;
window.nftSetSearchMode      = nftSetSearchMode;
window.nftSearchByWallet     = nftSearchByWallet;
window.nftSelectNFT          = nftSelectNFT;
window.nftSubmitLoanRequest  = nftSubmitLoanRequest;
window.nftExecuteLoanRequest = nftExecuteLoanRequest;
window.nftRepayLoan          = nftRepayLoan;
window.nftExecuteRepay       = nftExecuteRepay;
window.nftCancelLoan         = nftCancelLoan;
window.nftClaimDefault       = nftClaimDefault;
window.nftViewDetails        = nftViewDetails;
window.nftLoadMyLoans        = nftLoadMyLoans;
window._nftUpdateLoanPreview   = _nftUpdateLoanPreview;
window._renderReputationWidget = _renderReputationWidget;
