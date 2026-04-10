/**
 * Web3Manager - Handles wallet connections and blockchain interactions for Arc Testnet
 * Supports MetaMask and WalletConnect-compatible wallets
 */

class Web3Manager {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.contract = null;
    this.usdcContract = null;
    this.chainId = null;
    this.listeners = {};
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  async connectWallet() {
    if (!window.ethereum) {
      throw new Error('No Web3 wallet detected. Please install MetaMask or a compatible wallet.');
    }
    try {
      // Request accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) throw new Error('No accounts found');

      await this._setupProvider();
      await this._ensureArcNetwork();

      this.address = accounts[0];
      this.emit('connected', { address: this.address, chainId: this.chainId });
      this._setupEventListeners();
      return this.address;
    } catch (err) {
      throw new Error(`Wallet connection failed: ${err.message}`);
    }
  }

  async _setupProvider() {
    this.provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    this.signer = this.provider.getSigner();
    const network = await this.provider.getNetwork();
    this.chainId = network.chainId;

    // Initialize contracts if addresses are set
    if (window.CONTRACT_ADDRESS && window.CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      this.contract = new ethers.Contract(window.CONTRACT_ADDRESS, window.LOAN_ABI, this.signer);
    }
    if (window.USDC_ADDRESS && window.USDC_ADDRESS !== '0x0000000000000000000000000000000000000000') {
      this.usdcContract = new ethers.Contract(window.USDC_ADDRESS, window.ERC20_ABI, this.signer);
    }
    const mktAddr = window.MARKETPLACE_ADDRESS || window.MARKETPLACE_CONTRACT_ADDRESS || '';
    if (mktAddr && mktAddr !== '0x0000000000000000000000000000000000000000') {
      this.marketplaceContract = new ethers.Contract(mktAddr, window.MARKETPLACE_ABI, this.signer);
    }
  }

  async _ensureArcNetwork() {
    const network = await this.provider.getNetwork();
    if (network.chainId !== window.ARC_CHAIN_ID) {
      await this._switchToArcNetwork();
    }
  }

