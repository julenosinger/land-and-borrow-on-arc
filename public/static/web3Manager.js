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
}

// Singleton
window.web3 = new Web3Manager();
