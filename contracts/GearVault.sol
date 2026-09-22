// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title GearVault
 * @notice Vault holding and dispensing GEAR tools for CAPs Garage.
 * @dev Enforces a 3-second global cooldown on claims/dispensing, plus per-wallet protection.
 */
contract GearVault {
    IERC20 public immutable gearToken;
    address public immutable adminNftAddress;
    uint256 public immutable adminTokenId;

    uint256 public constant GLOBAL_COOLDOWN = 3 seconds;
    uint256 public lastGlobalAction;

    uint256 public claimReward = 1 * 1e18; // 1 GEAR
    uint256 public walletCooldown = 60 seconds;
    mapping(address => uint256) public lastClaimTime;

    event GearClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event GearDeposited(address indexed depositor, uint256 amount);
    event ParamsUpdated(uint256 newReward, uint256 newWalletCooldown);
    event EmergencyWithdrawn(address indexed token, address indexed to, uint256 amount);

    error NotAdminNftHolder();
    error GlobalCooldownActive(uint256 timeRemaining);
    error WalletCooldownActive(uint256 timeRemaining);
    error VaultEmpty();

    modifier onlyAdminNft() {
        if (IERC721(adminNftAddress).ownerOf(adminTokenId) != msg.sender) {
            revert NotAdminNftHolder();
        }
        _;
    }

    constructor(
        address _gearToken,
        address _adminNftAddress,
        uint256 _adminTokenId
    ) {
        require(_gearToken != address(0), "Invalid GEAR");
        require(_adminNftAddress != address(0), "Invalid Admin NFT");
        gearToken = IERC20(_gearToken);
        adminNftAddress = _adminNftAddress;
        adminTokenId = _adminTokenId;
    }

    /**
     * @notice Claim GEAR tool from vault with 3-second global cooldown.
     */
    function claimGear() external {
        if (block.timestamp < lastGlobalAction + GLOBAL_COOLDOWN) {
            revert GlobalCooldownActive((lastGlobalAction + GLOBAL_COOLDOWN) - block.timestamp);
        }
        if (block.timestamp < lastClaimTime[msg.sender] + walletCooldown) {
            revert WalletCooldownActive((lastClaimTime[msg.sender] + walletCooldown) - block.timestamp);
        }
        if (gearToken.balanceOf(address(this)) < claimReward) {
            revert VaultEmpty();
        }

        lastGlobalAction = block.timestamp;
        lastClaimTime[msg.sender] = block.timestamp;

        bool ok = gearToken.transfer(msg.sender, claimReward);
        require(ok, "Transfer failed");

        emit GearClaimed(msg.sender, claimReward, block.timestamp);
    }

    function depositGear(uint256 amount) external {
        require(amount > 0, "Amount > 0");
        bool ok = gearToken.transferFrom(msg.sender, address(this), amount);
        require(ok, "Deposit failed");
        emit GearDeposited(msg.sender, amount);
    }

    function setParams(uint256 _reward, uint256 _walletCooldown) external onlyAdminNft {
        claimReward = _reward;
        walletCooldown = _walletCooldown;
        emit ParamsUpdated(_reward, _walletCooldown);
    }

    function emergencyWithdraw(address token, address to, uint256 amount) external onlyAdminNft {
        require(to != address(0), "Invalid recipient");
        bool ok = IERC20(token).transfer(to, amount);
        require(ok, "Emergency transfer failed");
        emit EmergencyWithdrawn(token, to, amount);
    }
}
