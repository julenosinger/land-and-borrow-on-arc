// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LoanMarketplace
 * @notice Global decentralized loan marketplace on Arc Testnet (Chain ID: 5042002)
 * @dev Lenders create offers with locked USDC liquidity. Borrowers browse and apply.
 *      Links atomically to LoanPlatform.sol for execution.
 *      Fixed interest ≤ 5%/month, no compounding, hybrid RWA + Crypto collateral.
 */
contract LoanMarketplace is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 public constant MAX_INTEREST_RATE = 500;   // 5.00% in bps (basis points)
    uint256 public constant MAX_INSTALLMENTS  = 10;
    uint256 public constant MIN_COLLATERAL_RATIO = 12000; // 120.00% in bps

    // ── State ────────────────────────────────────────────────────────────────
    IERC20  public immutable usdcToken;
    address public loanPlatform;        // LoanPlatform contract address
    uint256 public offerCounter;

    // Collateral preference bitmask
    uint8 public constant COLLATERAL_NONE   = 0;
    uint8 public constant COLLATERAL_RWA    = 1;
    uint8 public constant COLLATERAL_CRYPTO = 2;
    uint8 public constant COLLATERAL_BOTH   = 3;

    // Offer status
    enum OfferStatus { ACTIVE, PAUSED, CLOSED }

    // Lender type
    enum LenderType { INDIVIDUAL, COMPANY }

    struct LenderOffer {
        uint256 id;
        address lender;
        string  lenderName;
        LenderType lenderType;
        // Liquidity
        uint256 totalLiquidity;       // Total USDC deposited (6 decimals)
        uint256 availableLiquidity;   // Unallocated USDC
        uint256 allocatedLiquidity;   // USDC locked in active loans
        // Terms
        uint256 interestRateBps;      // e.g. 300 = 3.00%/month
        uint256 maxInstallments;      // 1-10
        uint256 minLoanAmount;        // minimum loan size in USDC (6 dec)
        uint256 maxLoanAmount;        // maximum loan size in USDC (6 dec)
        // Preferences
        uint8   acceptedCollateral;   // bitmask: 1=RWA,2=Crypto,3=Both
        uint256 minCollateralRatioBps;// e.g. 12000 = 120%
        string  geoRestrictions;      // e.g. "US,EU" or "GLOBAL"
        string  borrowerPreferences;  // free-text profile note
        // State
        OfferStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        // Metrics
        uint256 totalLoansIssued;
        uint256 totalRepaid;          // USDC repaid (6 dec)
        uint256[] activeLoanIds;
    }

    // Loan-to-offer mapping
    mapping(uint256 => uint256) public loanToOffer;    // loanId => offerId
    mapping(uint256 => LenderOffer) public offers;
    mapping(address => uint256[]) public lenderOffers; // address => offerIds

    uint256[] public allOfferIds;

    // ── Events ───────────────────────────────────────────────────────────────
    event OfferCreated(uint256 indexed offerId, address indexed lender, uint256 liquidity, uint256 interestRateBps);
    event OfferUpdated(uint256 indexed offerId, address indexed lender);
    event OfferPaused(uint256 indexed offerId, address indexed lender);
    event OfferResumed(uint256 indexed offerId, address indexed lender);
    event OfferClosed(uint256 indexed offerId, address indexed lender);
    event LiquidityAdded(uint256 indexed offerId, address indexed lender, uint256 amount);
    event LiquidityWithdrawn(uint256 indexed offerId, address indexed lender, uint256 amount);
    event LoanAllocated(uint256 indexed offerId, uint256 indexed loanId, uint256 amount);
    event LoanRepaid(uint256 indexed offerId, uint256 indexed loanId, uint256 amount);
    event LoanPlatformSet(address indexed platform);

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(address _usdcToken) Ownable(msg.sender) {
        require(_usdcToken != address(0), "Invalid USDC address");
        usdcToken = IERC20(_usdcToken);
    }

    // ── Admin ────────────────────────────────────────────────────────────────
    function setLoanPlatform(address _platform) external onlyOwner {
        require(_platform != address(0), "Invalid platform address");
        loanPlatform = _platform;
        emit LoanPlatformSet(_platform);
    }

    // ── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyLender(uint256 offerId) {
        require(offers[offerId].lender == msg.sender, "Not offer owner");
        _;
    }

    modifier offerExists(uint256 offerId) {
        require(offerId > 0 && offerId <= offerCounter, "Offer does not exist");
        _;
    }

    // ── Lender: Create Offer ─────────────────────────────────────────────────
    /**
     * @notice Lender creates a marketplace offer and deposits USDC liquidity
     * @param _lenderName      Display name (person or company)
     * @param _lenderType      0=Individual, 1=Company
     * @param _liquidityAmount USDC to lock (6 decimals)
     * @param _interestRateBps Monthly rate in basis points (max 500 = 5%)
     * @param _maxInstallments 1-10 installments
     * @param _minLoanAmount   Minimum loan in USDC (6 dec)
     * @param _maxLoanAmount   Maximum loan in USDC (6 dec)
     * @param _acceptedCollateral Bitmask: 1=RWA, 2=Crypto, 3=Both
     * @param _minCollateralRatioBps Minimum collateral ratio (e.g. 12000=120%)
     * @param _geoRestrictions Comma-separated country codes or "GLOBAL"
     * @param _borrowerPreferences Free-text description of preferred borrowers
     */
    function createOffer(
        string  calldata _lenderName,
        uint8   _lenderType,
        uint256 _liquidityAmount,
        uint256 _interestRateBps,
        uint256 _maxInstallments,
        uint256 _minLoanAmount,
        uint256 _maxLoanAmount,
        uint8   _acceptedCollateral,
        uint256 _minCollateralRatioBps,
        string  calldata _geoRestrictions,
        string  calldata _borrowerPreferences
    ) external nonReentrant returns (uint256) {
        require(bytes(_lenderName).length > 0, "Lender name required");
        require(_liquidityAmount > 0, "Must deposit liquidity");
        require(_interestRateBps <= MAX_INTEREST_RATE, "Rate exceeds 5%/month");
        require(_maxInstallments >= 1 && _maxInstallments <= MAX_INSTALLMENTS, "Invalid installments (1-10)");
        require(_minLoanAmount > 0, "Min loan must be > 0");
        require(_maxLoanAmount >= _minLoanAmount, "Max loan < min loan");
        require(_maxLoanAmount <= _liquidityAmount, "Max loan exceeds liquidity");
        require(_acceptedCollateral >= 1 && _acceptedCollateral <= 3, "Invalid collateral preference");
        require(_minCollateralRatioBps >= MIN_COLLATERAL_RATIO, "Min ratio must be >= 120%");
        require(_lenderType <= 1, "Invalid lender type");

        // Transfer USDC from lender to this contract
        usdcToken.safeTransferFrom(msg.sender, address(this), _liquidityAmount);

        offerCounter++;
        uint256 offerId = offerCounter;

        LenderOffer storage offer = offers[offerId];
        offer.id                    = offerId;
        offer.lender                = msg.sender;
        offer.lenderName            = _lenderName;
        offer.lenderType            = LenderType(_lenderType);
        offer.totalLiquidity        = _liquidityAmount;
        offer.availableLiquidity    = _liquidityAmount;
        offer.allocatedLiquidity    = 0;
        offer.interestRateBps       = _interestRateBps;
        offer.maxInstallments       = _maxInstallments;
        offer.minLoanAmount         = _minLoanAmount;
        offer.maxLoanAmount         = _maxLoanAmount;
        offer.acceptedCollateral    = _acceptedCollateral;
        offer.minCollateralRatioBps = _minCollateralRatioBps;
        offer.geoRestrictions       = _geoRestrictions;
        offer.borrowerPreferences   = _borrowerPreferences;
        offer.status                = OfferStatus.ACTIVE;
        offer.createdAt             = block.timestamp;
        offer.updatedAt             = block.timestamp;
        offer.totalLoansIssued      = 0;
        offer.totalRepaid           = 0;

        lenderOffers[msg.sender].push(offerId);
        allOfferIds.push(offerId);

        emit OfferCreated(offerId, msg.sender, _liquidityAmount, _interestRateBps);
        return offerId;
    }

    // ── Lender: Update Offer (only if no active loans) ───────────────────────
    function updateOffer(
        uint256 offerId,
        uint256 _interestRateBps,
        uint256 _maxInstallments,
        uint256 _minLoanAmount,
        uint256 _maxLoanAmount,
        uint8   _acceptedCollateral,
        uint256 _minCollateralRatioBps,
        string  calldata _geoRestrictions,
        string  calldata _borrowerPreferences
    ) external onlyLender(offerId) offerExists(offerId) {
        LenderOffer storage offer = offers[offerId];
        require(offer.allocatedLiquidity == 0, "Cannot update while loans are active");
        require(_interestRateBps <= MAX_INTEREST_RATE, "Rate exceeds 5%/month");
        require(_maxInstallments >= 1 && _maxInstallments <= MAX_INSTALLMENTS, "Invalid installments");
        require(_minLoanAmount > 0, "Min loan > 0");
        require(_maxLoanAmount >= _minLoanAmount, "Max < Min");
        require(_acceptedCollateral >= 1 && _acceptedCollateral <= 3, "Invalid collateral");
        require(_minCollateralRatioBps >= MIN_COLLATERAL_RATIO, "Min ratio >= 120%");

        offer.interestRateBps       = _interestRateBps;
        offer.maxInstallments       = _maxInstallments;
        offer.minLoanAmount         = _minLoanAmount;
        offer.maxLoanAmount         = _maxLoanAmount;
        offer.acceptedCollateral    = _acceptedCollateral;
        offer.minCollateralRatioBps = _minCollateralRatioBps;
        offer.geoRestrictions       = _geoRestrictions;
        offer.borrowerPreferences   = _borrowerPreferences;
        offer.updatedAt             = block.timestamp;

        emit OfferUpdated(offerId, msg.sender);
    }

    // ── Lender: Pause / Resume ───────────────────────────────────────────────
    function pauseOffer(uint256 offerId) external onlyLender(offerId) offerExists(offerId) {
        require(offers[offerId].status == OfferStatus.ACTIVE, "Offer not active");
        offers[offerId].status    = OfferStatus.PAUSED;
        offers[offerId].updatedAt = block.timestamp;
        emit OfferPaused(offerId, msg.sender);
    }

    function resumeOffer(uint256 offerId) external onlyLender(offerId) offerExists(offerId) {
        require(offers[offerId].status == OfferStatus.PAUSED, "Offer not paused");
        offers[offerId].status    = OfferStatus.ACTIVE;
        offers[offerId].updatedAt = block.timestamp;
        emit OfferResumed(offerId, msg.sender);
    }

    // ── Lender: Add Liquidity ────────────────────────────────────────────────
    function addLiquidity(uint256 offerId, uint256 amount) external nonReentrant onlyLender(offerId) offerExists(offerId) {
        require(amount > 0, "Amount must be > 0");
        LenderOffer storage offer = offers[offerId];
        require(offer.status != OfferStatus.CLOSED, "Offer is closed");

        usdcToken.safeTransferFrom(msg.sender, address(this), amount);
        offer.totalLiquidity     += amount;
        offer.availableLiquidity += amount;
        offer.updatedAt           = block.timestamp;

        emit LiquidityAdded(offerId, msg.sender, amount);
    }

    // ── Lender: Withdraw Unused Liquidity ────────────────────────────────────
    function withdrawLiquidity(uint256 offerId, uint256 amount) external nonReentrant onlyLender(offerId) offerExists(offerId) {
        LenderOffer storage offer = offers[offerId];
        require(amount > 0, "Amount must be > 0");
        require(amount <= offer.availableLiquidity, "Insufficient available liquidity");

        offer.availableLiquidity -= amount;
        offer.totalLiquidity     -= amount;
        offer.updatedAt           = block.timestamp;

        usdcToken.safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(offerId, msg.sender, amount);
    }

    // ── Lender: Close Offer ──────────────────────────────────────────────────
    function closeOffer(uint256 offerId) external nonReentrant onlyLender(offerId) offerExists(offerId) {
        LenderOffer storage offer = offers[offerId];
        require(offer.status != OfferStatus.CLOSED, "Already closed");
        require(offer.allocatedLiquidity == 0, "Active loans still exist");

        // Refund all available liquidity
        uint256 refund = offer.availableLiquidity;
        offer.availableLiquidity = 0;
        offer.totalLiquidity     = 0;
        offer.status             = OfferStatus.CLOSED;
        offer.updatedAt          = block.timestamp;

        if (refund > 0) {
            usdcToken.safeTransfer(msg.sender, refund);
        }
        emit OfferClosed(offerId, msg.sender);
    }

    // ── Platform: Allocate Loan (called by LoanPlatform) ─────────────────────
    /**
     * @notice Called by LoanPlatform when a borrower accepts an offer and loan is disbursed
     * @dev Transfers USDC to LoanPlatform which then forwards to borrower
     */
    function allocateLoan(uint256 offerId, uint256 loanId, uint256 amount) external nonReentrant {
        require(msg.sender == loanPlatform, "Only LoanPlatform can allocate");
        LenderOffer storage offer = offers[offerId];
        require(offer.status == OfferStatus.ACTIVE, "Offer not active");
        require(amount <= offer.availableLiquidity, "Insufficient liquidity");
        require(amount >= offer.minLoanAmount, "Below min loan amount");
        require(amount <= offer.maxLoanAmount, "Exceeds max loan amount");

        offer.availableLiquidity  -= amount;
        offer.allocatedLiquidity  += amount;
        offer.totalLoansIssued    += 1;
        offer.activeLoanIds.push(loanId);
        loanToOffer[loanId]        = offerId;
        offer.updatedAt            = block.timestamp;

        // Transfer USDC to LoanPlatform for disbursement
        usdcToken.safeTransfer(loanPlatform, amount);

        emit LoanAllocated(offerId, loanId, amount);
    }

    // ── Platform: Record Repayment ───────────────────────────────────────────
    /**
     * @notice Called by LoanPlatform when borrower repays an installment
     * @dev USDC is already in LoanPlatform; this updates liquidity tracking
     */
    function recordRepayment(uint256 offerId, uint256 loanId, uint256 amount) external {
        require(msg.sender == loanPlatform, "Only LoanPlatform");
        LenderOffer storage offer = offers[offerId];

        offer.totalRepaid        += amount;
        offer.availableLiquidity += amount;
        // reduce allocated when loan completes (handle in LoanPlatform or here)
        offer.updatedAt           = block.timestamp;

        emit LoanRepaid(offerId, loanId, amount);
    }

    // ── Platform: Complete Loan ──────────────────────────────────────────────
    function completeLoan(uint256 offerId, uint256 loanId) external {
        require(msg.sender == loanPlatform, "Only LoanPlatform");
        LenderOffer storage offer = offers[offerId];

        // Find and remove from activeLoanIds
        uint256[] storage active = offer.activeLoanIds;
        for (uint256 i = 0; i < active.length; i++) {
            if (active[i] == loanId) {
                active[i] = active[active.length - 1];
                active.pop();
                break;
            }
        }

        // Move from allocated back to available (already done per installment in recordRepayment)
        // Safety: ensure no double-move
        offer.updatedAt = block.timestamp;
    }

    // ── Read Functions ────────────────────────────────────────────────────────
    function getOffer(uint256 offerId) external view offerExists(offerId) returns (
        uint256 id,
        address lender,
        string memory lenderName,
        uint8   lenderType,
        uint256 totalLiquidity,
        uint256 availableLiquidity,
        uint256 allocatedLiquidity,
        uint256 interestRateBps,
        uint256 maxInstallments,
        uint256 minLoanAmount,
        uint256 maxLoanAmount,
        uint8   acceptedCollateral,
        uint256 minCollateralRatioBps,
        string  memory geoRestrictions,
        uint8   status,
        uint256 createdAt,
        uint256 totalLoansIssued,
        uint256 totalRepaid
    ) {
        LenderOffer storage o = offers[offerId];
        return (
            o.id, o.lender, o.lenderName, uint8(o.lenderType),
            o.totalLiquidity, o.availableLiquidity, o.allocatedLiquidity,
            o.interestRateBps, o.maxInstallments, o.minLoanAmount, o.maxLoanAmount,
            o.acceptedCollateral, o.minCollateralRatioBps, o.geoRestrictions,
            uint8(o.status), o.createdAt, o.totalLoansIssued, o.totalRepaid
        );
    }

    function getOfferActiveLoanIds(uint256 offerId) external view offerExists(offerId) returns (uint256[] memory) {
        return offers[offerId].activeLoanIds;
    }

    function getLenderOfferIds(address lender) external view returns (uint256[] memory) {
        return lenderOffers[lender];
    }

    function getAllOfferIds() external view returns (uint256[] memory) {
        return allOfferIds;
    }

    function getActiveOfferIds() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < allOfferIds.length; i++) {
            if (offers[allOfferIds[i]].status == OfferStatus.ACTIVE) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allOfferIds.length; i++) {
            if (offers[allOfferIds[i]].status == OfferStatus.ACTIVE) {
                result[idx++] = allOfferIds[i];
            }
        }
        return result;
    }

    function getLoanOfferId(uint256 loanId) external view returns (uint256) {
        return loanToOffer[loanId];
    }

    /**
     * @notice Get utilization rate of an offer as percentage (0-100)
     */
    function getUtilizationRate(uint256 offerId) external view offerExists(offerId) returns (uint256) {
        LenderOffer storage o = offers[offerId];
        if (o.totalLiquidity == 0) return 0;
        return (o.allocatedLiquidity * 100) / o.totalLiquidity;
    }

    /**
     * @notice Calculate estimated ROI for an offer based on repayments
     */
    function getEstimatedROI(uint256 offerId) external view offerExists(offerId) returns (uint256) {
        LenderOffer storage o = offers[offerId];
        if (o.totalLiquidity == 0) return 0;
        // ROI in basis points
        uint256 principal = o.totalLiquidity - o.availableLiquidity;
        if (principal == 0) return 0;
        return (o.totalRepaid * 10000) / principal;
    }

    /**
     * @notice Check if a loan amount is compatible with an offer
     */
    function isLoanCompatible(
        uint256 offerId,
        uint256 loanAmount,
        uint8   collateralType,
        uint256 collateralRatioBps
    ) external view offerExists(offerId) returns (bool, string memory) {
        LenderOffer storage o = offers[offerId];
        if (o.status != OfferStatus.ACTIVE) return (false, "Offer not active");
        if (loanAmount < o.minLoanAmount) return (false, "Below min loan amount");
        if (loanAmount > o.maxLoanAmount) return (false, "Exceeds max loan amount");
        if (loanAmount > o.availableLiquidity) return (false, "Insufficient liquidity");
        if (collateralType == 2 && collateralRatioBps < o.minCollateralRatioBps) {
            return (false, "Collateral ratio too low");
        }
        // Check collateral preference
        bool colOk = false;
        if (o.acceptedCollateral == COLLATERAL_BOTH) colOk = true;
        else if (collateralType == 1 && o.acceptedCollateral == COLLATERAL_RWA) colOk = true;
        else if (collateralType == 2 && o.acceptedCollateral == COLLATERAL_CRYPTO) colOk = true;
        if (!colOk) return (false, "Collateral type not accepted");
        return (true, "");
    }
}
