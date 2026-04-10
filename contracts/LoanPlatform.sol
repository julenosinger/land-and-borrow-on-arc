// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LoanPlatform
 * @notice Production-grade decentralized lending platform for Arc Testnet (Chain ID: 5042002)
 * @dev Supports RWA + Crypto collateral, USDC payments, installment tracking
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract LoanPlatform {
    // ─── Enums ────────────────────────────────────────────────────────────────
    enum LoanStatus {
        PENDING,        // Awaiting lender approval
        APPROVED,       // Lender approved, awaiting USDC disbursement
        ACTIVE,         // USDC disbursed, repayments in progress
        COMPLETED,      // All installments paid
        DEFAULTED,      // Borrower defaulted
        REJECTED,       // Lender rejected
        CANCELLED       // Cancelled by borrower before approval
    }

    enum CollateralType {
        NONE,
        RWA,            // Real World Asset (offchain enforcement)
        CRYPTO          // ERC-20 token locked in contract
    }

    enum InstallmentStatus {
        PENDING,
        PAID,
        OVERDUE
    }

    // ─── Structs ──────────────────────────────────────────────────────────────
    struct BorrowerInfo {
        string fullName;
        string email;
        string country;
        string city;
        string employmentStatus; // optional
    }

    struct CollateralInfo {
        CollateralType colType;
        // RWA fields
        string assetType;
        string description;
        uint256 estimatedValueUSD; // in USD cents (6 decimals USDC-style)
        string jurisdiction;
        bytes32 documentHash;      // IPFS hash stored as bytes32
        string documentURI;        // IPFS URI for off-chain doc
        bool rwaVerified;          // set by lender/admin
        // Crypto fields
        address cryptoToken;       // ERC-20 token address (USDC, ETH-wrapped, etc.)
        uint256 cryptoAmount;      // amount locked
        uint256 collateralRatio;   // basis points, e.g. 12000 = 120%
        bool cryptoLocked;         // true once locked
    }

    struct Installment {
        uint256 amount;            // USDC amount (6 decimals)
        uint256 dueDate;           // Unix timestamp
        uint256 paidDate;          // 0 if not yet paid
        bytes32 txHash;            // transaction reference (stored by payer)
        InstallmentStatus status;
    }

    struct Loan {
        uint256 id;
        address borrower;
        address lender;
        BorrowerInfo borrowerInfo;
        uint256 principalAmount;   // USDC (6 decimals)
        uint256 interestRateMonthly; // basis points, max 500 (5%)
        uint256 totalInstallments;
        uint256 installmentAmount; // fixed, no compounding
        uint256 totalRepayable;
        uint256 paidInstallments;
        uint256 disbursedAt;
        uint256 createdAt;
        LoanStatus status;
        CollateralInfo collateral;
        Installment[] installments;
        bytes32[] receiptHashes;   // onchain receipt log
    }

    // ─── State Variables ──────────────────────────────────────────────────────
    address public owner;
    address public usdcToken;
    uint256 public loanCounter;
    uint256 public constant MAX_INTEREST_RATE = 500; // 5% per month in basis points
    uint256 public constant MIN_COLLATERAL_RATIO = 12000; // 120% in basis points

    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public borrowerLoans;
    mapping(address => uint256[]) public lenderLoans;
    mapping(bytes32 => bool) public usedDocumentHashes;

    // ─── Events ───────────────────────────────────────────────────────────────
    event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event LoanApproved(uint256 indexed loanId, address indexed lender, uint256 interestRate);
    event LoanRejected(uint256 indexed loanId, address indexed lender);
    event LoanDisbursed(uint256 indexed loanId, uint256 amount, uint256 timestamp);
    event InstallmentPaid(uint256 indexed loanId, uint256 installmentIndex, uint256 amount, bytes32 txHash);
    event LoanCompleted(uint256 indexed loanId);
    event LoanDefaulted(uint256 indexed loanId);
    event CollateralLocked(uint256 indexed loanId, address token, uint256 amount);
    event CollateralReleased(uint256 indexed loanId, address token, uint256 amount);
    event CollateralLiquidated(uint256 indexed loanId, address token, uint256 amount, address recipient);
    event RWAVerified(uint256 indexed loanId, bytes32 documentHash);
    event ReceiptGenerated(uint256 indexed loanId, bytes32 receiptHash, uint256 timestamp);
    event LoanCancelled(uint256 indexed loanId);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyBorrower(uint256 loanId) {
        require(loans[loanId].borrower == msg.sender, "Not borrower");
        _;
    }

    modifier onlyLender(uint256 loanId) {
        require(loans[loanId].lender == msg.sender, "Not lender");
        _;
    }

    modifier loanExists(uint256 loanId) {
        require(loanId > 0 && loanId <= loanCounter, "Loan does not exist");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address _usdcToken) {
        owner = msg.sender;
        usdcToken = _usdcToken;
    }

    // ─── Loan Creation ────────────────────────────────────────────────────────
    /**
     * @notice Create a new loan request with RWA collateral
     */
    function createLoanWithRWA(
        BorrowerInfo calldata _borrowerInfo,
        uint256 _principalAmount,
        uint256 _installments,
        string calldata _assetType,
        string calldata _description,
        uint256 _estimatedValueUSD,
        string calldata _jurisdiction,
        bytes32 _documentHash,
        string calldata _documentURI
    ) external returns (uint256) {
        require(_principalAmount > 0, "Amount must be > 0");
        require(_installments >= 1 && _installments <= 10, "Installments: 1-10");
        require(bytes(_borrowerInfo.fullName).length > 0, "Full name required");
        require(bytes(_borrowerInfo.email).length > 0, "Email required");
        require(bytes(_borrowerInfo.country).length > 0, "Country required");
        require(bytes(_borrowerInfo.city).length > 0, "City required");
        require(_documentHash != bytes32(0), "Document hash required");
        require(!usedDocumentHashes[_documentHash], "Document already used");
        require(_estimatedValueUSD > 0, "Collateral value required");

        usedDocumentHashes[_documentHash] = true;
        loanCounter++;
        uint256 loanId = loanCounter;

        Loan storage loan = loans[loanId];
        loan.id = loanId;
        loan.borrower = msg.sender;
        loan.borrowerInfo = _borrowerInfo;
        loan.principalAmount = _principalAmount;
        loan.totalInstallments = _installments;
        loan.createdAt = block.timestamp;
        loan.status = LoanStatus.PENDING;

        loan.collateral.colType = CollateralType.RWA;
        loan.collateral.assetType = _assetType;
        loan.collateral.description = _description;
        loan.collateral.estimatedValueUSD = _estimatedValueUSD;
        loan.collateral.jurisdiction = _jurisdiction;
        loan.collateral.documentHash = _documentHash;
        loan.collateral.documentURI = _documentURI;

        borrowerLoans[msg.sender].push(loanId);

        emit LoanCreated(loanId, msg.sender, _principalAmount);
        return loanId;
    }

    /**
     * @notice Create a new loan request with Crypto collateral (locks ERC-20)
     */
    function createLoanWithCrypto(
        BorrowerInfo calldata _borrowerInfo,
        uint256 _principalAmount,
        uint256 _installments,
        address _collateralToken,
        uint256 _collateralAmount,
        uint256 _collateralRatioBps
    ) external returns (uint256) {
        require(_principalAmount > 0, "Amount must be > 0");
        require(_installments >= 1 && _installments <= 10, "Installments: 1-10");
        require(bytes(_borrowerInfo.fullName).length > 0, "Full name required");
        require(bytes(_borrowerInfo.email).length > 0, "Email required");
        require(bytes(_borrowerInfo.country).length > 0, "Country required");
        require(bytes(_borrowerInfo.city).length > 0, "City required");
        require(_collateralToken != address(0), "Invalid collateral token");
        require(_collateralAmount > 0, "Collateral amount required");
        require(_collateralRatioBps >= MIN_COLLATERAL_RATIO, "Ratio must be >= 120%");

        // Lock collateral from borrower
        IERC20 token = IERC20(_collateralToken);
        require(token.allowance(msg.sender, address(this)) >= _collateralAmount, "Insufficient allowance");
        require(token.transferFrom(msg.sender, address(this), _collateralAmount), "Transfer failed");

        loanCounter++;
        uint256 loanId = loanCounter;

        Loan storage loan = loans[loanId];
        loan.id = loanId;
        loan.borrower = msg.sender;
        loan.borrowerInfo = _borrowerInfo;
        loan.principalAmount = _principalAmount;
        loan.totalInstallments = _installments;
        loan.createdAt = block.timestamp;
        loan.status = LoanStatus.PENDING;

        loan.collateral.colType = CollateralType.CRYPTO;
        loan.collateral.cryptoToken = _collateralToken;
        loan.collateral.cryptoAmount = _collateralAmount;
        loan.collateral.collateralRatio = _collateralRatioBps;
        loan.collateral.cryptoLocked = true;

        borrowerLoans[msg.sender].push(loanId);

        emit LoanCreated(loanId, msg.sender, _principalAmount);
        emit CollateralLocked(loanId, _collateralToken, _collateralAmount);
        return loanId;
    }

    // ─── Lender Actions ───────────────────────────────────────────────────────
    /**
     * @notice Lender approves a loan request and sets interest rate
     * @param _interestRateBps Monthly interest rate in basis points (max 500 = 5%)
     * @param _installmentDays Days between installments (e.g., 30 for monthly)
     */
    function approveLoan(
        uint256 loanId,
        uint256 _interestRateBps,
        uint256 _installmentDays
    ) external loanExists(loanId) {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.PENDING, "Loan not pending");
        require(_interestRateBps <= MAX_INTEREST_RATE, "Interest rate too high");
        require(_installmentDays >= 1 && _installmentDays <= 365, "Invalid installment days");

        loan.lender = msg.sender;
        loan.interestRateMonthly = _interestRateBps;
        loan.status = LoanStatus.APPROVED;

        // Fixed interest: totalInterest = principal * rate * months
        // No compounding
        uint256 n = loan.totalInstallments;
        // Months = installmentDays / 30 (approximate)
        uint256 totalInterest = (loan.principalAmount * _interestRateBps * n * _installmentDays) / (30 * 10000);
        loan.totalRepayable = loan.principalAmount + totalInterest;
        loan.installmentAmount = loan.totalRepayable / n;

        // Build installment schedule
        uint256 dueDateBase = block.timestamp;
        for (uint256 i = 0; i < n; i++) {
            dueDateBase += _installmentDays * 1 days;
            loan.installments.push(Installment({
                amount: (i == n - 1)
                    ? loan.totalRepayable - (loan.installmentAmount * (n - 1))
                    : loan.installmentAmount,
                dueDate: dueDateBase,
                paidDate: 0,
                txHash: bytes32(0),
                status: InstallmentStatus.PENDING
            }));
        }

        lenderLoans[msg.sender].push(loanId);
        emit LoanApproved(loanId, msg.sender, _interestRateBps);
    }

    /**
     * @notice Lender rejects a loan request (releases crypto collateral if applicable)
     */
    function rejectLoan(uint256 loanId) external loanExists(loanId) {
        Loan storage loan = loans[loanId];
        require(loan.lender == msg.sender || (loan.lender == address(0) && msg.sender == owner), "Not authorized");
        require(loan.status == LoanStatus.PENDING, "Loan not pending");

        loan.status = LoanStatus.REJECTED;

        // Release crypto collateral
        if (loan.collateral.colType == CollateralType.CRYPTO && loan.collateral.cryptoLocked) {
            _releaseCryptoCollateral(loanId);
        }

        emit LoanRejected(loanId, msg.sender);
    }

    /**
     * @notice Lender verifies RWA document
     */
    function verifyRWA(uint256 loanId) external loanExists(loanId) {
        Loan storage loan = loans[loanId];
        require(loan.lender == msg.sender || msg.sender == owner, "Not authorized");
        require(loan.collateral.colType == CollateralType.RWA, "Not RWA loan");
        loan.collateral.rwaVerified = true;
        emit RWAVerified(loanId, loan.collateral.documentHash);
    }

    /**
     * @notice Lender disburses USDC to borrower (must pre-approve USDC transfer)
     */
    function disburseLoan(uint256 loanId) external loanExists(loanId) onlyLender(loanId) {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.APPROVED, "Loan not approved");

        IERC20 usdc = IERC20(usdcToken);
        require(usdc.allowance(msg.sender, address(this)) >= loan.principalAmount, "Insufficient USDC allowance");
        require(usdc.transferFrom(msg.sender, loan.borrower, loan.principalAmount), "USDC transfer failed");

        loan.status = LoanStatus.ACTIVE;
        loan.disbursedAt = block.timestamp;

        emit LoanDisbursed(loanId, loan.principalAmount, block.timestamp);
    }

    // ─── Repayment ────────────────────────────────────────────────────────────
    /**
     * @notice Pay a specific installment
     */
    function payInstallment(uint256 loanId, uint256 installmentIndex, bytes32 _txHash)
        external loanExists(loanId) onlyBorrower(loanId)
    {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.ACTIVE, "Loan not active");
        require(installmentIndex < loan.totalInstallments, "Invalid installment index");

        Installment storage inst = loan.installments[installmentIndex];
        require(inst.status == InstallmentStatus.PENDING, "Already paid or overdue");

        uint256 amount = inst.amount;
        IERC20 usdc = IERC20(usdcToken);
        require(usdc.allowance(msg.sender, address(this)) >= amount, "Insufficient USDC allowance");
        require(usdc.transferFrom(msg.sender, loan.lender, amount), "USDC transfer failed");

        inst.paidDate = block.timestamp;
        inst.txHash = _txHash;
        inst.status = InstallmentStatus.PAID;
        loan.paidInstallments++;

        // Generate receipt hash
        bytes32 receiptHash = keccak256(abi.encodePacked(
            loanId, installmentIndex, amount, block.timestamp, msg.sender, loan.lender
        ));
        loan.receiptHashes.push(receiptHash);
        emit ReceiptGenerated(loanId, receiptHash, block.timestamp);
        emit InstallmentPaid(loanId, installmentIndex, amount, _txHash);

        // Check completion
        if (loan.paidInstallments == loan.totalInstallments) {
            loan.status = LoanStatus.COMPLETED;
            if (loan.collateral.colType == CollateralType.CRYPTO && loan.collateral.cryptoLocked) {
                _releaseCryptoCollateral(loanId);
            }
            emit LoanCompleted(loanId);
        }
    }

    /**
     * @notice Pay the next pending installment (convenience function)
     */
    function payNextInstallment(uint256 loanId, bytes32 _txHash)
        external loanExists(loanId) onlyBorrower(loanId)
    {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.ACTIVE, "Loan not active");

        for (uint256 i = 0; i < loan.totalInstallments; i++) {
            if (loan.installments[i].status == InstallmentStatus.PENDING) {
                // delegate to payInstallment logic
                Installment storage inst = loan.installments[i];
                uint256 amount = inst.amount;
                IERC20 usdc = IERC20(usdcToken);
                require(usdc.allowance(msg.sender, address(this)) >= amount, "Insufficient USDC allowance");
                require(usdc.transferFrom(msg.sender, loan.lender, amount), "USDC transfer failed");

                inst.paidDate = block.timestamp;
                inst.txHash = _txHash;
                inst.status = InstallmentStatus.PAID;
                loan.paidInstallments++;

                bytes32 receiptHash = keccak256(abi.encodePacked(
                    loanId, i, amount, block.timestamp, msg.sender, loan.lender
                ));
                loan.receiptHashes.push(receiptHash);
                emit ReceiptGenerated(loanId, receiptHash, block.timestamp);
                emit InstallmentPaid(loanId, i, amount, _txHash);

                if (loan.paidInstallments == loan.totalInstallments) {
                    loan.status = LoanStatus.COMPLETED;
                    if (loan.collateral.colType == CollateralType.CRYPTO && loan.collateral.cryptoLocked) {
                        _releaseCryptoCollateral(loanId);
                    }
                    emit LoanCompleted(loanId);
                }
                return;
            }
        }
        revert("No pending installments");
    }

    // ─── Cancellation ─────────────────────────────────────────────────────────
    /**
     * @notice Borrower cancels loan before approval
     */
    function cancelLoan(uint256 loanId) external loanExists(loanId) onlyBorrower(loanId) {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.PENDING, "Can only cancel pending loans");

        loan.status = LoanStatus.CANCELLED;

        if (loan.collateral.colType == CollateralType.CRYPTO && loan.collateral.cryptoLocked) {
            _releaseCryptoCollateral(loanId);
        }

        emit LoanCancelled(loanId);
    }

    // ─── Liquidation ──────────────────────────────────────────────────────────
    /**
     * @notice Owner/lender marks loan as defaulted and liquidates crypto collateral
     */
    function liquidateCollateral(uint256 loanId) external loanExists(loanId) {
        Loan storage loan = loans[loanId];
        require(loan.lender == msg.sender || msg.sender == owner, "Not authorized");
        require(loan.status == LoanStatus.ACTIVE, "Loan not active");
        require(loan.collateral.colType == CollateralType.CRYPTO, "No crypto collateral");
        require(loan.collateral.cryptoLocked, "Collateral not locked");

        // Check any installment is overdue (past due date by more than grace period 3 days)
        bool hasOverdue = false;
        for (uint256 i = 0; i < loan.totalInstallments; i++) {
            if (loan.installments[i].status == InstallmentStatus.PENDING &&
                block.timestamp > loan.installments[i].dueDate + 3 days) {
                hasOverdue = true;
                break;
            }
        }
        require(hasOverdue, "No overdue installments");

        loan.status = LoanStatus.DEFAULTED;
        IERC20 token = IERC20(loan.collateral.cryptoToken);
        uint256 amount = loan.collateral.cryptoAmount;
        loan.collateral.cryptoLocked = false;
        loan.collateral.cryptoAmount = 0;

        require(token.transfer(loan.lender, amount), "Liquidation transfer failed");

        emit LoanDefaulted(loanId);
        emit CollateralLiquidated(loanId, loan.collateral.cryptoToken, amount, loan.lender);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────
    function _releaseCryptoCollateral(uint256 loanId) internal {
        Loan storage loan = loans[loanId];
        address token = loan.collateral.cryptoToken;
        uint256 amount = loan.collateral.cryptoAmount;
        loan.collateral.cryptoLocked = false;
        loan.collateral.cryptoAmount = 0;

        require(IERC20(token).transfer(loan.borrower, amount), "Collateral release failed");
        emit CollateralReleased(loanId, token, amount);
    }

    // ─── Views ────────────────────────────────────────────────────────────────
    function getLoanInstallments(uint256 loanId) external view loanExists(loanId)
        returns (Installment[] memory)
    {
        return loans[loanId].installments;
    }

    function getLoanReceipts(uint256 loanId) external view loanExists(loanId)
        returns (bytes32[] memory)
    {
        return loans[loanId].receiptHashes;
    }

    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    function getLenderLoans(address lender) external view returns (uint256[] memory) {
        return lenderLoans[lender];
    }

    function getAllLoanIds() external view returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](loanCounter);
        for (uint256 i = 0; i < loanCounter; i++) {
            ids[i] = i + 1;
        }
        return ids;
    }

    function getLoanBasic(uint256 loanId) external view loanExists(loanId) returns (
        uint256 id,
        address borrower,
        address lender,
        uint256 principalAmount,
        uint256 interestRateMonthly,
        uint256 totalInstallments,
        uint256 installmentAmount,
        uint256 totalRepayable,
        uint256 paidInstallments,
        uint256 disbursedAt,
        uint256 createdAt,
        LoanStatus status
    ) {
        Loan storage loan = loans[loanId];
        return (
            loan.id,
            loan.borrower,
            loan.lender,
            loan.principalAmount,
            loan.interestRateMonthly,
            loan.totalInstallments,
            loan.installmentAmount,
            loan.totalRepayable,
            loan.paidInstallments,
            loan.disbursedAt,
            loan.createdAt,
            loan.status
        );
    }

    function getCollateral(uint256 loanId) external view loanExists(loanId) returns (CollateralInfo memory) {
        return loans[loanId].collateral;
    }

    function getBorrowerInfo(uint256 loanId) external view loanExists(loanId) returns (BorrowerInfo memory) {
        return loans[loanId].borrowerInfo;
    }

    function getNextPendingInstallment(uint256 loanId) external view loanExists(loanId)
        returns (uint256 index, uint256 amount, uint256 dueDate, InstallmentStatus status)
    {
        Loan storage loan = loans[loanId];
        for (uint256 i = 0; i < loan.totalInstallments; i++) {
            if (loan.installments[i].status == InstallmentStatus.PENDING) {
                return (i, loan.installments[i].amount, loan.installments[i].dueDate, loan.installments[i].status);
            }
        }
        revert("No pending installments");
    }

    function getRemainingAmount(uint256 loanId) external view loanExists(loanId) returns (uint256) {
        Loan storage loan = loans[loanId];
        uint256 remaining = 0;
        for (uint256 i = 0; i < loan.totalInstallments; i++) {
            if (loan.installments[i].status == InstallmentStatus.PENDING) {
                remaining += loan.installments[i].amount;
            }
        }
        return remaining;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────
    function setUSDCToken(address _newUsdc) external onlyOwner {
        usdcToken = _newUsdc;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }
}
