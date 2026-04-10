/**
 * ArcFi AI Agent - Intent-based chatbot for loan operations
 * Integrates with blockchain via Web3Manager
 */

class ArcFiAgent {
  constructor() {
    this.messages = [];
    this.currentLoanContext = null;
    this.pendingAction = null;
    this.isProcessing = false;
    this.sessionId = Date.now().toString();
  }

  // ─── Intent Classification ─────────────────────────────────────────────────
  classifyIntent(input) {
    const lower = input.toLowerCase().trim();

    // Payment intents
    if (/pay\s*(next|current|my)\s*install/i.test(lower) || /pay\s*install/i.test(lower)) {
      return { intent: 'PAY_NEXT_INSTALLMENT', confidence: 0.95 };
    }
    if (/pay\s*(full|entire|all|whole|complete)\s*(loan|debt|balance)/i.test(lower)) {
      return { intent: 'PAY_FULL_LOAN', confidence: 0.95 };
    }
    if (/pay\s*installment\s*#?\s*(\d+)/i.test(lower)) {
      const match = lower.match(/pay\s*installment\s*#?\s*(\d+)/i);
      return { intent: 'PAY_SPECIFIC_INSTALLMENT', index: parseInt(match[1]) - 1, confidence: 0.92 };
    }

    // Marketplace / Offer intents
    if (/(create|add|new|open)\s*(a\s*)?(loan\s*)?offer/i.test(lower) || /lend\s*(usdc|money|funds)/i.test(lower)) {
      return { intent: 'CREATE_OFFER', confidence: 0.92 };
    }
    if (/(show|view|list|my)\s*(my\s*)?(offers?|lending|lend\s*activity)/i.test(lower)) {
      return { intent: 'SHOW_MY_OFFERS', confidence: 0.91 };
    }
    if (/(how\s*much|what\s*is)\s*(my\s*)?(liquidity|available\s*funds?)/i.test(lower)) {
      return { intent: 'CHECK_LIQUIDITY', confidence: 0.90 };
    }
    if (/(pause|suspend)\s*(my\s*)?offer/i.test(lower)) {
      return { intent: 'PAUSE_OFFER', confidence: 0.88 };
    }
    if (/(resume|reactivate)\s*(my\s*)?offer/i.test(lower)) {
      return { intent: 'RESUME_OFFER', confidence: 0.88 };
    }
    if (/(browse|show|view|list)\s*(the\s*)?(marketplace|offers?|lend\s*offers?)/i.test(lower)) {
      return { intent: 'BROWSE_MARKETPLACE', confidence: 0.91 };
    }

    // Query intents
    if (/how\s*much\s*(do\s*i\s*owe|is\s*(left|remaining)|is\s*my\s*(balance|debt))/i.test(lower)) {
      return { intent: 'CHECK_BALANCE', confidence: 0.93 };
    }
    if (/(show|list|view|get|check)\s*(my\s*)?(payment|pay)\s*(history|record)/i.test(lower)) {
      return { intent: 'PAYMENT_HISTORY', confidence: 0.92 };
    }
    if (/(show|check|view|get)\s*(my\s*)?(loan|loans|status)/i.test(lower)) {
      return { intent: 'LOAN_STATUS', confidence: 0.90 };
    }
    if (/(when|what)\s*(is|are)\s*(my\s*)?(next|upcoming|due)\s*(payment|installment)/i.test(lower)) {
      return { intent: 'NEXT_PAYMENT_DUE', confidence: 0.91 };
    }
    if (/check\s*(balance|wallet|usdc)/i.test(lower)) {
      return { intent: 'CHECK_WALLET', confidence: 0.88 };
    }

    // Loan management
    if (/(cancel|withdraw)\s*(my\s*)?(loan|application)/i.test(lower)) {
      return { intent: 'CANCEL_LOAN', confidence: 0.87 };
    }
    if (/(apply|request|create|get)\s*(a\s*)?(new\s*)?(loan)/i.test(lower)) {
      return { intent: 'APPLY_LOAN', confidence: 0.85 };
    }

    // Help
    if (/help|what\s*can\s*(you|i)|commands|options/i.test(lower)) {
      return { intent: 'HELP', confidence: 0.99 };
    }
    if (/hi|hello|hey|gm|good\s*(morning|afternoon|evening)/i.test(lower)) {
      return { intent: 'GREETING', confidence: 0.99 };
    }

    return { intent: 'UNKNOWN', confidence: 0.3 };
  }

  // ─── Extract Loan ID from message ─────────────────────────────────────────
  extractLoanId(input) {
    const match = input.match(/loan\s*#?\s*(\d+)/i) || input.match(/#(\d+)/);
    return match ? match[1] : this.currentLoanContext;
  }

  // ─── Process Message ───────────────────────────────────────────────────────
  async process(userInput) {
    if (this.isProcessing) {
      return { text: 'Still processing previous request...', type: 'warning' };
    }
    this.isProcessing = true;

    try {
      const { intent, index } = this.classifyIntent(userInput);
      const loanId = this.extractLoanId(userInput);

      switch (intent) {
        case 'GREETING':
          return this._greet();
        case 'HELP':
          return this._help();
        case 'CHECK_BALANCE':
          return await this._checkBalance(loanId);
        case 'PAYMENT_HISTORY':
          return await this._paymentHistory(loanId);
        case 'LOAN_STATUS':
          return await this._loanStatus(loanId);
        case 'NEXT_PAYMENT_DUE':
          return await this._nextPaymentDue(loanId);
        case 'CHECK_WALLET':
          return await this._checkWallet();
        case 'PAY_NEXT_INSTALLMENT':
          return await this._payNextInstallment(loanId);
        case 'PAY_FULL_LOAN':
          return await this._payFullLoan(loanId);
        case 'PAY_SPECIFIC_INSTALLMENT':
          return await this._paySpecificInstallment(loanId, index);
        case 'CANCEL_LOAN':
          return await this._cancelLoan(loanId);
        case 'APPLY_LOAN':
          return this._applyLoan();
        // Marketplace intents
        case 'CREATE_OFFER':
          return this._createOffer();
        case 'SHOW_MY_OFFERS':
          return await this._showMyOffers();
        case 'CHECK_LIQUIDITY':
          return await this._checkLiquidity();
        case 'PAUSE_OFFER':
          return this._pauseOffer();
        case 'RESUME_OFFER':
          return this._resumeOffer();
        case 'BROWSE_MARKETPLACE':
          return this._browseMarketplace();
        default:
          return this._unknown(userInput);
      }
    } catch (err) {
      console.error('Agent error:', err);
      return {
        text: `⚠️ Error: ${err.message || 'Something went wrong'}`,
        type: 'error'
      };
    } finally {
      this.isProcessing = false;
    }
  }

  _greet() {
    const greetings = [
      "Hello! I'm ArcFi AI. I can help you manage your loans, make payments, and check balances. Type **help** to see what I can do.",
      "Hey there! Ready to manage your DeFi loans? I'm your Arc Testnet assistant. Type **help** for commands.",
      "Welcome to ArcFi! I can pay your installments, check your balance, and more. How can I help?"
    ];
    return { text: greetings[Math.floor(Math.random() * greetings.length)], type: 'bot' };
  }

  _help() {
    return {
      text: `**Available Commands:**\n\n💰 **Payments**\n• "Pay next installment"\n• "Pay installment #2"\n• "Pay full loan"\n\n📊 **Queries**\n• "How much do I owe?"\n• "Show my payment history"\n• "Check my loan status"\n• "When is my next payment?"\n• "Check wallet balance"\n\n🏪 **Marketplace**\n• "Browse marketplace"\n• "Create a loan offer"\n• "Show my offers"\n• "How much liquidity do I have?"\n• "Pause my offer"\n\n🔧 **Management**\n• "Apply for a loan"\n• "Cancel my loan"\n\n💡 Include loan/offer number for specifics: "Pay installment #2 for loan #3"`,
      type: 'help'
    };
  }

  async _checkBalance(loanId) {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first to check your balance.', type: 'warning' };
    }
    if (!loanId) {
      const loans = await window.web3.getBorrowerLoans();
      if (!loans.length) return { text: "You don't have any active loans.", type: 'info' };
      
      let text = '**Your Loan Balances:**\n\n';
      loans.forEach(loan => {
        const remaining = loan.installments
          .filter(i => i.statusLabel === 'PENDING')
          .reduce((sum, i) => sum + parseFloat(i.amount), 0);
        text += `• Loan #${loan.id}: **$${remaining.toFixed(2)} USDC** remaining (${loan.paidInstallments}/${loan.totalInstallments} paid)\n`;
      });
      return { text, type: 'info' };
    }

    const remaining = await window.web3.getRemainingAmount(loanId);
    const loan = await window.web3.getLoanFull(loanId);
    if (!loan) return { text: `Loan #${loanId} not found.`, type: 'error' };

    this.currentLoanContext = loanId;
    return {
      text: `**Loan #${loanId} Balance:**\n• Remaining: **$${parseFloat(remaining).toFixed(2)} USDC**\n• Paid: ${loan.paidInstallments} installments\n• Total: ${loan.totalInstallments} installments\n• Status: **${loan.statusLabel}**`,
      type: 'info'
    };
  }

  async _paymentHistory(loanId) {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }

    let targetLoanId = loanId;
    if (!targetLoanId) {
      const loans = await window.web3.getBorrowerLoans();
      if (!loans.length) return { text: "No loans found.", type: 'info' };
      targetLoanId = loans[0].id;
    }

    const loan = await window.web3.getLoanFull(targetLoanId);
    if (!loan) return { text: `Loan #${targetLoanId} not found.`, type: 'error' };

    const paid = loan.installments.filter(i => i.statusLabel === 'PAID');
    if (!paid.length) return { text: `No payments made yet for Loan #${targetLoanId}.`, type: 'info' };

    let text = `**Payment History — Loan #${targetLoanId}:**\n\n`;
    paid.forEach(inst => {
      text += `• Installment #${inst.index + 1}: $${parseFloat(inst.amount).toFixed(2)} USDC — Paid ${UI.formatDateTime(inst.paidDate)}\n`;
    });
    return { text, type: 'history', loanId: targetLoanId, payments: paid };
  }

