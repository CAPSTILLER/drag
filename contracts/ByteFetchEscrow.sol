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
 * @title ByteFetchEscrow
 * @notice Utility escrow dispensing GEAR tokens when players walk Byte the dog.
 * @dev Enforces a per-wallet cooldown (60s) and verifies caller holds BYTE token dust.
 */
contract ByteFetchEscrow {
    IERC20 public immutable gearToken;
    IERC20 public immutable byteToken;
    address public immutable adminNftAddress;
    uint256 public immutable adminTokenId;

    uint256 public constant FETCH_REWARD = 1 * 1e18; // 1 GEAR
    uint256 public constant COOLDOWN = 60 seconds;

    mapping(address => uint256) public lastFetchTime;

    event GearFetched(address indexed player, uint256 amount, uint256 timestamp);
    event EscrowToppedUp(address indexed sender, uint256 amount);
    event EmergencyWithdrawn(address indexed token, address indexed to, uint256 amount);

    error NotAdminNftHolder();
    error NeedDustByte();
    error CooldownActive(uint256 timeRemaining);
    error EscrowEmpty();

    modifier onlyAdminNft() {
        if (IERC721(adminNftAddress).ownerOf(adminTokenId) != msg.sender) {
            revert NotAdminNftHolder();
        }
        _;
    }

    constructor(
        address _gearToken,
        address _byteToken,
        address _adminNftAddress,
        uint256 _adminTokenId
    ) {
        require(_gearToken != address(0), "Invalid GEAR token");
        require(_byteToken != address(0), "Invalid BYTE token");
        require(_adminNftAddress != address(0), "Invalid Admin NFT");

        gearToken = IERC20(_gearToken);
        byteToken = IERC20(_byteToken);
        adminNftAddress = _adminNftAddress;
        adminTokenId = _adminTokenId;
    }

    /**
     * @notice Player fetches 1 GEAR by interacting with Byte.
     * @dev Requires caller to hold > 0 BYTE tokens and respects 60s cooldown.
     */
    function fetchGear() external {
        if (byteToken.balanceOf(msg.sender) == 0) revert NeedDustByte();

        uint256 nextAvailable = lastFetchTime[msg.sender] + COOLDOWN;
        if (block.timestamp < nextAvailable) {
            revert CooldownActive(nextAvailable - block.timestamp);
        }

        if (gearToken.balanceOf(address(this)) < FETCH_REWARD) {
            revert EscrowEmpty();
        }

        lastFetchTime[msg.sender] = block.timestamp;
        bool ok = gearToken.transfer(msg.sender, FETCH_REWARD);
        require(ok, "GEAR transfer failed");

        emit GearFetched(msg.sender, FETCH_REWARD, block.timestamp);
    }

    /**
     * @notice Top up escrow with GEAR tokens.
     */
    function topUp(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        bool ok = gearToken.transferFrom(msg.sender, address(this), amount);
        require(ok, "Top up transfer failed");
        emit EscrowToppedUp(msg.sender, amount);
    }

    /**
     * @notice Emergency withdrawal by live Admin NFT holder.
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyAdminNft {
        require(to != address(0), "Invalid recipient");
        bool ok = IERC20(token).transfer(to, amount);
        require(ok, "Emergency transfer failed");
        emit EmergencyWithdrawn(token, to, amount);
    }
}
