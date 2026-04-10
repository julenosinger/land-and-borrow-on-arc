// Arc Testnet Configuration
const ARC_CHAIN_ID = 5042002;
const ARC_RPC_URL = "https://rpc.arc.fun";
const ARC_EXPLORER = "https://explorer.arc.fun";

// Contract Addresses (deploy to Arc Testnet)
// These will be set after deployment - update with actual deployed addresses
const CONTRACT_ADDRESS = window.LOAN_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = window.USDC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

// LoanPlatform ABI
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
  // State Variables
  {"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"usdcToken","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"loanCounter","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MAX_INTEREST_RATE","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  // Write Functions
  {
    "inputs":[
      {"components":[{"name":"fullName","type":"string"},{"name":"email","type":"string"},{"name":"country","type":"string"},{"name":"city","type":"string"},{"name":"employmentStatus","type":"string"}],"name":"_borrowerInfo","type":"tuple"},
      {"name":"_principalAmount","type":"uint256"},
      {"name":"_installments","type":"uint256"},
      {"name":"_assetType","type":"string"},
      {"name":"_description","type":"string"},
      {"name":"_estimatedValueUSD","type":"uint256"},
      {"name":"_jurisdiction","type":"string"},
      {"name":"_documentHash","type":"bytes32"},
      {"name":"_documentURI","type":"string"}
    ],
    "name":"createLoanWithRWA",
    "outputs":[{"name":"","type":"uint256"}],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[
      {"components":[{"name":"fullName","type":"string"},{"name":"email","type":"string"},{"name":"country","type":"string"},{"name":"city","type":"string"},{"name":"employmentStatus","type":"string"}],"name":"_borrowerInfo","type":"tuple"},
      {"name":"_principalAmount","type":"uint256"},
      {"name":"_installments","type":"uint256"},
      {"name":"_collateralToken","type":"address"},
      {"name":"_collateralAmount","type":"uint256"},
      {"name":"_collateralRatioBps","type":"uint256"}
    ],
    "name":"createLoanWithCrypto",
    "outputs":[{"name":"","type":"uint256"}],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"},{"name":"_interestRateBps","type":"uint256"},{"name":"_installmentDays","type":"uint256"}],
    "name":"approveLoan",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"rejectLoan",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"verifyRWA",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"disburseLoan",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"},{"name":"installmentIndex","type":"uint256"},{"name":"_txHash","type":"bytes32"}],
    "name":"payInstallment",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"},{"name":"_txHash","type":"bytes32"}],
    "name":"payNextInstallment",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"cancelLoan",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"liquidateCollateral",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  // Read Functions
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"getLoanInstallments",
    "outputs":[{"components":[{"name":"amount","type":"uint256"},{"name":"dueDate","type":"uint256"},{"name":"paidDate","type":"uint256"},{"name":"txHash","type":"bytes32"},{"name":"status","type":"uint8"}],"name":"","type":"tuple[]"}],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"getLoanReceipts",
    "outputs":[{"name":"","type":"bytes32[]"}],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[{"name":"borrower","type":"address"}],
    "name":"getBorrowerLoans",
    "outputs":[{"name":"","type":"uint256[]"}],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[{"name":"lender","type":"address"}],
    "name":"getLenderLoans",
    "outputs":[{"name":"","type":"uint256[]"}],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[],
    "name":"getAllLoanIds",
    "outputs":[{"name":"","type":"uint256[]"}],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"getLoanBasic",
    "outputs":[
      {"name":"id","type":"uint256"},
      {"name":"borrower","type":"address"},
      {"name":"lender","type":"address"},
      {"name":"principalAmount","type":"uint256"},
      {"name":"interestRateMonthly","type":"uint256"},
      {"name":"totalInstallments","type":"uint256"},
      {"name":"installmentAmount","type":"uint256"},
      {"name":"totalRepayable","type":"uint256"},
      {"name":"paidInstallments","type":"uint256"},
      {"name":"disbursedAt","type":"uint256"},
      {"name":"createdAt","type":"uint256"},
      {"name":"status","type":"uint8"}
    ],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"getCollateral",
    "outputs":[{"components":[
      {"name":"colType","type":"uint8"},
      {"name":"assetType","type":"string"},
      {"name":"description","type":"string"},
      {"name":"estimatedValueUSD","type":"uint256"},
      {"name":"jurisdiction","type":"string"},
      {"name":"documentHash","type":"bytes32"},
      {"name":"documentURI","type":"string"},
      {"name":"rwaVerified","type":"bool"},
      {"name":"cryptoToken","type":"address"},
      {"name":"cryptoAmount","type":"uint256"},
      {"name":"collateralRatio","type":"uint256"},
      {"name":"cryptoLocked","type":"bool"}
    ],"name":"","type":"tuple"}],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"getBorrowerInfo",
    "outputs":[{"components":[
      {"name":"fullName","type":"string"},
      {"name":"email","type":"string"},
      {"name":"country","type":"string"},
      {"name":"city","type":"string"},
      {"name":"employmentStatus","type":"string"}
    ],"name":"","type":"tuple"}],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"getNextPendingInstallment",
    "outputs":[
      {"name":"index","type":"uint256"},
      {"name":"amount","type":"uint256"},
      {"name":"dueDate","type":"uint256"},
      {"name":"status","type":"uint8"}
    ],
    "stateMutability":"view",
    "type":"function"
  },
  {
    "inputs":[{"name":"loanId","type":"uint256"}],
    "name":"getRemainingAmount",
    "outputs":[{"name":"","type":"uint256"}],
    "stateMutability":"view",
    "type":"function"
  }
];

// ERC-20 ABI (USDC)
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

// Loan status mapping
const LOAN_STATUS = {
  0: 'PENDING',
  1: 'APPROVED',
  2: 'ACTIVE',
  3: 'COMPLETED',
  4: 'DEFAULTED',
  5: 'REJECTED',
  6: 'CANCELLED'
};

const INSTALLMENT_STATUS = {
  0: 'PENDING',
  1: 'PAID',
  2: 'OVERDUE'
};

const COLLATERAL_TYPE = {
  0: 'NONE',
  1: 'RWA',
  2: 'CRYPTO'
};

// Export globals
window.ARC_CHAIN_ID = ARC_CHAIN_ID;
window.ARC_RPC_URL = ARC_RPC_URL;
window.ARC_EXPLORER = ARC_EXPLORER;
window.CONTRACT_ADDRESS = CONTRACT_ADDRESS;
window.USDC_ADDRESS = USDC_ADDRESS;
window.LOAN_ABI = LOAN_ABI;
window.ERC20_ABI = ERC20_ABI;
window.LOAN_STATUS = LOAN_STATUS;
window.INSTALLMENT_STATUS = INSTALLMENT_STATUS;
window.COLLATERAL_TYPE = COLLATERAL_TYPE;