  async _loanStatus(loanId) {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }

    if (loanId) {
      const loan = await window.web3.getLoanFull(loanId);
      if (!loan) return { text: `Loan #${loanId} not found.`, type: 'error' };
      this.currentLoanContext = loanId;
      return {
        text: `**Loan #${loanId} Status:**\n• Status: **${loan.statusLabel}**\n• Principal: $${parseFloat(loan.principalAmount).toFixed(2)} USDC\n• Total Repayable: $${parseFloat(loan.totalRepayable).toFixed(2)} USDC\n• Interest: ${(loan.interestRateMonthly / 100).toFixed(2)}% / month\n• Installments: ${loan.paidInstallments}/${loan.totalInstallments} paid\n• Collateral: **${loan.collateral.colTypeLabel}**`,
        type: 'info',
        loan
      };
    }

    const loans = await window.web3.getBorrowerLoans();
    if (!loans.length) return { text: "You don't have any loans.", type: 'info' };
    let text = `**Your Loans (${loans.length} total):**\n\n`;
    loans.forEach(loan => {
      text += `• Loan #${loan.id}: ${loan.statusLabel} — $${parseFloat(loan.principalAmount).toFixed(2)} USDC (${loan.paidInstallments}/${loan.totalInstallments} paid)\n`;
    });
    return { text, type: 'info' };
  }

  async _nextPaymentDue(loanId) {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }

    let targetLoanId = loanId;
    if (!targetLoanId) {
      const loans = await window.web3.getBorrowerLoans();
      const activeLoans = loans.filter(l => l.statusLabel === 'ACTIVE');
      if (!activeLoans.length) return { text: "No active loans found.", type: 'info' };
      targetLoanId = activeLoans[0].id;
    }

    const next = await window.web3.getNextPendingInstallment(targetLoanId);
    if (!next) return { text: `No pending installments for Loan #${targetLoanId}.`, type: 'info' };

    const dueText = UI.timeUntil(next.dueDate);
    return {
      text: `**Next Payment — Loan #${targetLoanId}:**\n• Installment #${next.index + 1}\n• Amount: **$${parseFloat(next.amount).toFixed(2)} USDC**\n• Due: ${UI.formatDate(next.dueDate)} (${dueText})`,
      type: 'info',
      nextInstallment: next,
      loanId: targetLoanId
    };
  }

  async _checkWallet() {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }
    const balance = await window.web3.getUSDCBalance();
    return {
      text: `**Wallet: ${window.web3.getShortAddress()}**\n• USDC Balance: **$${parseFloat(balance).toFixed(2)} USDC**\n• Network: Arc Testnet (${window.ARC_CHAIN_ID})`,
      type: 'info'
    };
  }

  async _payNextInstallment(loanId) {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }

    let targetLoanId = loanId;
    if (!targetLoanId) {
      const loans = await window.web3.getBorrowerLoans();
      const active = loans.filter(l => l.statusLabel === 'ACTIVE');
      if (!active.length) return { text: "No active loans found.", type: 'error' };
      if (active.length > 1) {
        return {
          text: `You have multiple active loans. Please specify:\n${active.map(l => `• Loan #${l.id}`).join('\n')}\n\nE.g. "Pay next installment for loan #${active[0].id}"`,
          type: 'warning'
        };
      }
      targetLoanId = active[0].id;
    }

    const next = await window.web3.getNextPendingInstallment(targetLoanId);
    if (!next) return { text: `No pending installments for Loan #${targetLoanId}.`, type: 'info' };

    // Confirmation required
    this.pendingAction = {
      type: 'PAY_NEXT_INSTALLMENT',
      loanId: targetLoanId,
      amount: next.amount,
      index: next.index
    };

    return {
      text: `⚠️ **Confirm Payment**\n\nLoan #${targetLoanId} — Installment #${next.index + 1}\nAmount: **$${parseFloat(next.amount).toFixed(2)} USDC**\nDue: ${UI.formatDate(next.dueDate)}\n\nType **confirm** to proceed or **cancel** to abort.`,
      type: 'confirm',
      pendingAction: this.pendingAction
    };
  }

  async _payFullLoan(loanId) {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }

    let targetLoanId = loanId;
    if (!targetLoanId) {
      const loans = await window.web3.getBorrowerLoans();
      const active = loans.filter(l => l.statusLabel === 'ACTIVE');
      if (!active.length) return { text: "No active loans found.", type: 'error' };
      targetLoanId = active[0].id;
    }

    const remaining = await window.web3.getRemainingAmount(targetLoanId);
    this.pendingAction = {
      type: 'PAY_FULL_LOAN',
      loanId: targetLoanId,
      amount: remaining
    };

    return {
      text: `⚠️ **Confirm Full Repayment**\n\nLoan #${targetLoanId}\nTotal Remaining: **$${parseFloat(remaining).toFixed(2)} USDC**\n\nThis will pay all pending installments.\nType **confirm** to proceed or **cancel** to abort.`,
      type: 'confirm',
      pendingAction: this.pendingAction
    };
  }

  async _paySpecificInstallment(loanId, index) {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }
    if (!loanId) return { text: "Please specify a loan ID. E.g. 'Pay installment #2 for loan #1'", type: 'warning' };

    const loan = await window.web3.getLoanFull(loanId);
    if (!loan) return { text: `Loan #${loanId} not found.`, type: 'error' };
    if (index >= loan.installments.length) return { text: `Invalid installment number.`, type: 'error' };

    const inst = loan.installments[index];
    if (inst.statusLabel === 'PAID') return { text: `Installment #${index + 1} is already paid.`, type: 'warning' };

    this.pendingAction = {
      type: 'PAY_SPECIFIC_INSTALLMENT',
      loanId,
      index,
      amount: inst.amount
    };

    return {
      text: `⚠️ **Confirm Payment**\n\nLoan #${loanId} — Installment #${index + 1}\nAmount: **$${parseFloat(inst.amount).toFixed(2)} USDC**\n\nType **confirm** to proceed or **cancel** to abort.`,
      type: 'confirm',
      pendingAction: this.pendingAction
    };
  }

  async executePendingAction() {
    if (!this.pendingAction) return { text: 'No pending action to execute.', type: 'error' };

    const action = this.pendingAction;
    this.pendingAction = null;

    try {
      switch (action.type) {
        case 'PAY_NEXT_INSTALLMENT': {
          const result = await window.web3.payNextInstallment(action.loanId, action.amount);
          return {
            text: `✅ **Payment Successful!**\n\nInstallment #${action.index + 1} of Loan #${action.loanId}\nAmount: $${parseFloat(action.amount).toFixed(2)} USDC\nTx: ${result.txHash}`,
            type: 'success',
            txHash: result.txHash
          };
        }
        case 'PAY_FULL_LOAN': {
          const loan = await window.web3.getLoanFull(action.loanId);
          const pending = loan.installments.filter(i => i.statusLabel === 'PENDING');
          let lastTx = null;
          for (const inst of pending) {
            lastTx = await window.web3.payInstallment(action.loanId, inst.index, parseFloat(inst.amount));
            UI.showToast(`Installment #${inst.index + 1} paid ✓`, 'success', 3000);
          }
          return {
            text: `✅ **Full Loan Repaid!**\n\nLoan #${action.loanId} is now **COMPLETED**.\nTotal Paid: $${parseFloat(action.amount).toFixed(2)} USDC`,
            type: 'success',
            txHash: lastTx?.txHash
          };
        }
        case 'PAY_SPECIFIC_INSTALLMENT': {
          const result = await window.web3.payInstallment(action.loanId, action.index, action.amount);
          return {
            text: `✅ **Payment Successful!**\n\nInstallment #${action.index + 1} of Loan #${action.loanId}\nAmount: $${parseFloat(action.amount).toFixed(2)} USDC\nTx: ${result.txHash}`,
            type: 'success',
            txHash: result.txHash
          };
        }
        default:
          return { text: 'Unknown action type.', type: 'error' };
      }
    } catch (err) {
      return { text: `❌ Transaction failed: ${err.message}`, type: 'error' };
    }
  }

  async cancelPendingAction() {
    this.pendingAction = null;
    return { text: 'Action cancelled.', type: 'info' };
  }

  async _cancelLoan(loanId) {
    if (!loanId) return { text: 'Please specify a loan ID.', type: 'warning' };
    if (!window.web3.isConnected()) return { text: '🔐 Please connect your wallet first.', type: 'warning' };

    this.pendingAction = { type: 'CANCEL_LOAN', loanId };
    return {
      text: `⚠️ **Cancel Loan #${loanId}?**\n\nThis will cancel your pending loan request. Crypto collateral (if any) will be returned.\n\nType **confirm** to proceed.`,
      type: 'confirm'
    };
  }

  _applyLoan() {
    return {
      text: "To apply for a loan, click **'New Loan'** in the navigation or go to the Borrower section. I'll guide you through the process!",
      type: 'info',
      action: { type: 'NAVIGATE', target: 'borrow' }
    };
  }

  // ── Marketplace Methods ──────────────────────────────────────────────────────
  _createOffer() {
    return {
      text: "To create a lending offer:\n1. Go to the **Lend** page\n2. Fill in your lender details, liquidity amount, and terms\n3. Set your interest rate (≤ 5%/month) and installment limits\n4. Choose accepted collateral types\n5. Click **'Lock Liquidity & Create Offer'**\n\nYour USDC will be locked in the smart contract and visible to borrowers.",
      type: 'info',
      action: { type: 'NAVIGATE', target: 'lend' }
    };
  }

  async _showMyOffers() {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }
    if (!window.web3.marketplaceContract) {
      return { text: '🔧 Marketplace contract not configured. Add the address in Settings.', type: 'warning' };
    }

    const offers = await window.web3.getLenderOffers();
    if (!offers.length) {
      return {
        text: "You don't have any lending offers yet.\n\nType **'Create a loan offer'** or go to the **Lend** page to get started!",
        type: 'info'
      };
    }

    let text = `**Your Lending Offers (${offers.length} total):**\n\n`;
    offers.forEach(o => {
      text += `• Offer #${o.id}: **${o.interestRatePct}%/mo** | Available: **$${parseFloat(o.availableLiquidity).toFixed(0)} USDC** | Status: **${o.statusLabel}** | ${o.totalLoansIssued} loan(s)\n`;
    });
    text += '\nGo to **My Lending** to manage your offers.';

    return {
      text,
      type: 'info',
      action: { type: 'NAVIGATE', target: 'my-lending' }
    };
  }

  async _checkLiquidity() {
    if (!window.web3.isConnected()) {
      return { text: '🔐 Please connect your wallet first.', type: 'warning' };
    }
    if (!window.web3.marketplaceContract) {
      return { text: '🔧 Marketplace contract not configured.', type: 'warning' };
    }

    const offers = await window.web3.getLenderOffers();
    const walletBal = await window.web3.getUSDCBalance();

    if (!offers.length) {
      return {
        text: `**Your Liquidity Status:**\n• Wallet USDC: **$${parseFloat(walletBal).toFixed(2)}**\n• No active offers yet.\n\nCreate a lending offer to deploy your capital!`,
        type: 'info'
      };
    }

    const totalAvail     = offers.reduce((s,o) => s + parseFloat(o.availableLiquidity||0), 0);
    const totalAllocated = offers.reduce((s,o) => s + parseFloat(o.allocatedLiquidity||0), 0);
    const totalLocked    = offers.reduce((s,o) => s + parseFloat(o.totalLiquidity||0), 0);

    return {
      text: `**Your Liquidity Summary:**\n• Wallet USDC: **$${parseFloat(walletBal).toFixed(2)}**\n• Total Locked in Offers: **$${totalLocked.toFixed(2)} USDC**\n• Available (unallocated): **$${totalAvail.toFixed(2)} USDC**\n• Allocated (in loans): **$${totalAllocated.toFixed(2)} USDC**\n• Active Offers: ${offers.filter(o=>o.statusLabel==='ACTIVE').length}`,
      type: 'info'
    };
  }

  _pauseOffer() {
    return {
      text: "To pause an offer, go to **My Lending** → find your offer → click the pause button (⏸). This hides it from the marketplace temporarily. All active loans continue normally.",
      type: 'info',
      action: { type: 'NAVIGATE', target: 'my-lending' }
    };
  }

  _resumeOffer() {
    return {
      text: "To resume a paused offer, go to **My Lending** → find your paused offer → click **Resume**. The offer will become visible on the marketplace again.",
      type: 'info',
      action: { type: 'NAVIGATE', target: 'my-lending' }
    };
  }

  _browseMarketplace() {
    return {
      text: "Taking you to the **Loan Marketplace** where you can browse all active lender offers, filter by rate, amount, collateral type, and apply directly!",
      type: 'info',
      action: { type: 'NAVIGATE', target: 'marketplace' }
    };
  }

  _unknown(input) {
    return {
      text: `I'm not sure I understood "${input}". Try typing **help** to see available commands, or be more specific.\n\n*Examples:* "Pay next installment", "How much do I owe?", "Show payment history"`,
      type: 'warning'
    };
  }
}

