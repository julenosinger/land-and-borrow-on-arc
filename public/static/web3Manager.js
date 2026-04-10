/**
 * Web3Manager — DaatFI v2.1
 * Handles wallet connections and blockchain interactions for Arc Testnet.
 * Compatible with ArcFiLoanManager v1.0.0 (deployed at CONTRACT_ADDRESS).
 *
 * Arc Testnet details:
 *   Chain ID : 5042002
 *   RPC      : https://rpc.testnet.arc.network
 *   Native   : USDC (ERC-20 precompile at 0x3600…0000)
 *   Explorer : https://testnet.arcscan.app
 *
 * ethers.js : v5 (loaded via CDN — ethers@5.7.2)
 */

class Web3Manager {
  constructor() {
    this.provider        = null;
    this.signer          = null;
    this.address         = null;
    this.contract        = null;   // ArcFiLoanManager (with signer, after wallet connect)
    this.usdcContract    = null;   // USDC ERC-20 (with signer)
    this.chainId         = null;
    this.listeners       = {};

    // ── Read-only provider & contract (lazy-init, no wallet required) ────────
    // Initialised on first call to getReadContract().
    this._readProvider = null;
    this._readContract = null;
  }

  /**
   * Returns the best available contract instance:
   *   - Signed contract (after wallet connect) — for write ops
   *   - Read-only contract (always available)  — for read ops
   *   - null if nothing is initialised
   */
  getReadContract() {
    // If we already have a signed contract, prefer it
    if (this.contract) return this.contract;

    // Lazily initialise the read-only contract on first call
    // (ensures window.LOAN_ABI is available, as contractABI.js may assign it after constructor)
    if (!this._readContract && window.LOAN_ABI && window.LOAN_ABI.length > 0) {
      try {
        if (!this._readProvider) {
          this._readProvider = new ethers.providers.JsonRpcProvider(
            'https://rpc.testnet.arc.network',
            { chainId: 5042002, name: 'arc-testnet' }
          );
        }
        this._readContract = new ethers.Contract(
          window.CONTRACT_ADDRESS || '0x413508DBCb5Cbf86b93C09b9AE633Af8B14cEF5F',
          window.LOAN_ABI,
          this._readProvider
        );
      } catch (e) {
        console.warn('Failed to create read-only contract:', e.message);
      }
    }

    return this._readContract || null;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Lightweight event emitter
  // ─────────────────────────────────────────────────────────────────────

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Wallet connection
  // ─────────────────────────────────────────────────────────────────────

  async connectWallet() {
    if (!window.ethereum) {
      throw new Error('No Web3 wallet detected. Install MetaMask or a compatible wallet.');
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) throw new Error('No accounts returned');

      await this._setupProvider();
      await this._ensureArcNetwork();

      this.address = await this.signer.getAddress();
      this.emit('connected', { address: this.address, chainId: this.chainId });
      this._setupEventListeners();
      return this.address;
    } catch (err) {
      throw new Error(`Wallet connection failed: ${err.message}`);
    }
  }

  async _setupProvider() {
    // ethers v5 — loaded via CDN as window.ethers
    this.provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    this.signer   = this.provider.getSigner();
    const network = await this.provider.getNetwork();
    this.chainId  = network.chainId;

    // ── Main lending contract ──────────────────────────────────────────
    const contractAddr = window.CONTRACT_ADDRESS;
    if (contractAddr && contractAddr !== '0x0000000000000000000000000000000000000000') {
      this.contract  = new ethers.Contract(contractAddr, window.LOAN_ABI, this.signer);
      // Also update the read contract so getReadContract() returns the signed version
      this._readContract = this.contract;
    }

    // ── USDC ERC-20 ────────────────────────────────────────────────────
    const usdcAddr = window.USDC_ADDRESS;
    if (usdcAddr && usdcAddr !== '0x0000000000000000000000000000000000000000') {
      this.usdcContract = new ethers.Contract(usdcAddr, window.ERC20_ABI, this.signer);
    }
  }

  async _ensureArcNetwork() {
    const network = await this.provider.getNetwork();
    if (network.chainId !== window.ARC_CHAIN_ID) {
      await this._switchToArcNetwork();
    }
  }

