// ════════════════════════════════════════════════════════════
// ArcFi — Contract ABIs & Network Configuration
// Arc Testnet (Chain ID: 5042002)
// ════════════════════════════════════════════════════════════

const ARC_CHAIN_ID  = 5042002;
const ARC_RPC_URL   = "https://rpc.arc.fun";
const ARC_EXPLORER  = "https://explorer.arc.fun";

// Contract Addresses (set from Settings after deployment)
const CONTRACT_ADDRESS     = window.LOAN_CONTRACT_ADDRESS     || "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS         = window.USDC_CONTRACT_ADDRESS     || "0x0000000000000000000000000000000000000000";
const MARKETPLACE_ADDRESS  = window.MARKETPLACE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

// ── LoanPlatform ABI ─────────────────────────────────────────────────────────
const LOAN_ABI = [
  // Events
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":true,"name":"borrower","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"LoanCreated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"},{"indexed":false,"name":"interestRate","type":"uint256"}],"name":"LoanApproved","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"}],"name":"LoanRejected","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"timestamp","type":"uint256"}],"name":"LoanDisbursed","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"installmentIndex","type":"uint256"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"txHash","type":"bytes32"}],"name":"InstallmentPaid","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"}],"name":"LoanCompleted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"}],"name":"LoanDefaulted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"CollateralLocked","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"CollateralReleased","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"recipient","type":"address"}],"name":"CollateralLiquidated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"documentHash","type":"bytes32"}],"name":"RWAVerified","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"receiptHash","type":"bytes32"},{"indexed":false,"name":"timestamp","type":"uint256"}],"name":"ReceiptGenerated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"loanId","type":"uint256"}],"name":"LoanCancelled","type":"event"},
  // Constructor
  {"inputs":[{"name":"_usdcToken","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},
  // State
  {"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"usdcToken","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"loanCounter","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MAX_INTEREST_RATE","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  // Write
  {"inputs":[{"components":[{"name":"fullName","type":"string"},{"name":"email","type":"string"},{"name":"country","type":"string"},{"name":"city","type":"string"},{"name":"employmentStatus","type":"string"}],"name":"_borrowerInfo","type":"tuple"},{"name":"_principalAmount","type":"uint256"},{"name":"_installments","type":"uint256"},{"name":"_assetType","type":"string"},{"name":"_description","type":"string"},{"name":"_estimatedValueUSD","type":"uint256"},{"name":"_jurisdiction","type":"string"},{"name":"_documentHash","type":"bytes32"},{"name":"_documentURI","type":"string"}],"name":"createLoanWithRWA","outputs":[{"name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"components":[{"name":"fullName","type":"string"},{"name":"email","type":"string"},{"name":"country","type":"string"},{"name":"city","type":"string"},{"name":"employmentStatus","type":"string"}],"name":"_borrowerInfo","type":"tuple"},{"name":"_principalAmount","type":"uint256"},{"name":"_installments","type":"uint256"},{"name":"_collateralToken","type":"address"},{"name":"_collateralAmount","type":"uint256"},{"name":"_collateralRatioBps","type":"uint256"}],"name":"createLoanWithCrypto","outputs":[{"name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"},{"name":"_interestRateBps","type":"uint256"},{"name":"_installmentDays","type":"uint256"}],"name":"approveLoan","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"rejectLoan","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"verifyRWA","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"disburseLoan","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"},{"name":"installmentIndex","type":"uint256"},{"name":"_txHash","type":"bytes32"}],"name":"payInstallment","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"},{"name":"_txHash","type":"bytes32"}],"name":"payNextInstallment","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"cancelLoan","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"liquidateCollateral","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Read
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"getLoanInstallments","outputs":[{"components":[{"name":"amount","type":"uint256"},{"name":"dueDate","type":"uint256"},{"name":"paidDate","type":"uint256"},{"name":"txHash","type":"bytes32"},{"name":"status","type":"uint8"}],"name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"getLoanReceipts","outputs":[{"name":"","type":"bytes32[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"borrower","type":"address"}],"name":"getBorrowerLoans","outputs":[{"name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"lender","type":"address"}],"name":"getLenderLoans","outputs":[{"name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getAllLoanIds","outputs":[{"name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"getLoanBasic","outputs":[{"name":"id","type":"uint256"},{"name":"borrower","type":"address"},{"name":"lender","type":"address"},{"name":"principalAmount","type":"uint256"},{"name":"interestRateMonthly","type":"uint256"},{"name":"totalInstallments","type":"uint256"},{"name":"installmentAmount","type":"uint256"},{"name":"totalRepayable","type":"uint256"},{"name":"paidInstallments","type":"uint256"},{"name":"disbursedAt","type":"uint256"},{"name":"createdAt","type":"uint256"},{"name":"status","type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"getCollateral","outputs":[{"components":[{"name":"colType","type":"uint8"},{"name":"assetType","type":"string"},{"name":"description","type":"string"},{"name":"estimatedValueUSD","type":"uint256"},{"name":"jurisdiction","type":"string"},{"name":"documentHash","type":"bytes32"},{"name":"documentURI","type":"string"},{"name":"rwaVerified","type":"bool"},{"name":"cryptoToken","type":"address"},{"name":"cryptoAmount","type":"uint256"},{"name":"collateralRatio","type":"uint256"},{"name":"cryptoLocked","type":"bool"}],"name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"getBorrowerInfo","outputs":[{"components":[{"name":"fullName","type":"string"},{"name":"email","type":"string"},{"name":"country","type":"string"},{"name":"city","type":"string"},{"name":"employmentStatus","type":"string"}],"name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"getNextPendingInstallment","outputs":[{"name":"index","type":"uint256"},{"name":"amount","type":"uint256"},{"name":"dueDate","type":"uint256"},{"name":"status","type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"getRemainingAmount","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
];

// ── LoanMarketplace ABI ──────────────────────────────────────────────────────
const MARKETPLACE_ABI = [
  // Events
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"},{"indexed":false,"name":"liquidity","type":"uint256"},{"indexed":false,"name":"interestRateBps","type":"uint256"}],"name":"OfferCreated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"}],"name":"OfferUpdated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"}],"name":"OfferPaused","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"}],"name":"OfferResumed","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"}],"name":"OfferClosed","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"LiquidityAdded","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"lender","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"LiquidityWithdrawn","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"LoanAllocated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"name":"offerId","type":"uint256"},{"indexed":true,"name":"loanId","type":"uint256"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"LoanRepaid","type":"event"},
  // Constructor
  {"inputs":[{"name":"_usdcToken","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},
  // Constants
  {"inputs":[],"name":"MAX_INTEREST_RATE","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MAX_INSTALLMENTS","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"offerCounter","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"usdcToken","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"loanPlatform","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
  // Write Functions
  {
    "inputs":[
      {"name":"_lenderName","type":"string"},
      {"name":"_lenderType","type":"uint8"},
      {"name":"_liquidityAmount","type":"uint256"},
      {"name":"_interestRateBps","type":"uint256"},
      {"name":"_maxInstallments","type":"uint256"},
      {"name":"_minLoanAmount","type":"uint256"},
      {"name":"_maxLoanAmount","type":"uint256"},
      {"name":"_acceptedCollateral","type":"uint8"},
      {"name":"_minCollateralRatioBps","type":"uint256"},
      {"name":"_geoRestrictions","type":"string"},
      {"name":"_borrowerPreferences","type":"string"}
    ],
    "name":"createOffer",
    "outputs":[{"name":"","type":"uint256"}],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[
      {"name":"offerId","type":"uint256"},
      {"name":"_interestRateBps","type":"uint256"},
      {"name":"_maxInstallments","type":"uint256"},
      {"name":"_minLoanAmount","type":"uint256"},
      {"name":"_maxLoanAmount","type":"uint256"},
      {"name":"_acceptedCollateral","type":"uint8"},
      {"name":"_minCollateralRatioBps","type":"uint256"},
      {"name":"_geoRestrictions","type":"string"},
      {"name":"_borrowerPreferences","type":"string"}
    ],
    "name":"updateOffer",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {"inputs":[{"name":"offerId","type":"uint256"}],"name":"pauseOffer","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"offerId","type":"uint256"}],"name":"resumeOffer","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"offerId","type":"uint256"},{"name":"amount","type":"uint256"}],"name":"addLiquidity","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"offerId","type":"uint256"},{"name":"amount","type":"uint256"}],"name":"withdrawLiquidity","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"offerId","type":"uint256"}],"name":"closeOffer","outputs":[],"stateMutability":"nonpayable","type":"function"},
  // Read Functions
  {
    "inputs":[{"name":"offerId","type":"uint256"}],
    "name":"getOffer",
    "outputs":[
      {"name":"id","type":"uint256"},
      {"name":"lender","type":"address"},
      {"name":"lenderName","type":"string"},
      {"name":"lenderType","type":"uint8"},
      {"name":"totalLiquidity","type":"uint256"},
      {"name":"availableLiquidity","type":"uint256"},
      {"name":"allocatedLiquidity","type":"uint256"},
      {"name":"interestRateBps","type":"uint256"},
      {"name":"maxInstallments","type":"uint256"},
      {"name":"minLoanAmount","type":"uint256"},
      {"name":"maxLoanAmount","type":"uint256"},
      {"name":"acceptedCollateral","type":"uint8"},
      {"name":"minCollateralRatioBps","type":"uint256"},
      {"name":"geoRestrictions","type":"string"},
      {"name":"status","type":"uint8"},
      {"name":"createdAt","type":"uint256"},
      {"name":"totalLoansIssued","type":"uint256"},
      {"name":"totalRepaid","type":"uint256"}
    ],
    "stateMutability":"view",
    "type":"function"
  },
  {"inputs":[{"name":"offerId","type":"uint256"}],"name":"getOfferActiveLoanIds","outputs":[{"name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"lender","type":"address"}],"name":"getLenderOfferIds","outputs":[{"name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getAllOfferIds","outputs":[{"name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getActiveOfferIds","outputs":[{"name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"loanId","type":"uint256"}],"name":"getLoanOfferId","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"offerId","type":"uint256"}],"name":"getUtilizationRate","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"offerId","type":"uint256"}],"name":"getEstimatedROI","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {
    "inputs":[
      {"name":"offerId","type":"uint256"},
      {"name":"loanAmount","type":"uint256"},
      {"name":"collateralType","type":"uint8"},
      {"name":"collateralRatioBps","type":"uint256"}
    ],
    "name":"isLoanCompatible",
    "outputs":[{"name":"","type":"bool"},{"name":"","type":"string"}],
    "stateMutability":"view",
    "type":"function"
  }
];

// ── ERC-20 ABI (USDC) ────────────────────────────────────────────────────────
const ERC20_ABI = [
  {"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"from","type":"address"},{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"stateMutability":"view","type":"function"}
];

// ── Status Maps ───────────────────────────────────────────────────────────────
const LOAN_STATUS = {
  0: 'PENDING', 1: 'APPROVED', 2: 'ACTIVE',
  3: 'COMPLETED', 4: 'DEFAULTED', 5: 'REJECTED', 6: 'CANCELLED'
};
const INSTALLMENT_STATUS = { 0: 'PENDING', 1: 'PAID', 2: 'OVERDUE' };
const COLLATERAL_TYPE    = { 0: 'NONE', 1: 'RWA', 2: 'CRYPTO' };
const OFFER_STATUS       = { 0: 'ACTIVE', 1: 'PAUSED', 2: 'CLOSED' };
const LENDER_TYPE        = { 0: 'Individual', 1: 'Company' };
const COLLATERAL_PREF    = { 1: 'RWA Only', 2: 'Crypto Only', 3: 'Both' };

// ── Export Globals ────────────────────────────────────────────────────────────
window.ARC_CHAIN_ID          = ARC_CHAIN_ID;
window.ARC_RPC_URL           = ARC_RPC_URL;
window.ARC_EXPLORER          = ARC_EXPLORER;
window.CONTRACT_ADDRESS      = CONTRACT_ADDRESS;
window.USDC_ADDRESS          = USDC_ADDRESS;
window.MARKETPLACE_ADDRESS   = MARKETPLACE_ADDRESS;
window.LOAN_ABI              = LOAN_ABI;
window.MARKETPLACE_ABI       = MARKETPLACE_ABI;
window.ERC20_ABI             = ERC20_ABI;
window.LOAN_STATUS           = LOAN_STATUS;
window.INSTALLMENT_STATUS    = INSTALLMENT_STATUS;
window.COLLATERAL_TYPE       = COLLATERAL_TYPE;
window.OFFER_STATUS          = OFFER_STATUS;
window.LENDER_TYPE           = LENDER_TYPE;
window.COLLATERAL_PREF       = COLLATERAL_PREF;
