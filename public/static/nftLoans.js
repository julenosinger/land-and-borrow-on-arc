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
function _nftShowModal(html, title) {
  if (!window.showModal) { alert('Modal unavailable'); return; }
  // showModal() in app.js expects { title, content, size }
  window.showModal({ title: title || '', content: html, size: 'modal-md' });
}

// ── DaatFI NFT Mint ───────────────────────────────────────────────────────────
// Mints a real DaatFINFT token on Arc Testnet to the connected wallet.
// After minting, auto-fills the contract address and reloads the NFT grid.
async function nftMintDaatFI() {
  if (!window.web3 || !window.web3.address) {
    _nftToast('Connect your wallet first.', 'warning'); return;
  }
  if (!window.DAATFI_NFT_ADDRESS || !window.DAATFI_NFT_ABI) {
    _nftToast('NFT contract not loaded.', 'error'); return;
  }

  const btn = document.getElementById('nft-mint-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Minting…'; }

  try {
    const nftContract = new ethers.Contract(window.DAATFI_NFT_ADDRESS, window.DAATFI_NFT_ABI, window.web3.signer);
    _nftToast('Sending mint transaction…', 'info');

    const tx = await nftContract.mint();
    _nftToast('Transaction sent! Waiting for confirmation…', 'info');
    const receipt = await tx.wait();

    // Extract tokenId from Minted event
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        const iface = new ethers.utils.Interface(window.DAATFI_NFT_ABI);
        const parsed = iface.parseLog(log);
        if (parsed.name === 'Minted') {
          tokenId = parsed.args.tokenId.toString();
          break;
        }
      } catch {}
    }

    _nftToast(`✅ NFT minted successfully! Token #${tokenId ?? '?'}`, 'success');

    // Auto-fill the contract address input and trigger search
    const input = document.getElementById('nft-contract-addr');
    if (input) input.value = window.DAATFI_NFT_ADDRESS;

    // Switch to contract mode and fetch
    _searchMode = 'contract';
    const btnC = document.getElementById('nft-stoggle-contract');
    const btnW = document.getElementById('nft-stoggle-wallet');
    if (btnC) btnC.classList.add('active');
    if (btnW) btnW.classList.remove('active');
    const walletRow = document.getElementById('nft-wallet-addr-row');
    if (walletRow) walletRow.style.display = 'none';

    await nftFetchWalletNFTs();

  } catch(e) {
    _nftToast(`Mint failed: ${e.reason || e.message}`, 'error');
    console.error('[NFTMint]', e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-hammer"></i> Mint NFT'; }
  }
}