  async _switchToArcNetwork() {
    const hexChainId = ethers.utils.hexValue(window.ARC_CHAIN_ID);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }]
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId:           hexChainId,
            chainName:         'Arc Testnet',
            nativeCurrency:    { name: 'USDC', symbol: 'USDC', decimals: 6 },
            rpcUrls:           [window.ARC_RPC_URL],
            blockExplorerUrls: [window.ARC_EXPLORER]
          }]
        });
      } else {
        throw switchError;
      }
    }
    await this._setupProvider();
  }

  _setupEventListeners() {
    if (!window.ethereum) return;
    window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length === 0) {
        this.address = null;
        this.emit('disconnected', {});
      } else {
        this.address = accounts[0];
        await this._setupProvider();
        this.emit('accountChanged', { address: this.address });
      }
    });
    window.ethereum.on('chainChanged', async (chainId) => {
      this.chainId = parseInt(chainId, 16);
      await this._setupProvider();
      this.emit('chainChanged', { chainId: this.chainId });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Guards & Helpers
  // ─────────────────────────────────────────────────────────────────────

  isConnected() { return !!this.address; }

  requireConnection() {
    if (!this.isConnected()) throw new Error('Please connect your wallet first.');
  }

  requireArcNetwork() {
    if (this.chainId !== window.ARC_CHAIN_ID) {
      throw new Error(`Please switch to Arc Testnet (Chain ID: ${window.ARC_CHAIN_ID})`);
    }
  }

  requireContract() {
    if (!this.contract) throw new Error('Contract not initialized. Check Settings → Contract Address.');
  }

  requireUSDC() {
    if (!this.usdcContract) throw new Error('USDC contract not initialized. Check Settings → USDC Address.');
  }

  getShortAddress(addr) {
    const a = addr || this.address;
    if (!a) return '';
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
  }

  formatUSD(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  USDC Operations
  // ─────────────────────────────────────────────────────────────────────

  async getUSDCBalance(address) {
    try {
      const target = address || this.address;
      if (this.usdcContract) {
        const bal = await this.usdcContract.balanceOf(target);
        return ethers.utils.formatUnits(bal, 6);
      }
      if (this.provider) {
        const usdcRO = new ethers.Contract(window.USDC_ADDRESS, window.ERC20_ABI, this.provider);
        const bal = await usdcRO.balanceOf(target);
        return ethers.utils.formatUnits(bal, 6);
      }
      return '0';
    } catch { return '0'; }
  }

  /**
   * Approve the lending contract to spend USDC on the caller's behalf.
   * @param {string|number} amount USDC amount (human-readable, e.g. "1000")
   */
  async approveUSDC(amount) {
    this.requireConnection();
    this.requireUSDC();
    const amountBN = ethers.utils.parseUnits(amount.toString(), 6);
    const tx = await this.usdcContract.approve(window.CONTRACT_ADDRESS, amountBN);
    await tx.wait();
    return tx;
  }

  async getUSDCAllowance(owner, spender) {
    try {
      if (!this.usdcContract) return '0';
      const al = await this.usdcContract.allowance(owner, spender || window.CONTRACT_ADDRESS);
      return ethers.utils.formatUnits(al, 6);
    } catch { return '0'; }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Loan Write Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Create a loan request with RWA collateral.
   * On-chain: createLoanRequest(principal, installments, 0, collateralReference)
   *
   * @param {object} borrowerInfo  { fullName, email, country, city, employmentStatus }
   * @param {string|number} principalAmount  USDC (human-readable, e.g. "1000")
   * @param {string|number} installments     1–10
   * @param {object} collateralData  { assetType, description, estimatedValueUSD,
   *                                   jurisdiction, documentHash, documentURI }
   * @returns {{ tx, receipt, loanId }}
   */
  async createLoanWithRWA(borrowerInfo, principalAmount, installments, collateralData) {
    this.requireConnection();
    this.requireArcNetwork();
    this.requireContract();

    const principalBN = ethers.utils.parseUnits(principalAmount.toString(), 6);

    // Pack all metadata into a JSON string stored on-chain as collateralReference
    const colRef = JSON.stringify({
      type:         collateralData.assetType    || 'RWA',
      description:  collateralData.description  || '',
      valueUSD:     collateralData.estimatedValueUSD || '0',
      jurisdiction: collateralData.jurisdiction || '',
      docHash:      collateralData.documentHash || '',
      docURI:       collateralData.documentURI  || '',
      borrower: {
        name:       borrowerInfo.fullName,
        email:      borrowerInfo.email,
        country:    borrowerInfo.country,
        city:       borrowerInfo.city,
        employment: borrowerInfo.employmentStatus || ''
      }
    });

    const tx      = await this.contract.createLoanRequest(
      principalBN,
      parseInt(installments),
      0,        // CollateralType.RWA
      colRef
    );
    const receipt = await tx.wait();

    const loanId  = this._parseLoanId(receipt, 'LoanCreated');
    return { tx, receipt, loanId };
  }

  /**
   * Create a loan request with Crypto collateral.
   * On-chain: createLoanRequest(principal, installments, 1, collateralReference)
   *
   * @param {object} borrowerInfo  { fullName, email, country, city, employmentStatus }
   * @param {string|number} principalAmount  USDC (human-readable)
   * @param {string|number} installments     1–10
   * @param {object} collateralData  { tokenAddress, amount, ratioBps }
   * @returns {{ tx, receipt, loanId }}
   */
  async createLoanWithCrypto(borrowerInfo, principalAmount, installments, collateralData) {
    this.requireConnection();
    this.requireArcNetwork();
    this.requireContract();

    const principalBN = ethers.utils.parseUnits(principalAmount.toString(), 6);

    const colRef = JSON.stringify({
      token:    collateralData.tokenAddress || window.USDC_ADDRESS,
      amount:   collateralData.amount,
      ratioBps: collateralData.ratioBps,
      borrower: {
        name:       borrowerInfo.fullName,
        email:      borrowerInfo.email,
        country:    borrowerInfo.country,
        city:       borrowerInfo.city,
        employment: borrowerInfo.employmentStatus || ''
      }
    });

    const tx      = await this.contract.createLoanRequest(
      principalBN,
      parseInt(installments),
      1,        // CollateralType.CRYPTO
      colRef
    );
    const receipt = await tx.wait();

    const loanId  = this._parseLoanId(receipt, 'LoanCreated');
    return { tx, receipt, loanId };
  }

  /**
   * Lender approves a loan and sets the interest rate.
   * On-chain: approveLoan(loanId, interestRate) — interestRate is integer % (1–5)
   *
   * @param {string|number} loanId
   * @param {number} interestRatePct  Monthly rate as integer percent (1–5)
   */
  async approveLoan(loanId, interestRatePct) {
    this.requireConnection();
    this.requireArcNetwork();
    this.requireContract();

    // Guard: contract requires integer 1–5
    const rateInt = Math.round(Number(interestRatePct));
    if (rateInt < 1 || rateInt > 5) {
      throw new Error(`Interest rate must be 1–5% per month (received: ${interestRatePct})`);
    }

    const tx = await this.contract.approveLoan(loanId, rateInt);
    return await tx.wait();
  }

  /**
   * Lender funds an approved loan.
   * Flow: approve USDC allowance → call fundLoan()
   *
   * @param {string|number} loanId
   * @param {string|number} principalAmount  USDC (human-readable)
   * @returns {{ tx, receipt }}
   */
  async fundLoan(loanId, principalAmount) {
    this.requireConnection();
    this.requireArcNetwork();
    this.requireContract();
    this.requireUSDC();

    const amountBN = ethers.utils.parseUnits(principalAmount.toString(), 6);

    // Step 1 — Approve USDC transfer from lender to contract
    const approveToast = typeof showToast === 'function'
      ? showToast('Step 1/2 — Approving USDC…', 'info', 0) : null;
    const approveTx = await this.usdcContract.approve(window.CONTRACT_ADDRESS, amountBN);
    await approveTx.wait();
    approveToast?.remove?.();
    if (typeof showToast === 'function') showToast('USDC approved ✓', 'success', 2000);

    // Step 2 — Fund the loan (USDC transferred: lender → borrower)
    const fundToast = typeof showToast === 'function'
      ? showToast('Step 2/2 — Funding loan…', 'info', 0) : null;
    const tx      = await this.contract.fundLoan(loanId);
    const receipt = await tx.wait();
    fundToast?.remove?.();

    return { tx, receipt };
  }

  /**
   * Alias: disburseLoan → fundLoan (backward-compat with app.js).
   */
  async disburseLoan(loanId, principalAmount) {
    return this.fundLoan(loanId, principalAmount);
  }

  /**
   * Borrower repays one installment.
   * Flow: approve USDC allowance (installmentAmount) → call repayInstallment()
   * The contract itself determines the exact amount (handles rounding on last installment).
   *
   * @param {string|number} loanId
   * @param {string|number} installmentAmount  USDC (human-readable) — used for approval
   * @returns {{ tx, receipt, txHash }}
   */
  async payInstallment(loanId, installmentIndex, installmentAmount) {
    return this._repayInstallment(loanId, installmentAmount);
  }

  async payNextInstallment(loanId, installmentAmount) {
    return this._repayInstallment(loanId, installmentAmount);
  }

  // Also update _repayInstallment to use getReadContract for amount lookup
  async _repayInstallment(loanId, installmentAmount) {
    this.requireConnection();
    this.requireArcNetwork();
    this.requireContract();
    this.requireUSDC();

    // Fetch exact remaining amount from contract to avoid rounding errors
    let payAmountBN;
    try {
      const c = this.contract; // must use signed contract for accurate state
      const [remaining] = await c.getRemainingAmount(loanId);
      const loan        = await c.getLoan(loanId);
      const instLeft    = loan.totalInstallments.sub(loan.installmentsPaid);

      // If last installment, use exact remaining; otherwise use installmentAmount
      if (instLeft.eq(1)) {
        payAmountBN = remaining;
      } else {
        payAmountBN = loan.installmentAmount;
      }
    } catch {
      // Fallback: use caller-supplied amount
      payAmountBN = ethers.utils.parseUnits(
        (installmentAmount || '0').toString(), 6
      );
    }

    // Step 1 — Approve
    const approveToast = typeof showToast === 'function'
      ? showToast('Step 1/2 — Approving USDC…', 'info', 0) : null;
    const approveTx = await this.usdcContract.approve(window.CONTRACT_ADDRESS, payAmountBN);
    await approveTx.wait();
    approveToast?.remove?.();
    if (typeof showToast === 'function') showToast('USDC approved ✓', 'success', 2000);

    // Step 2 — Repay
    const repayToast = typeof showToast === 'function'
      ? showToast('Step 2/2 — Sending repayment…', 'info', 0) : null;
    const tx      = await this.contract.repayInstallment(loanId);
    const receipt = await tx.wait();
    repayToast?.remove?.();

    return { tx, receipt, txHash: tx.hash };
  }

  /**
   * Lender marks an Active loan as Defaulted.
   * Note: ArcFiLoanManager v1 has no "reject" function — rejection is not supported.
   * Use this only on Active loans.
   * @param {string|number} loanId
   */
  async markLoanDefaulted(loanId) {
    this.requireConnection();
    this.requireContract();
    const tx = await this.contract.markDefaulted(loanId);
    return await tx.wait();
  }

  /**
   * rejectLoan — NOT available in ArcFiLoanManager v1.
   * There is no on-chain rejection function. Inform the user.
   */
  async rejectLoan(loanId) {
    throw new Error(
      'Loan rejection is not available in DaatFI Loan Manager v1. ' +
      'Requested loans that are never funded will simply remain pending until the borrower withdraws.'
    );
  }

  /**
   * cancelLoan — NOT available in ArcFiLoanManager v1.
   * Inform the user they should contact their lender.
   */
  async cancelLoan(loanId) {
    throw new Error(
      'Loan cancellation is not supported on-chain. ' +
      'If the loan has not been funded yet, please contact your lender.'
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Loan Read Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get normalised loan object for a given loanId.
   * Maps raw contract struct → format expected by the frontend.
   */
  async getLoanFull(loanId) {
    const c = this.getReadContract();
    if (!c) return null;
    try {
      const raw = await c.getLoan(loanId);
      return this._normalizeLoan(raw);
    } catch (e) {
      console.warn('getLoanFull error for', loanId, '—', e.message);
      return null;
    }
  }

  /**
   * Normalise raw Solidity struct → frontend-friendly object.
   * Handles ethers v5 BigNumber and enum fields.
   *
   * Struct fields (ArcFiLoanManager.Loan):
   *   id, borrower, lender, principal, interestRate, totalRepayment,
   *   installmentAmount, totalInstallments, installmentsPaid, totalPaid,
   *   collateralType (uint8), collateralReference (string),
   *   status (uint8), createdAt, fundedAt
   */
  _normalizeLoan(raw) {
    const fmt6 = (bn) => ethers.utils.formatUnits(bn, 6);
    const num   = (bn) => (bn && bn.toNumber) ? bn.toNumber() : Number(bn);

    const statusNum = num(raw.status);
    const colType   = num(raw.collateralType);

    // Parse collateralReference (JSON blob) — graceful fallback
    let colData = {};
    try { colData = JSON.parse(raw.collateralReference); } catch {}

    // Build synthetic installments array from paid-count
    const totalInst = num(raw.totalInstallments);
    const paidCount = num(raw.installmentsPaid);
    const instAmt   = fmt6(raw.installmentAmount);

    const installments = Array.from({ length: totalInst }, (_, i) => ({
      index:       i,
      number:      i + 1,
      amount:      instAmt,
      status:      i < paidCount ? 'Paid'    : 'Pending',
      statusLabel: i < paidCount ? 'Paid'    : 'Pending',
      dueDate:     0,
      paidDate:    i < paidCount ? num(raw.fundedAt) : 0
    }));

    const statusLabels = { 0: 'Requested', 1: 'Approved', 2: 'Active', 3: 'Repaid', 4: 'Defaulted' };

    return {
      // IDs & addresses
      id:               num(raw.id).toString(),
      borrower:         raw.borrower,
      lender:           raw.lender,

      // Financial (formatted)
      principalAmount:      fmt6(raw.principal),
      interestRateMonthly:  num(raw.interestRate),   // integer % (1-5)
      installmentAmount:    instAmt,
      totalRepayable:       fmt6(raw.totalRepayment),
      totalPaid:            fmt6(raw.totalPaid),

      // Installment tracking
      totalInstallments: totalInst,
      paidInstallments:  paidCount,
      installments,

      // Timestamps
      createdAt: num(raw.createdAt),
      fundedAt:  num(raw.fundedAt),

      // Status
      status:      statusNum,
      statusLabel: statusLabels[statusNum] || 'Unknown',

      // Collateral
      collateral: {
        colType,
        colTypeLabel:      colType === 0 ? 'RWA' : 'CRYPTO',
        reference:         raw.collateralReference,
        // RWA fields
        assetType:         colData.type          || '',
        description:       colData.description   || '',
        estimatedValueUSD: colData.valueUSD       || '0',
        jurisdiction:      colData.jurisdiction   || '',
        documentHash:      colData.docHash        || '',
        documentURI:       colData.docURI         || '',
        // Crypto fields
        cryptoToken:       colData.token          || '',
        cryptoAmount:      colData.amount         || '0',
        collateralRatio:   colData.ratioBps != null
                           ? Math.floor(colData.ratioBps / 100) : 120
      },

      // Borrower info (packed in collateralReference JSON)
      borrowerInfo: {
        fullName:         colData.borrower?.name       || '',
        email:            colData.borrower?.email      || '',
        country:          colData.borrower?.country    || '',
        city:             colData.borrower?.city       || '',
        employmentStatus: colData.borrower?.employment || ''
      }
    };
  }

  /**
   * Get all loans for a user (borrower OR lender — contract indexes both).
   */
  async getUserLoans(address) {
    const c = this.getReadContract();
    if (!c) return [];
    try {
      const ids   = await c.getUserLoans(address || this.address);
      if (!ids || ids.length === 0) return [];
      const loans = await Promise.all(ids.map(id => this.getLoanFull(id.toString())));
      return loans.filter(Boolean);
    } catch (e) {
      console.warn('getUserLoans error:', e.message);
      return [];
    }
  }

  // Aliases for backward-compat with app.js
  async getBorrowerLoans(address) { return this.getUserLoans(address); }
  async getLenderLoans(address)   { return this.getUserLoans(address); }

  async getRemainingAmount(loanId) {
    const c = this.getReadContract();
    if (!c) return { remaining: '0', installmentsLeft: 0 };
    try {
      const [remaining, left] = await c.getRemainingAmount(loanId);
      return {
        remaining:        ethers.utils.formatUnits(remaining, 6),
        installmentsLeft: left.toNumber()
      };
    } catch { return { remaining: '0', installmentsLeft: 0 }; }
  }

  async getTotalLoans() {
    const c = this.getReadContract();
    if (!c) return 0;
    try {
      const n = await c.getTotalLoans();
      return n.toNumber();
    } catch { return 0; }
  }

  /**
   * Get all loans ever created (fetches IDs 1..loanCount).
   * Use `limit` to avoid loading too many at once.
   */
  async getAllLoans(limit = 50) {
    const c = this.getReadContract();
    if (!c) return [];
    try {
      const total = await this.getTotalLoans();
      const count = Math.min(total, limit);
      if (count === 0) return [];
      const ids   = Array.from({ length: count }, (_, i) => i + 1);
      const loans = await Promise.all(ids.map(id => this.getLoanFull(id)));
      return loans.filter(Boolean);
    } catch { return []; }
  }

  /**
   * Returns the next pending installment for a loan (for chatbot / payment center).
   */
  async getNextPendingInstallment(loanId) {
    const loan = await this.getLoanFull(loanId);
    if (!loan) return null;
    const next = loan.installments.find(i => i.status === 'Pending');
    if (!next) return null;
    return {
      index:  next.index,
      number: next.number,
      amount: next.amount,
      dueDate: 0,
      status: 'Pending'
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  IPFS / File Hashing  (Pinata integration)
  // ─────────────────────────────────────────────────────────────────────

  async hashFile(file) {
    const buffer     = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async uploadToIPFS(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'pinata_api_key':        window.PINATA_API_KEY    || '',
          'pinata_secret_api_key': window.PINATA_SECRET_KEY || ''
        },
        body: formData
      });
      if (!resp.ok) throw new Error(`Pinata error: ${resp.status}`);
      const data = await resp.json();
      return {
        hash: '0x' + data.IpfsHash,
        uri:  `ipfs://${data.IpfsHash}`,
        url:  `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`
      };
    } catch {
      // Fallback: hash the file locally (no IPFS upload)
      const hash = await this.hashFile(file);
      return { hash, uri: `file://${file.name}`, url: null, localOnly: true };
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Private helpers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Parse a loanId from a transaction receipt event.
   * ethers v5: receipt.events array with named .event and .args.
   */
  _parseLoanId(receipt, eventName) {
    try {
      const ev = receipt.events?.find(e => e.event === eventName);
      return ev?.args?.loanId?.toString() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Marketplace stubs (off-chain / API-based — no on-chain contract)
  // ─────────────────────────────────────────────────────────────────────
  //  The marketplace operates via the Hono backend API.
  //  These stubs maintain backward-compat with app.js calls.

  async createOffer(p)        { throw new Error('Marketplace uses API. See the Lend page.'); }
  async updateOffer(id, p)    { throw new Error('Use the Lend page to manage offers.'); }
  async pauseOffer(id)        { throw new Error('Use the Lend page to pause offers.'); }
  async resumeOffer(id)       { throw new Error('Use the Lend page to resume offers.'); }
  async addLiquidity(id, amt) { throw new Error('Use the Lend page to add liquidity.'); }
  async withdrawLiquidity(id, amt) { throw new Error('Use the Lend page to withdraw.'); }
  async closeOffer(id)        { throw new Error('Use the Lend page to close offers.'); }
  async getAllOffers()        { return []; }
  async getActiveOffers()     { return []; }
  async getLenderOffers(a)    { return []; }
  async getOffer(id)          { return null; }
}

// ─── Singleton — globally available as window.web3 ──────────────────────────
window.web3 = new Web3Manager();