  async _switchToArcNetwork() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ethers.utils.hexValue(window.ARC_CHAIN_ID) }]
      });
    } catch (switchError) {
      // Chain not added - add it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: ethers.utils.hexValue(window.ARC_CHAIN_ID),
            chainName: 'Arc Testnet',
            nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
            rpcUrls: [window.ARC_RPC_URL],
            blockExplorerUrls: [window.ARC_EXPLORER]
          }]
        });
      } else {
        throw switchError;
      }
    }
    // Refresh provider after switch
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

  isConnected() {
    return !!this.address;
  }

  requireConnection() {
    if (!this.isConnected()) throw new Error('Please connect your wallet first');
  }

  requireArcNetwork() {
    if (this.chainId !== window.ARC_CHAIN_ID) throw new Error(`Please switch to Arc Testnet (Chain ID: ${window.ARC_CHAIN_ID})`);
  }

  getShortAddress(addr) {
    const a = addr || this.address;
    if (!a) return '';
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
  }

  async getUSDCBalance(address) {
    if (!this.usdcContract) return '0';
    try {
      const bal = await this.usdcContract.balanceOf(address || this.address);
      return ethers.utils.formatUnits(bal, 6);
    } catch { return '0'; }
  }

  async approveUSDC(spender, amount) {
    this.requireConnection();
    if (!this.usdcContract) throw new Error('USDC contract not initialized');
    const amountBN = ethers.utils.parseUnits(amount.toString(), 6);
    const tx = await this.usdcContract.approve(spender, amountBN);
    await tx.wait();
    return tx;
  }

  async approveCollateralToken(tokenAddress, spender, amount) {
    this.requireConnection();
    const tokenContract = new ethers.Contract(tokenAddress, window.ERC20_ABI, this.signer);
    const decimals = await tokenContract.decimals();
    const amountBN = ethers.utils.parseUnits(amount.toString(), decimals);
    const tx = await tokenContract.approve(spender, amountBN);
    await tx.wait();
    return tx;
  }

  // ─── Loan Operations ───────────────────────────────────────────────────────
  async createLoanWithRWA(borrowerInfo, principalAmount, installments, collateralData) {
    this.requireConnection();
    this.requireArcNetwork();
    if (!this.contract) throw new Error('Contract not initialized. Deploy the contract first.');

    const amountBN = ethers.utils.parseUnits(principalAmount.toString(), 6);
    const valueBN = ethers.utils.parseUnits(collateralData.estimatedValueUSD.toString(), 6);

    const tx = await this.contract.createLoanWithRWA(
      [borrowerInfo.fullName, borrowerInfo.email, borrowerInfo.country, borrowerInfo.city, borrowerInfo.employmentStatus || ''],
      amountBN,
      parseInt(installments),
      collateralData.assetType,
      collateralData.description,
      valueBN,
      collateralData.jurisdiction,
      collateralData.documentHash,
      collateralData.documentURI || ''
    );
    const receipt = await tx.wait();
    const event = receipt.events?.find(e => e.event === 'LoanCreated');
    const loanId = event?.args?.loanId?.toString();
    return { tx, receipt, loanId };
  }

  async createLoanWithCrypto(borrowerInfo, principalAmount, installments, collateralData) {
    this.requireConnection();
    this.requireArcNetwork();
    if (!this.contract) throw new Error('Contract not initialized. Deploy the contract first.');

    const amountBN = ethers.utils.parseUnits(principalAmount.toString(), 6);
    const tokenContract = new ethers.Contract(collateralData.tokenAddress, window.ERC20_ABI, this.signer);
    const decimals = await tokenContract.decimals();
    const collateralBN = ethers.utils.parseUnits(collateralData.amount.toString(), decimals);

    // Approve collateral transfer first
    const approveTx = await tokenContract.approve(window.CONTRACT_ADDRESS, collateralBN);
    await approveTx.wait();
    UI.showToast('Collateral approved ✓', 'success');

    const tx = await this.contract.createLoanWithCrypto(
      [borrowerInfo.fullName, borrowerInfo.email, borrowerInfo.country, borrowerInfo.city, borrowerInfo.employmentStatus || ''],
      amountBN,
      parseInt(installments),
      collateralData.tokenAddress,
      collateralBN,
      parseInt(collateralData.ratioBps)
    );
    const receipt = await tx.wait();
    const event = receipt.events?.find(e => e.event === 'LoanCreated');
    const loanId = event?.args?.loanId?.toString();
    return { tx, receipt, loanId };
  }

  async approveLoan(loanId, interestRateBps, installmentDays) {
    this.requireConnection();
    this.requireArcNetwork();
    if (!this.contract) throw new Error('Contract not initialized');
    const tx = await this.contract.approveLoan(loanId, interestRateBps, installmentDays);
    return await tx.wait();
  }

  async rejectLoan(loanId) {
    this.requireConnection();
    if (!this.contract) throw new Error('Contract not initialized');
    const tx = await this.contract.rejectLoan(loanId);
    return await tx.wait();
  }

  async verifyRWA(loanId) {
    this.requireConnection();
    if (!this.contract) throw new Error('Contract not initialized');
    const tx = await this.contract.verifyRWA(loanId);
    return await tx.wait();
  }

  async disburseLoan(loanId, amount) {
    this.requireConnection();
    this.requireArcNetwork();
    if (!this.contract) throw new Error('Contract not initialized');
    // Approve USDC first
    const amountBN = ethers.utils.parseUnits(amount.toString(), 6);
    const approveTx = await this.usdcContract.approve(window.CONTRACT_ADDRESS, amountBN);
    await approveTx.wait();
    UI.showToast('USDC approved ✓', 'success');

    const tx = await this.contract.disburseLoan(loanId);
    return await tx.wait();
  }

  async payInstallment(loanId, installmentIndex, installmentAmount) {
    this.requireConnection();
    this.requireArcNetwork();
    if (!this.contract) throw new Error('Contract not initialized');

    const amountBN = ethers.utils.parseUnits(installmentAmount.toString(), 6);
    const approveTx = await this.usdcContract.approve(window.CONTRACT_ADDRESS, amountBN);
    await approveTx.wait();
    UI.showToast('USDC approved ✓', 'success');

    const txHash = ethers.utils.id(`${loanId}-${installmentIndex}-${Date.now()}`);
    const tx = await this.contract.payInstallment(loanId, installmentIndex, txHash);
    const receipt = await tx.wait();
    return { tx, receipt, txHash: tx.hash };
  }

  async payNextInstallment(loanId, installmentAmount) {
    this.requireConnection();
    this.requireArcNetwork();
    if (!this.contract) throw new Error('Contract not initialized');

    const amountBN = ethers.utils.parseUnits(installmentAmount.toString(), 6);
    const approveTx = await this.usdcContract.approve(window.CONTRACT_ADDRESS, amountBN);
    await approveTx.wait();

    const txHash = ethers.utils.id(`next-${loanId}-${Date.now()}`);
    const tx = await this.contract.payNextInstallment(loanId, txHash);
    const receipt = await tx.wait();
    return { tx, receipt, txHash: tx.hash };
  }

  async cancelLoan(loanId) {
    this.requireConnection();
    if (!this.contract) throw new Error('Contract not initialized');
    const tx = await this.contract.cancelLoan(loanId);
    return await tx.wait();
  }

  async liquidateCollateral(loanId) {
    this.requireConnection();
    if (!this.contract) throw new Error('Contract not initialized');
    const tx = await this.contract.liquidateCollateral(loanId);
    return await tx.wait();
  }

  // ─── Read Operations ───────────────────────────────────────────────────────
  async getAllLoans() {
    if (!this.contract) return [];
    try {
      const ids = await this.contract.getAllLoanIds();
      const loans = await Promise.all(ids.map(id => this.getLoanFull(id.toString())));
      return loans.filter(Boolean);
    } catch { return []; }
  }

  async getLoanFull(loanId) {
    if (!this.contract) return null;
    try {
      const [basic, collateral, borrowerInfo, installments] = await Promise.all([
        this.contract.getLoanBasic(loanId),
        this.contract.getCollateral(loanId),
        this.contract.getBorrowerInfo(loanId),
        this.contract.getLoanInstallments(loanId)
      ]);
      return {
        id: basic.id.toString(),
        borrower: basic.borrower,
        lender: basic.lender,
        principalAmount: ethers.utils.formatUnits(basic.principalAmount, 6),
        interestRateMonthly: basic.interestRateMonthly.toNumber(),
        totalInstallments: basic.totalInstallments.toNumber(),
        installmentAmount: ethers.utils.formatUnits(basic.installmentAmount, 6),
        totalRepayable: ethers.utils.formatUnits(basic.totalRepayable, 6),
        paidInstallments: basic.paidInstallments.toNumber(),
        disbursedAt: basic.disbursedAt.toNumber(),
        createdAt: basic.createdAt.toNumber(),
        status: basic.status,
        statusLabel: window.LOAN_STATUS[basic.status],
        collateral: {
          colType: collateral.colType,
          colTypeLabel: window.COLLATERAL_TYPE[collateral.colType],
          assetType: collateral.assetType,
          description: collateral.description,
          estimatedValueUSD: collateral.estimatedValueUSD ? ethers.utils.formatUnits(collateral.estimatedValueUSD, 6) : '0',
          jurisdiction: collateral.jurisdiction,
          documentHash: collateral.documentHash,
          documentURI: collateral.documentURI,
          rwaVerified: collateral.rwaVerified,
          cryptoToken: collateral.cryptoToken,
          cryptoAmount: collateral.cryptoAmount ? ethers.utils.formatUnits(collateral.cryptoAmount, 6) : '0',
          collateralRatio: collateral.collateralRatio.toNumber(),
          cryptoLocked: collateral.cryptoLocked
        },
        borrowerInfo: {
          fullName: borrowerInfo.fullName,
          email: borrowerInfo.email,
          country: borrowerInfo.country,
          city: borrowerInfo.city,
          employmentStatus: borrowerInfo.employmentStatus
        },
        installments: installments.map((inst, idx) => ({
          index: idx,
          amount: ethers.utils.formatUnits(inst.amount, 6),
          dueDate: inst.dueDate.toNumber(),
          paidDate: inst.paidDate.toNumber(),
          txHash: inst.txHash,
          status: inst.status,
          statusLabel: window.INSTALLMENT_STATUS[inst.status]
        }))
      };
    } catch (e) {
      console.error('getLoanFull error:', e);
      return null;
    }
  }

  async getBorrowerLoans(address) {
    if (!this.contract) return [];
    try {
      const ids = await this.contract.getBorrowerLoans(address || this.address);
      return Promise.all(ids.map(id => this.getLoanFull(id.toString())));
    } catch { return []; }
  }

  async getLenderLoans(address) {
    if (!this.contract) return [];
    try {
      const ids = await this.contract.getLenderLoans(address || this.address);
      return Promise.all(ids.map(id => this.getLoanFull(id.toString())));
    } catch { return []; }
  }

  async getRemainingAmount(loanId) {
    if (!this.contract) return '0';
    try {
      const amt = await this.contract.getRemainingAmount(loanId);
      return ethers.utils.formatUnits(amt, 6);
    } catch { return '0'; }
  }

  async getNextPendingInstallment(loanId) {
    if (!this.contract) return null;
    try {
      const result = await this.contract.getNextPendingInstallment(loanId);
      return {
        index: result.index.toNumber(),
        amount: ethers.utils.formatUnits(result.amount, 6),
        dueDate: result.dueDate.toNumber(),
        status: result.status
      };
    } catch { return null; }
  }

  // ─── IPFS Upload ───────────────────────────────────────────────────────────
  async uploadToIPFS(file) {
    // Use Pinata public API or nft.storage free tier
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'pinata_api_key': window.PINATA_API_KEY || '',
          'pinata_secret_api_key': window.PINATA_SECRET_KEY || ''
        },
        body: formData
      });
      if (!resp.ok) throw new Error('IPFS upload failed');
      const data = await resp.json();
      return {
        hash: data.IpfsHash,
        uri: `ipfs://${data.IpfsHash}`,
        url: `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`
      };
    } catch {
      // Fallback: compute file hash locally for demo (document hash only)
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return {
        hash: hashHex,
        uri: `file://${file.name}`,
        url: null,
        localOnly: true
      };
    }
  }

  async hashFile(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
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

  // ─── Marketplace Operations ────────────────────────────────────────────────
  async _initMarketplace() {
    if (this.marketplaceContract) return;
    const addr = window.MARKETPLACE_ADDRESS || window.MARKETPLACE_CONTRACT_ADDRESS || '';
    if (addr && addr !== '0x0000000000000000000000000000000000000000' && this.signer) {
      this.marketplaceContract = new ethers.Contract(addr, window.MARKETPLACE_ABI, this.signer);
    }
  }

  async createOffer({
    lenderName, lenderType, liquidityAmount, interestRateBps, maxInstallments,
    minLoanAmount, maxLoanAmount, acceptedCollateral, minCollateralRatioBps,
    geoRestrictions, borrowerPreferences
  }) {
    this.requireConnection();
    this.requireArcNetwork();
    await this._initMarketplace();
    if (!this.marketplaceContract) throw new Error('Marketplace contract not configured. Add address in Settings.');

    const liquidityBN      = ethers.utils.parseUnits(liquidityAmount.toString(), 6);
    const minLoanBN        = ethers.utils.parseUnits(minLoanAmount.toString(), 6);
    const maxLoanBN        = ethers.utils.parseUnits(maxLoanAmount.toString(), 6);

    // Approve USDC for marketplace
    if (!this.usdcContract) throw new Error('USDC contract not initialized');
    const approveTx = await this.usdcContract.approve(
      window.MARKETPLACE_ADDRESS, liquidityBN
    );
    await approveTx.wait();

    const tx = await this.marketplaceContract.createOffer(
      lenderName,
      parseInt(lenderType),
      liquidityBN,
      parseInt(interestRateBps),
      parseInt(maxInstallments),
      minLoanBN,
      maxLoanBN,
      parseInt(acceptedCollateral),
      parseInt(minCollateralRatioBps),
      geoRestrictions || 'GLOBAL',
      borrowerPreferences || ''
    );
    const receipt = await tx.wait();
    const event = receipt.events?.find(e => e.event === 'OfferCreated');
    const offerId = event?.args?.offerId?.toString();
    return { tx, receipt, offerId };
  }

  async updateOffer(offerId, params) {
    this.requireConnection();
    await this._initMarketplace();
    if (!this.marketplaceContract) throw new Error('Marketplace contract not configured');
    const minLoanBN = ethers.utils.parseUnits(params.minLoanAmount.toString(), 6);
    const maxLoanBN = ethers.utils.parseUnits(params.maxLoanAmount.toString(), 6);
    const tx = await this.marketplaceContract.updateOffer(
      offerId, parseInt(params.interestRateBps), parseInt(params.maxInstallments),
      minLoanBN, maxLoanBN, parseInt(params.acceptedCollateral),
      parseInt(params.minCollateralRatioBps), params.geoRestrictions || 'GLOBAL',
      params.borrowerPreferences || ''
    );
    return await tx.wait();
  }

  async pauseOffer(offerId) {
    this.requireConnection();
    await this._initMarketplace();
    if (!this.marketplaceContract) throw new Error('Marketplace contract not configured');
    const tx = await this.marketplaceContract.pauseOffer(offerId);
    return await tx.wait();
  }

  async resumeOffer(offerId) {
    this.requireConnection();
    await this._initMarketplace();
    if (!this.marketplaceContract) throw new Error('Marketplace contract not configured');
    const tx = await this.marketplaceContract.resumeOffer(offerId);
    return await tx.wait();
  }

  async addLiquidity(offerId, amount) {
    this.requireConnection();
    await this._initMarketplace();
    if (!this.marketplaceContract) throw new Error('Marketplace contract not configured');
    const amtBN = ethers.utils.parseUnits(amount.toString(), 6);
    const approveTx = await this.usdcContract.approve(window.MARKETPLACE_ADDRESS, amtBN);
    await approveTx.wait();
    const tx = await this.marketplaceContract.addLiquidity(offerId, amtBN);
    return await tx.wait();
  }

  async withdrawLiquidity(offerId, amount) {
    this.requireConnection();
    await this._initMarketplace();
    if (!this.marketplaceContract) throw new Error('Marketplace contract not configured');
    const amtBN = ethers.utils.parseUnits(amount.toString(), 6);
    const tx = await this.marketplaceContract.withdrawLiquidity(offerId, amtBN);
    return await tx.wait();
  }

  async closeOffer(offerId) {
    this.requireConnection();
    await this._initMarketplace();
    if (!this.marketplaceContract) throw new Error('Marketplace contract not configured');
    const tx = await this.marketplaceContract.closeOffer(offerId);
    return await tx.wait();
  }

  async getOffer(offerId) {
    await this._initMarketplace();
    if (!this.marketplaceContract) return null;
    try {
      const r = await this.marketplaceContract.getOffer(offerId);
      return {
        id:                 r.id.toString(),
        lender:             r.lender,
        lenderName:         r.lenderName,
        lenderType:         r.lenderType,
        lenderTypeLabel:    window.LENDER_TYPE[r.lenderType] || 'Individual',
        totalLiquidity:     ethers.utils.formatUnits(r.totalLiquidity, 6),
        availableLiquidity: ethers.utils.formatUnits(r.availableLiquidity, 6),
        allocatedLiquidity: ethers.utils.formatUnits(r.allocatedLiquidity, 6),
        interestRateBps:    r.interestRateBps.toNumber(),
        interestRatePct:    (r.interestRateBps.toNumber() / 100).toFixed(2),
        maxInstallments:    r.maxInstallments.toNumber(),
        minLoanAmount:      ethers.utils.formatUnits(r.minLoanAmount, 6),
        maxLoanAmount:      ethers.utils.formatUnits(r.maxLoanAmount, 6),
        acceptedCollateral: r.acceptedCollateral,
        collateralLabel:    window.COLLATERAL_PREF[r.acceptedCollateral] || 'Both',
        minCollateralRatioBps: r.minCollateralRatioBps.toNumber(),
        minCollateralRatioPct: (r.minCollateralRatioBps.toNumber() / 100).toFixed(0),
        geoRestrictions:    r.geoRestrictions,
        status:             r.status,
        statusLabel:        window.OFFER_STATUS[r.status] || 'ACTIVE',
        createdAt:          r.createdAt.toNumber(),
        totalLoansIssued:   r.totalLoansIssued.toNumber(),
        totalRepaid:        ethers.utils.formatUnits(r.totalRepaid, 6),
        utilizationRate: r.totalLiquidity.gt(0)
          ? Math.round((r.allocatedLiquidity.toNumber() / r.totalLiquidity.toNumber()) * 100)
          : 0,
        riskLevel: this._calcRiskLevel(r)
      };
    } catch (e) {
      console.error('getOffer error:', e);
      return null;
    }
  }

  _calcRiskLevel(offerRaw) {
    const colPref = offerRaw.acceptedCollateral;
    const ratio   = offerRaw.minCollateralRatioBps?.toNumber ? offerRaw.minCollateralRatioBps.toNumber() : 12000;
    // RWA only → medium (off-chain enforcement)
    if (colPref === 1) return 'Medium';
    // Crypto with high ratio → Low
    if (colPref === 2 && ratio >= 15000) return 'Low';
    if (colPref === 2) return 'Medium';
    // Both → depends on ratio
    if (ratio >= 15000) return 'Low';
    if (ratio >= 12000) return 'Medium';
    return 'High';
  }

  async getAllOffers() {
    await this._initMarketplace();
    if (!this.marketplaceContract) return [];
    try {
      const ids = await this.marketplaceContract.getAllOfferIds();
      const offers = await Promise.all(ids.map(id => this.getOffer(id.toString())));
      return offers.filter(Boolean);
    } catch { return []; }
  }

  async getActiveOffers() {
    await this._initMarketplace();
    if (!this.marketplaceContract) return [];
    try {
      const ids = await this.marketplaceContract.getActiveOfferIds();
      const offers = await Promise.all(ids.map(id => this.getOffer(id.toString())));
      return offers.filter(Boolean);
    } catch { return []; }
  }

  async getLenderOffers(address) {
    await this._initMarketplace();
    if (!this.marketplaceContract) return [];
    try {
      const ids = await this.marketplaceContract.getLenderOfferIds(address || this.address);
      const offers = await Promise.all(ids.map(id => this.getOffer(id.toString())));
      return offers.filter(Boolean);
    } catch { return []; }
  }

  async getOfferROI(offerId) {
    await this._initMarketplace();
    if (!this.marketplaceContract) return 0;
    try {
      const roi = await this.marketplaceContract.getEstimatedROI(offerId);
      return (roi.toNumber() / 100).toFixed(2); // percent
    } catch { return '0.00'; }
  }

  async checkLoanCompatibility(offerId, loanAmount, collateralType, collateralRatioBps) {
    await this._initMarketplace();
    if (!this.marketplaceContract) return { ok: false, reason: 'Contract not configured' };
    try {
      const amtBN  = ethers.utils.parseUnits(loanAmount.toString(), 6);
      const [ok, reason] = await this.marketplaceContract.isLoanCompatible(
        offerId, amtBN, parseInt(collateralType), parseInt(collateralRatioBps)
      );
      return { ok, reason };
    } catch (e) { return { ok: false, reason: e.message }; }
  }
}

// Singleton
window.web3 = new Web3Manager();
