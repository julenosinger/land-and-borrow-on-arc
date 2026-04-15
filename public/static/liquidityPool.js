// ════════════════════════════════════════════════════════════
// DaatFI — Liquidity Pool Frontend
// Arc Testnet (chainId 5042002)
// Interacts with DaatFILiquidityPool contract
// Uses raw fetch (eth_call) to avoid provider issues — same
// pattern that fixed NFT balance fetching.
// ════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const ARC_RPC    = window.ARC_RPC_URL   || 'https://rpc.testnet.arc.network';
  const EXPLORER   = window.ARC_EXPLORER  || 'https://testnet.arcscan.app';
  const USDC_ADDR  = window.USDC_ADDRESS  || '0x3600000000000000000000000000000000000000';

  // Will be set by contractABI.js once pool is deployed
  // For now we read from window.LIQUIDITY_POOL_ADDRESS
  let POOL_ADDR = null;

  // ── State ──────────────────────────────────────────────────
  let _poolTotalLiquidity = 0n;  // BigInt, 6 decimals
  let _poolUserBalance    = 0n;
  let _poolUserShares     = 0n;
  let _poolTotalShares    = 0n;

  // ── Helpers ────────────────────────────────────────────────
  function _fmt6(bigint) {
    const n = Number(bigint) / 1e6;
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  function _parseBigInt(hexStr) {
    if (!hexStr || hexStr === '0x') return 0n;
    return BigInt(hexStr);
  }

  function _showToast(msg, type = 'info') {
    // Reuse existing toast if available
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
      return;
    }
    if (typeof window._nftToast === 'function') {
      window._nftToast(msg, type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info');
      return;
    }
    console.log(`[Pool ${type}]`, msg);
  }

  // ── Raw RPC call (same pattern as NFT fix) ─────────────────
  async function _rpcCall(to, data) {
    const resp = await fetch(ARC_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to, data }, 'latest']
      })
    });
    const json = await resp.json();
    if (json.error) throw new Error(json.error.message || 'RPC error');
    return json.result;
  }

  // Encode address param (left-padded to 32 bytes)
  function _encodeAddr(addr) {
    return addr.toLowerCase().replace('0x', '').padStart(64, '0');
  }

  // Encode uint256 param
  function _encodeUint256(n) {
    return BigInt(n).toString(16).padStart(64, '0');
  }

  // ── Contract read helpers ──────────────────────────────────
  // Selectors verified with ethers.id(sig).slice(0,10):
  //   getTotalLiquidity()      = 0x35c7e925
  //   getUserBalance(address)  = 0x47734892
  //   getUserShares(address)   = 0xba0cb22b
  //   totalShares()            = 0x3a98ef39
  //   getEstimatedAPYBps()     = 0x7736400e
  //   deposit(uint256)         = 0xb6b55f25
  //   withdraw(uint256)        = 0x2e1a7d4d

  async function _getTotalLiquidity() {
    const result = await _rpcCall(POOL_ADDR, '0x35c7e925');
    return _parseBigInt(result);
  }

  async function _getUserBalance(addr) {
    const result = await _rpcCall(POOL_ADDR, '0x47734892' + _encodeAddr(addr));
    return _parseBigInt(result);
  }

  async function _getUserShares(addr) {
    const result = await _rpcCall(POOL_ADDR, '0xba0cb22b' + _encodeAddr(addr));
    return _parseBigInt(result);
  }

  async function _getTotalShares() {
    const result = await _rpcCall(POOL_ADDR, '0x3a98ef39');
    return _parseBigInt(result);
  }

  async function _getAPYBps() {
    const result = await _rpcCall(POOL_ADDR, '0x7736400e');
    return _parseBigInt(result);
  }

  // ── Load Pool Stats ────────────────────────────────────────
  async function poolLoadStats() {
    _getPoolAddr();
    if (!POOL_ADDR) {
      _setPlaceholders();
      return;
    }

    try {
      _poolTotalLiquidity = await _getTotalLiquidity();
      document.getElementById('pool-total-liquidity').textContent = _fmt6(_poolTotalLiquidity) + ' USDC';
    } catch (e) {
      document.getElementById('pool-total-liquidity').textContent = 'Erro';
      console.error('[Pool stats error]', e);
    }

    const addr = window.web3 && window.web3.address;
    if (!addr) {
      document.getElementById('pool-user-balance').textContent = '—';
      document.getElementById('pool-user-shares').textContent = '—';
      document.getElementById('pool-max-shares-label').textContent = '0';
      return;
    }

    try {
      _poolUserBalance = await _getUserBalance(addr);
      _poolUserShares  = await _getUserShares(addr);
      _poolTotalShares = await _getTotalShares();

      document.getElementById('pool-user-balance').textContent = _fmt6(_poolUserBalance) + ' USDC';

      // Show shares as raw number / 1e6 for display
      const sharesDisplay = _poolTotalShares > 0n
        ? ((Number(_poolUserShares) / Number(_poolTotalShares)) * 100).toFixed(4) + '% (' + _fmt6(_poolUserShares) + ')'
        : '0';
      document.getElementById('pool-user-shares').textContent = sharesDisplay;
      document.getElementById('pool-max-shares-label').textContent = _fmt6(_poolUserShares);
    } catch (e) {
      console.error('[Pool user stats error]', e);
    }

    // APY
    try {
      const apyBps = await _getAPYBps();
      const apyPct = Number(apyBps) / 100;
      document.getElementById('pool-apy').textContent = apyPct.toFixed(2) + '%';
    } catch {}
  }

  function _setPlaceholders() {
    ['pool-total-liquidity','pool-user-balance','pool-user-shares','pool-apy'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = 'Pool not deployed';
    });
  }

  function _getPoolAddr() {
    if (!POOL_ADDR) POOL_ADDR = window.LIQUIDITY_POOL_ADDRESS || null;
  }

  // ── Preview helpers ────────────────────────────────────────
  window.poolUpdateDepositPreview = function() {
    const amt = parseFloat(document.getElementById('pool-deposit-amount').value);
    const preview = document.getElementById('pool-deposit-preview');
    if (!amt || amt <= 0) { preview.style.display = 'none'; return; }

    preview.style.display = 'block';
    const amtRaw = BigInt(Math.round(amt * 1e6));
    let sharesEst;
    if (_poolTotalShares === 0n || _poolTotalLiquidity === 0n) {
      sharesEst = amtRaw;
    } else {
      sharesEst = (amtRaw * _poolTotalShares) / _poolTotalLiquidity;
    }
    document.getElementById('pool-deposit-shares-est').textContent = _fmt6(sharesEst);
    document.getElementById('pool-deposit-new-total').textContent  = _fmt6(_poolTotalLiquidity + amtRaw);
  };

  window.poolUpdateWithdrawPreview = function() {
    const sharesInput = parseFloat(document.getElementById('pool-withdraw-shares').value);
    const preview = document.getElementById('pool-withdraw-preview');
    if (!sharesInput || sharesInput <= 0) { preview.style.display = 'none'; return; }

    preview.style.display = 'block';
    const sharesRaw = BigInt(Math.round(sharesInput * 1e6));
    let usdcEst = 0n;
    if (_poolTotalShares > 0n) {
      usdcEst = (sharesRaw * _poolTotalLiquidity) / _poolTotalShares;
    }
    const left = _poolUserShares > sharesRaw ? _poolUserShares - sharesRaw : 0n;
    document.getElementById('pool-withdraw-usdc-est').textContent  = _fmt6(usdcEst) + ' USDC';
    document.getElementById('pool-withdraw-shares-left').textContent = _fmt6(left);
  };

  window.poolSetMaxShares = function() {
    const input = document.getElementById('pool-withdraw-shares');
    if (_poolUserShares > 0n) {
      input.value = (Number(_poolUserShares) / 1e6).toFixed(6);
      window.poolUpdateWithdrawPreview();
    }
  };

  // ── Deposit ────────────────────────────────────────────────
  window.poolDeposit = async function() {
    _getPoolAddr();
    if (!POOL_ADDR) { _showToast('Pool not yet deployed on testnet.', 'error'); return; }
    if (!window.web3 || !window.web3.address) { _showToast('Please connect your wallet first.', 'error'); return; }

    const amt = parseFloat(document.getElementById('pool-deposit-amount').value);
    if (!amt || amt <= 0) { _showToast('Please enter a valid amount.', 'error'); return; }

    const amtRaw = BigInt(Math.round(amt * 1e6));
    const btn = document.querySelector('.btn-deposit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aguardando...';

    try {
      const provider = new ethers.providers.StaticJsonRpcProvider(ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
      const signer   = new ethers.providers.Web3Provider(window.ethereum).getSigner();

      // 1) Approve USDC
      _showToast('Approving USDC...', 'info');
      const usdcABI = ['function approve(address spender, uint256 amount) returns (bool)',
                       'function allowance(address owner, address spender) view returns (uint256)'];
      const usdcContract = new ethers.Contract(USDC_ADDR, usdcABI, signer);
      const approveTx = await usdcContract.approve(POOL_ADDR, amtRaw.toString());
      await approveTx.wait();
      _showToast('USDC approved. Depositing...', 'info');

      // 2) Deposit
      const poolABI = ['function deposit(uint256 amount)'];
      const pool = new ethers.Contract(POOL_ADDR, poolABI, signer);
      const depositTx = await pool.deposit(amtRaw.toString());
      const receipt = await depositTx.wait();

      _showToast(`✅ Deposit of ${_fmt6(amtRaw)} USDC successful! Tx: ${receipt.transactionHash.slice(0,10)}...`, 'success');
      document.getElementById('pool-deposit-amount').value = '';
      document.getElementById('pool-deposit-preview').style.display = 'none';
      await poolLoadStats();
    } catch (e) {
      console.error('[Pool deposit error]', e);
      _showToast('Deposit error: ' + (e.reason || e.message || String(e)), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-lock"></i> Aprovar & Depositar';
    }
  };

  // ── Withdraw ───────────────────────────────────────────────
  window.poolWithdraw = async function() {
    _getPoolAddr();
    if (!POOL_ADDR) { _showToast('Pool not yet deployed on testnet.', 'error'); return; }
    if (!window.web3 || !window.web3.address) { _showToast('Please connect your wallet first.', 'error'); return; }

    const sharesInput = parseFloat(document.getElementById('pool-withdraw-shares').value);
    if (!sharesInput || sharesInput <= 0) { _showToast('Please enter the share amount.', 'error'); return; }

    const sharesRaw = BigInt(Math.round(sharesInput * 1e6));
    if (sharesRaw > _poolUserShares) { _showToast('Insufficient shares.', 'error'); return; }

    const btn = document.querySelector('.btn-withdraw');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sacando...';

    try {
      const signer = new ethers.providers.Web3Provider(window.ethereum).getSigner();
      const poolABI = ['function withdraw(uint256 shareAmount)'];
      const pool = new ethers.Contract(POOL_ADDR, poolABI, signer);
      const tx = await pool.withdraw(sharesRaw.toString());
      const receipt = await tx.wait();

      _showToast(`✅ Withdrawal successful! Tx: ${receipt.transactionHash.slice(0,10)}...`, 'success');
      document.getElementById('pool-withdraw-shares').value = '';
      document.getElementById('pool-withdraw-preview').style.display = 'none';
      await poolLoadStats();
    } catch (e) {
      console.error('[Pool withdraw error]', e);
      _showToast('Withdrawal error: ' + (e.reason || e.message || String(e)), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-unlock"></i> Sacar USDC';
    }
  };

  // ── Simulate Pool Funding (Testnet helper) ─────────────────
  window.poolSimulateFunding = async function() {
    _getPoolAddr();
    if (!POOL_ADDR) { _showToast('Pool not yet deployed. Deploy required first.', 'error'); return; }
    if (!window.web3 || !window.web3.address) { _showToast('Please connect your wallet first.', 'error'); return; }

    _showToast('Simulating 100 USDC pool deposit...', 'info');

    // This is just a regular deposit of 100 USDC labelled as "simulation"
    document.getElementById('pool-deposit-amount').value = '100';
    window.poolUpdateDepositPreview();
    _showToast('Amount pre-filled as 100 USDC. Click "Approve & Deposit" to confirm.', 'info');
  };

  // ── Load Active Pool Loans ─────────────────────────────────
  window.poolLoadActiveLoans = async function() {
    _getPoolAddr();
    const container = document.getElementById('pool-loans-list');
    if (!container) return;

    if (!POOL_ADDR) {
      container.innerHTML = '<div class="pool-empty-state"><i class="fa-solid fa-triangle-exclamation"></i><br>Pool not deployed yet. Deploy required.</div>';
      return;
    }
    if (!window.web3 || !window.web3.address) {
      container.innerHTML = '<div class="pool-empty-state"><i class="fa-solid fa-droplet-slash"></i><br>Connect your wallet to view pool-funded loans.</div>';
      return;
    }

    container.innerHTML = '<div class="pool-empty-state"><i class="fa-solid fa-spinner fa-spin"></i><br>Loading...</div>';

    try {
      // We look at up to 50 loan IDs from the main loan contracts
      // and check if they were funded by this pool.
      // For now display a note that events-based indexing is needed for production.
      container.innerHTML = `
        <div class="pool-empty-state" style="font-size:0.82rem; line-height:1.8;">
          <i class="fa-solid fa-circle-info" style="color:#00c8ff;"></i><br>
          Pool-funded loan history available after testnet deploy.<br>
          <small style="color:#666;">Events <code>LoanFunded</code>, <code>LoanRepaid</code> and <code>LoanDefaulted</code> are emitted by the contract.</small>
        </div>`;
    } catch (e) {
      container.innerHTML = '<div class="pool-empty-state">Error loading: ' + (e.message || e) + '</div>';
    }
  };

  // ── Init ───────────────────────────────────────────────────
  window.poolInit = async function() {
    _getPoolAddr();
    await poolLoadStats();
    await poolLoadActiveLoans();
  };

  // Auto-reload stats when wallet connects
  document.addEventListener('walletConnected', async () => {
    if (document.getElementById('page-liquidity-pool')?.classList.contains('active')) {
      await poolLoadStats();
      await poolLoadActiveLoans();
    }
  });

  // Expose global functions
  window.poolDeposit            = window.poolDeposit;
  window.poolWithdraw           = window.poolWithdraw;
  window.poolLoadStats          = poolLoadStats;
  window.poolLoadActiveLoans    = window.poolLoadActiveLoans;
  window.poolSimulateFunding    = window.poolSimulateFunding;
  window.poolUpdateDepositPreview  = window.poolUpdateDepositPreview;
  window.poolUpdateWithdrawPreview = window.poolUpdateWithdrawPreview;
  window.poolSetMaxShares          = window.poolSetMaxShares;
  window.poolInit                  = window.poolInit;

})();