// ── Initialize contracts ──────────────────────────────────────────────────────
function _initNFTContracts() {
  try {
    // Use the already-connected Web3Provider when available; fall back to JsonRpc for read-only
    const prov = (window.web3 && window.web3.provider)
      ? window.web3.provider
      : new ethers.providers.JsonRpcProvider(window.ARC_RPC_URL);
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
// Parses a data: URI (base64 or URL-encoded) without using fetch(),
// since browsers/Workers may not support fetch() for data: URIs.
function _parseDataUri(uri) {
  try {
    // data:[mediatype][;base64],<data>
    const comma = uri.indexOf(',');
    if (comma === -1) return null;
    const header = uri.slice(0, comma);    // e.g. "data:application/json;base64"
    const body   = uri.slice(comma + 1);  // everything after the comma
    const isBase64 = header.includes(';base64');
    const text = isBase64 ? atob(body) : decodeURIComponent(body);
    return JSON.parse(text);
  } catch { return null; }
}

async function _fetchNFTMeta(nftAddr, tokenId, provider) {
  const key = `${nftAddr}:${tokenId}`;
  if (_nftCache[key]) return _nftCache[key];
  try {
    // Always use JsonRpcProvider for read-only metadata calls — avoids Web3Provider stalls.
    let prov = new ethers.providers.JsonRpcProvider(window.ARC_RPC_URL);
    const nft = new ethers.Contract(nftAddr, window.ERC721_ABI, prov);
    let collectionName = 'Unknown Collection';
    let tokenName      = `Token #${tokenId}`;
    let image          = null;

    try { collectionName = await nft.name(); } catch {}
    tokenName = `${collectionName} #${tokenId}`;

    // try tokenURI → resolve JSON
    try {
      let uri = await nft.tokenURI(tokenId);

      let meta = null;

      if (uri.startsWith('data:')) {
        // On-chain data URI — parse directly without fetch()
        meta = _parseDataUri(uri);
      } else {
        // Remote URI (ipfs:// or https://)
        if (uri.startsWith('ipfs://')) uri = 'https://gateway.pinata.cloud/ipfs/' + uri.slice(7);
        const resp = await Promise.race([
          fetch(uri),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))
        ]);
        meta = await resp.json();
      }

      if (meta) {
        if (meta.name)  tokenName = decodeURIComponent(meta.name);
        if (meta.image) {
          let img = meta.image;
          if (img.startsWith('ipfs://')) img = 'https://gateway.pinata.cloud/ipfs/' + img.slice(7);
          // Keep data: URIs (svg, png, etc.) as-is — browsers render them fine
          image = img;
        }
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

// ── Search mode toggle (kept for backward compat — no-op stubs) ──────────────
// The UI now has a single contract-address field; wallet is always the connected wallet.
function nftSetSearchMode() {} // no-op — toggle removed from UI

async function nftFetchWalletNFTs() {
  const container = document.getElementById('nft-wallet-grid');
  const emptyEl   = document.getElementById('nft-wallet-empty');
  const loadEl    = document.getElementById('nft-wallet-loading');
  if (!container) return;

  // ── Wallet check ──────────────────────────────────────────────────────────
  if (!window.web3 || !window.web3.address) {
    if (loadEl) loadEl.style.display = 'none';
    if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.innerHTML = '<i class="fa-solid fa-wallet"></i><br>Connect your wallet to see your NFTs.'; }
    return;
  }

  // ── Input validation — auto-fill DaatFI NFT if field is empty ────────────
  const inputEl  = document.getElementById('nft-contract-addr');
  let   rawInput = inputEl?.value?.trim();
  if (!rawInput && window.DAATFI_NFT_ADDRESS) {
    rawInput = window.DAATFI_NFT_ADDRESS;
    if (inputEl) inputEl.value = rawInput;
  }
  if (!rawInput || !ethers.utils.isAddress(rawInput)) {
    if (loadEl) loadEl.style.display = 'none';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><br>Please enter a valid ERC-721 contract address (0x…).';
    }
    return;
  }

  if (loadEl)  { loadEl.style.display = 'flex'; loadEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning wallet…'; }
  if (emptyEl) emptyEl.style.display = 'none';
  container.innerHTML = '';

  const nftContractAddr = rawInput;
  const addr            = window.web3.address;

  try {
    // Always use JsonRpcProvider for read-only NFT calls — reliable on Arc Testnet.
    // Web3Provider can stall on network detection in some wallet states.
    const provider = new ethers.providers.JsonRpcProvider(window.ARC_RPC_URL);
    const nft = new ethers.Contract(nftContractAddr, window.ERC721_ABI, provider);

    let bal;
    try {
      bal = await nft.balanceOf(addr);
    } catch(e) {
      console.error('[NFT balanceOf error]', e);
      throw new Error('Contract does not respond to balanceOf. Make sure it is a valid ERC-721 on Arc Testnet.');
    }

    const count = Math.min(Number(bal), 50);

    if (loadEl) loadEl.style.display = 'none';

    if (count === 0) {
      if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.innerHTML = '<i class="fa-solid fa-box-open"></i><br>Your wallet holds no NFTs in this contract.<br><small style="color:var(--text-muted);">Use the <strong>Mint NFT</strong> button above to get a DaatFI NFT on Arc Testnet.</small>'; }
      return;
    }

    let tokenIds = [];
    try {
      const tids = await nft.tokensOfOwner(addr);
      tokenIds = tids.map(t => t.toString());
    } catch {
      for (let i = 0; i < count; i++) {
        try { tokenIds.push((await nft.tokenOfOwnerByIndex(addr, i)).toString()); } catch {}
      }
    }

    if (tokenIds.length === 0) {
      if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.innerHTML = '<i class="fa-solid fa-box-open"></i><br>Your wallet holds no NFTs in this contract.'; }
      return;
    }

    for (const tokenId of tokenIds) {
      const meta = await _fetchNFTMeta(nftContractAddr, tokenId, provider);
      const card = document.createElement('div');
      card.className = 'nft-card' + (_selectedNFT?.tokenId === tokenId && _selectedNFT?.address === nftContractAddr ? ' nft-card-selected' : '');
      card.dataset.addr    = nftContractAddr;
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

  if (!window.web3 || !window.web3.address) {
    _nftToast('Connect your wallet first.', 'warning'); return;
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

  // Confirmation modal — use title + content format expected by showModal()
  _nftShowModal(`
    <div style="padding:4px 0;">
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
          <i class="fa-solid fa-lock"></i> Lock NFT &amp; Request Loan
        </button>
      </div>
    </div>
  `, 'Confirm Loan Request');
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
        title: '🔒 Loan Request Created!',
        content: `
          <div style="text-align:center;padding:8px 0;">
            <p style="color:var(--text-secondary);font-size:14px;margin:0 0 16px;">
              Your NFT is now locked in escrow. Loan ID: <strong>#${loanId}</strong>
            </p>
            <div style="background:var(--bg-tertiary);border-radius:10px;padding:12px;margin-bottom:16px;text-align:left;">
              <div class="nft-preview-row"><span>Tx Hash</span><code style="font-size:11px;">${receipt.transactionHash.slice(0,20)}…</code></div>
              <div class="nft-preview-row"><span>Block</span><strong>${receipt.blockNumber}</strong></div>
            </div>
            <a href="${window.ARC_EXPLORER || 'https://testnet.arcscan.app'}/tx/${receipt.transactionHash}" target="_blank" class="btn btn-secondary btn-sm" style="margin-bottom:8px;display:inline-block;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> View on Explorer
            </a>
            <br>
            <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="window.closeModal&&window.closeModal();nftLoadMyLoans();">
              View My Loans
            </button>
          </div>
        `,
        size: 'modal-sm'
      });
    }

    // Reset form
    _selectedNFT = null;
    document.querySelectorAll('.nft-card').forEach(c => c.classList.remove('nft-card-selected'));
    const fp = document.getElementById('nft-loan-form-panel');
    if (fp) fp.style.display = 'none';

    nftLoadMyLoans();
    nftLoadEscrowVault();

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
    nftLoadEscrowVault();

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
    nftLoadEscrowVault();
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
    nftLoadEscrowVault();
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

// ── Escrow Vault — shows NFTs currently locked as collateral ──────────────────
async function nftLoadEscrowVault() {
  const container = document.getElementById('nft-escrow-vault-list');
  if (!container) return;

  if (!window.web3 || !window.web3.address) {
    container.innerHTML = '<div class="nft-loans-empty"><i class="fa-solid fa-vault"></i><br>Connect wallet to view escrow vault.</div>';
    return;
  }

  container.innerHTML = '<div class="nft-loans-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading escrow vault…</div>';

  try {
    const prov = new ethers.providers.JsonRpcProvider(window.ARC_RPC_URL);
    const c    = _getReadOnlyNFT();
    const addr = window.web3.address;

    // Get loans where this user is borrower OR lender
    const [borrowerIds, lenderIds] = await Promise.all([
      c.getBorrowerLoans(addr).catch(() => []),
      c.getLenderLoans(addr).catch(() => [])
    ]);

    const allIds = [...new Set([
      ...borrowerIds.map(i => i.toString()),
      ...lenderIds.map(i => i.toString())
    ])];

    if (allIds.length === 0) {
      container.innerHTML = '<div class="nft-loans-empty"><i class="fa-solid fa-vault"></i><br>No NFTs in escrow. Lock an NFT as collateral to get started.</div>';
      return;
    }

    // Filter only loans where NFT is currently locked (status 0 = Requested, 1 = Funded)
    const escrowLoans = [];
    for (const id of allIds) {
      try {
        const loan = await c.getLoan(id);
        const status = Number(loan.status);
        // Status 0 (Requested) or 1 (Funded) = NFT is locked in escrow
        if (status === 0 || status === 1) {
          const meta = await _fetchNFTMeta(loan.nftAddress, loan.tokenId.toString(), prov);
          const isBorrower = borrowerIds.map(i => i.toString()).includes(id);
          escrowLoans.push({ ...loan, _meta: meta, _id: id, _role: isBorrower ? 'borrower' : 'lender', _status: status });
        }
      } catch {}
    }

    if (escrowLoans.length === 0) {
      container.innerHTML = '<div class="nft-loans-empty"><i class="fa-solid fa-vault"></i><br>No NFTs currently locked in escrow.</div>';
      return;
    }

    container.innerHTML = escrowLoans.map(loan => `
      <div class="nft-escrow-card">
        <div class="nft-escrow-card-img">${_nftImgHtml(loan._meta?.image, loan._meta?.name, 48)}</div>
        <div class="nft-escrow-card-info">
          <div class="nft-escrow-card-name">${loan._meta?.name || 'NFT #' + loan.tokenId}</div>
          <div class="nft-escrow-card-sub">${_shortAddr(loan.nftAddress)} · Token #${loan.tokenId}</div>
          <div class="nft-escrow-loan-id">Loan #${loan._id} · ${loan._status === 0 ? 'Awaiting Lender' : 'Active'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
          <span class="nft-escrow-lock-badge"><i class="fa-solid fa-lock"></i> Locked</span>
          <span style="font-size:11px;color:var(--text-muted);">${loan._role === 'borrower' ? 'You borrowed' : 'You lent'}</span>
        </div>
      </div>
    `).join('');

  } catch(e) {
    container.innerHTML = `<div class="nft-loans-empty"><i class="fa-solid fa-triangle-exclamation"></i><br>Error: ${e.message}</div>`;
  }
}

// ── Page init (called by showPage) ────────────────────────────────────────────
function nftLoansInit() {
  _initNFTContracts();
  nftLoadMyLoans();
  nftLoadEscrowVault();

  // Pre-fill the DaatFI NFT contract address automatically
  const inputEl = document.getElementById('nft-contract-addr');
  if (inputEl && !inputEl.value && window.DAATFI_NFT_ADDRESS) {
    inputEl.value = window.DAATFI_NFT_ADDRESS;
  }

  // If wallet already connected on init, auto-search
  if (window.web3 && window.web3.address) {
    nftFetchWalletNFTs();
  }

  // Re-init signer and auto-search when wallet connects after page load
  if (window.web3) {
    window.web3.on('connected', () => {
      _nftContract = new ethers.Contract(window.NFT_LOAN_ADDRESS, window.NFT_LOAN_ABI, window.web3.signer);
      nftLoadMyLoans();
      nftLoadEscrowVault();
      // Auto-fill and search when wallet connects
      const inp = document.getElementById('nft-contract-addr');
      if (inp && !inp.value && window.DAATFI_NFT_ADDRESS) inp.value = window.DAATFI_NFT_ADDRESS;
      nftFetchWalletNFTs();
    });
  }
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.nftLoansInit          = nftLoansInit;
window.nftMintDaatFI         = nftMintDaatFI;
window.nftFetchWalletNFTs    = nftFetchWalletNFTs;
window.nftSetSearchMode      = nftSetSearchMode;
window.nftSelectNFT          = nftSelectNFT;
window.nftSubmitLoanRequest  = nftSubmitLoanRequest;
window.nftExecuteLoanRequest = nftExecuteLoanRequest;
window.nftRepayLoan          = nftRepayLoan;
window.nftExecuteRepay       = nftExecuteRepay;
window.nftCancelLoan         = nftCancelLoan;
window.nftClaimDefault       = nftClaimDefault;
window.nftViewDetails        = nftViewDetails;
window.nftLoadMyLoans        = nftLoadMyLoans;
window.nftLoadEscrowVault    = nftLoadEscrowVault;
window._nftUpdateLoanPreview   = _nftUpdateLoanPreview;
