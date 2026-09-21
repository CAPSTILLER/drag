// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IGateRegistry {
    function totalEligibleNFTs() external view returns (uint256);
    function isTokenEligible(address collection, uint256 tokenId) external view returns (bool);
}

contract DropVault {
    IERC20 public immutable drbToken;
    IERC20 public immutable gearToken;
    IGateRegistry public immutable gateRegistry;
    address public immutable oilEscrow;
    address public constant treasury = 0x31b18B3B0810a6693bA9982820b46e912f7ECd91;
    address public immutable adminNftAddress;
    uint256 public immutable adminTokenId;

    uint256 public constant HOLDER_WINDOW = 7 days;
    uint256 public constant SCAVENGER_WINDOW = 14 days;
    uint256 public constant SCAVENGER_GEAR_REQ = 1000 * 1e18;
    uint256 public constant TREASURY_BPS = 1000; // 10%
    uint256 public constant BPS_DENOMINATOR = 10000;

    struct Drop {
        uint256 dropId;
        uint256 timestamp;
        uint256 totalAmount;
        uint256 totalEligible;
        uint256 rewardPerToken;
    }

    uint256 public dropCount;
    mapping(uint256 => Drop) public drops;
    // dropId => collection => tokenId => claimed
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public isClaimed;

    event FundedFromEscrow(uint256 indexed dropId, uint256 netAmount, uint256 totalEligible, uint256 rewardPerToken, uint256 timestamp);
    event HolderClaimed(uint256 indexed dropId, address indexed collection, uint256 indexed tokenId, address holder, uint256 payout);
    event ScavengerClaimed(uint256 indexed dropId, address indexed collection, uint256 indexed tokenId, address scavenger, uint256 payout, uint256 treasuryFee);
    event ExpiredSwept(uint256 indexed dropId, address indexed collection, uint256 indexed tokenId, uint256 recycledToEscrow, uint256 treasuryFee);

    error OnlyOilEscrow();
    error NotAdminNftHolder();
    error ZeroEligibleNFTs();
    error PacketTooSmall();
    error DropNotFound();
    error AlreadyClaimed();
    error NotEligibleToken();
    error NotTokenOwner();
    error HolderWindowExpired();
    error ScavengerWindowNotOpen();
    error ScavengerWindowExpired();
    error InsufficientGearBalance();
    error SweepNotAvailableYet();

    modifier onlyOilEscrow() {
        if (msg.sender != oilEscrow) revert OnlyOilEscrow();
        _;
    }

    modifier onlyAdminNft() {
        if (IERC721(adminNftAddress).ownerOf(adminTokenId) != msg.sender) {
            revert NotAdminNftHolder();
        }
        _;
    }

    constructor(
        address _drbToken,
        address _gearToken,
        address _gateRegistry,
        address _oilEscrow,
        address _adminNftAddress,
        uint256 _adminTokenId
    ) {
        drbToken = IERC20(_drbToken);
        gearToken = IERC20(_gearToken);
        gateRegistry = IGateRegistry(_gateRegistry);
        oilEscrow = _oilEscrow;
        adminNftAddress = _adminNftAddress;
        adminTokenId = _adminTokenId;
    }

    function fundFromEscrow(uint256 netAmount) external onlyOilEscrow {
        uint256 eligibleCount = gateRegistry.totalEligibleNFTs();
        if (eligibleCount == 0) revert ZeroEligibleNFTs();

        uint256 rewardPerToken = netAmount / eligibleCount;
        if (rewardPerToken == 0) revert PacketTooSmall();

        uint256 currentDropId = dropCount++;
        drops[currentDropId] = Drop({
            dropId: currentDropId,
            timestamp: block.timestamp,
            totalAmount: netAmount,
            totalEligible: eligibleCount,
            rewardPerToken: rewardPerToken
        });

        emit FundedFromEscrow(currentDropId, netAmount, eligibleCount, rewardPerToken, block.timestamp);
    }

    function claimHolder(uint256 dropId, address collection, uint256 tokenId) external {
        Drop memory drop = drops[dropId];
        if (drop.totalAmount == 0) revert DropNotFound();
        if (block.timestamp > drop.timestamp + HOLDER_WINDOW) revert HolderWindowExpired();
        if (isClaimed[dropId][collection][tokenId]) revert AlreadyClaimed();
        if (!gateRegistry.isTokenEligible(collection, tokenId)) revert NotEligibleToken();
        if (IERC721(collection).ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        isClaimed[dropId][collection][tokenId] = true;
        bool ok = drbToken.transfer(msg.sender, drop.rewardPerToken);
        require(ok, "Transfer failed");

        emit HolderClaimed(dropId, collection, tokenId, msg.sender, drop.rewardPerToken);
    }

    function claimScavenger(uint256 dropId, address collection, uint256 tokenId) external {
        Drop memory drop = drops[dropId];
        if (drop.totalAmount == 0) revert DropNotFound();
        if (block.timestamp <= drop.timestamp + HOLDER_WINDOW) revert ScavengerWindowNotOpen();
        if (block.timestamp > drop.timestamp + SCAVENGER_WINDOW) revert ScavengerWindowExpired();
        if (isClaimed[dropId][collection][tokenId]) revert AlreadyClaimed();
        if (!gateRegistry.isTokenEligible(collection, tokenId)) revert NotEligibleToken();
        if (gearToken.balanceOf(msg.sender) < SCAVENGER_GEAR_REQ) revert InsufficientGearBalance();

        isClaimed[dropId][collection][tokenId] = true;
        uint256 fee = (drop.rewardPerToken * TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 scavengerShare = drop.rewardPerToken - fee;

        bool feeOk = drbToken.transfer(treasury, fee);
        require(feeOk, "Treasury fee failed");
        bool payoutOk = drbToken.transfer(msg.sender, scavengerShare);
        require(payoutOk, "Scavenger payout failed");

        emit ScavengerClaimed(dropId, collection, tokenId, msg.sender, scavengerShare, fee);
    }

    function sweepExpired(uint256 dropId, address collection, uint256 tokenId) external onlyAdminNft {
        Drop memory drop = drops[dropId];
        if (drop.totalAmount == 0) revert DropNotFound();
        if (block.timestamp <= drop.timestamp + SCAVENGER_WINDOW) revert SweepNotAvailableYet();
        if (isClaimed[dropId][collection][tokenId]) revert AlreadyClaimed();
        if (!gateRegistry.isTokenEligible(collection, tokenId)) revert NotEligibleToken();

        isClaimed[dropId][collection][tokenId] = true;
        uint256 fee = (drop.rewardPerToken * TREASURY_BPS) / BPS_DENOMINATOR;
        uint256 recycleAmount = drop.rewardPerToken - fee;

        bool feeOk = drbToken.transfer(treasury, fee);
        require(feeOk, "Treasury fee failed");
        bool recycleOk = drbToken.transfer(oilEscrow, recycleAmount);
        require(recycleOk, "Recycle to escrow failed");

        emit ExpiredSwept(dropId, collection, tokenId, recycleAmount, fee);
    }
}