// ─── Chatbot UI ───────────────────────────────────────────────────────────────
class ChatbotUI {
  constructor() {
    this.agent = new ArcFiAgent();
    this.isOpen = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this._createUI();
    this._bindEvents();
    this._addMessage('bot', "👋 Hi! I'm **ArcFi AI**. I can help you manage loans and payments on Arc Testnet.\n\nType **help** to see what I can do!");
  }

  _createUI() {
    const html = `
      <!-- Chatbot Toggle Button -->
      <button id="chatbot-toggle"
        class="fixed bottom-6 right-6 z-40 w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 
          rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110
          border-2 border-cyan-400/30">
        <svg id="chat-open-icon" class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z"/>
        </svg>
        <svg id="chat-close-icon" class="w-6 h-6 text-white hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
        <span id="chat-badge" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs 
          flex items-center justify-center font-bold hidden">!</span>
      </button>

      <!-- Chatbot Window -->
      <div id="chatbot-window" 
        class="fixed bottom-24 right-6 z-40 w-96 max-w-[calc(100vw-3rem)] bg-slate-900 border border-slate-700 
          rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 
          opacity-0 scale-95 pointer-events-none"
        style="height: 560px;">
        
        <!-- Header -->
        <div class="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 p-4 flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v4"/>
            </svg>
          </div>
          <div>
            <h3 class="text-white font-bold text-sm">ArcFi AI Agent</h3>
            <p class="text-emerald-400 text-xs flex items-center gap-1">
              <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
              Online — Arc Testnet
            </p>
          </div>
          <button id="chatbot-clear" class="ml-auto text-slate-500 hover:text-slate-300 text-xs transition-colors">
            Clear
          </button>
        </div>

        <!-- Messages -->
        <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"></div>

        <!-- Typing Indicator -->
        <div id="chat-typing" class="px-4 pb-2 hidden">
          <div class="flex items-center gap-2 text-slate-500">
            <div class="flex gap-1">
              <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style="animation-delay:0ms"></span>
              <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style="animation-delay:150ms"></span>
              <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style="animation-delay:300ms"></span>
            </div>
            <span class="text-xs">ArcFi AI is thinking...</span>
          </div>
        </div>

        <!-- Quick Actions -->
        <div id="chat-quick-actions" class="px-4 pb-2 flex flex-wrap gap-2">
          <button class="quick-action text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 transition-colors">Pay next</button>
          <button class="quick-action text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 transition-colors">Check balance</button>
          <button class="quick-action text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 transition-colors">Payment history</button>
        </div>

        <!-- Input -->
        <div class="border-t border-slate-700 p-3 flex gap-2">
          <input id="chat-input" type="text" placeholder="Ask me anything about your loans..."
            class="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm 
              placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"/>
          <button id="chat-send" 
            class="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center
              hover:from-cyan-400 hover:to-blue-500 transition-all active:scale-95">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  _bindEvents() {
    const toggle = document.getElementById('chatbot-toggle');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const clearBtn = document.getElementById('chatbot-clear');

    toggle?.addEventListener('click', () => this.toggle());
    sendBtn?.addEventListener('click', () => this._sendMessage());
    input?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this._sendMessage(); });
    clearBtn?.addEventListener('click', () => {
      document.getElementById('chat-messages').innerHTML = '';
      this._addMessage('bot', "Chat cleared. Type **help** to see what I can do!");
    });

    document.querySelectorAll('.quick-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('chat-input');
        if (input) {
          input.value = btn.textContent.trim();
          this._sendMessage();
        }
      });
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const win = document.getElementById('chatbot-window');
    const openIcon = document.getElementById('chat-open-icon');
    const closeIcon = document.getElementById('chat-close-icon');
    const badge = document.getElementById('chat-badge');

    if (this.isOpen) {
      win.classList.replace('opacity-0', 'opacity-100');
      win.classList.replace('scale-95', 'scale-100');
      win.classList.remove('pointer-events-none');
      openIcon.classList.add('hidden');
      closeIcon.classList.remove('hidden');
      badge.classList.add('hidden');
      document.getElementById('chat-input')?.focus();
    } else {
      win.classList.replace('opacity-100', 'opacity-0');
      win.classList.replace('scale-100', 'scale-95');
      win.classList.add('pointer-events-none');
      openIcon.classList.remove('hidden');
      closeIcon.classList.add('hidden');
    }
  }

  async _sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input?.value?.trim();
    if (!text) return;

    input.value = '';
    this._addMessage('user', text);
    this._showTyping(true);

    try {
      let response;
      // Check for confirmation responses
      if (/^(confirm|yes|ok|sure|proceed|do it)$/i.test(text) && this.agent.pendingAction) {
        response = await this.agent.executePendingAction();
      } else if (/^(cancel|no|abort|stop|nope)$/i.test(text) && this.agent.pendingAction) {
        response = await this.agent.cancelPendingAction();
      } else {
        response = await this.agent.process(text);
      }

      await new Promise(r => setTimeout(r, 600));
      this._showTyping(false);
      this._addMessage('bot', response.text, response);

      // Handle navigation actions
      if (response.action?.type === 'NAVIGATE') {
        document.querySelector(`[data-page="${response.action.target}"]`)?.click();
      }
    } catch (err) {
      this._showTyping(false);
      this._addMessage('bot', `❌ Error: ${err.message}`, { type: 'error' });
    }
  }

  _showTyping(show) {
    const el = document.getElementById('chat-typing');
    if (el) el.classList.toggle('hidden', !show);
  }

  _addMessage(role, text, meta = {}) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const isBot = role === 'bot';
    const formattedText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
      .replace(/\n/g, '<br/>');

    const typeColors = {
      success: 'border-l-2 border-emerald-500 bg-emerald-500/5',
      error: 'border-l-2 border-red-500 bg-red-500/5',
      warning: 'border-l-2 border-amber-500 bg-amber-500/5',
      confirm: 'border-l-2 border-yellow-500 bg-yellow-500/5',
      help: 'border-l-2 border-blue-500 bg-blue-500/5',
    };

    const extraClass = isBot && meta.type ? typeColors[meta.type] || '' : '';

    const msg = document.createElement('div');
    msg.className = `flex ${isBot ? 'justify-start' : 'justify-end'}`;
    msg.innerHTML = `
      <div class="max-w-[85%] ${isBot
        ? `bg-slate-800 text-slate-200 rounded-2xl rounded-tl-sm ${extraClass}`
        : 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white rounded-2xl rounded-tr-sm'
      } px-4 py-3 text-sm leading-relaxed shadow-sm">
        ${formattedText}
        ${meta.txHash ? `
          <div class="mt-2 pt-2 border-t border-slate-700">
            <a href="${window.ARC_EXPLORER}/tx/${meta.txHash}" target="_blank" 
              class="text-cyan-400 text-xs hover:underline">View tx →</a>
          </div>
        ` : ''}
      </div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;

    // Show notification badge when closed
    if (isBot && !this.isOpen) {
      document.getElementById('chat-badge')?.classList.remove('hidden');
    }
  }
}

// Global instance
window.chatbot = new ChatbotUI();
document.addEventListener('DOMContentLoaded', () => window.chatbot.init());
