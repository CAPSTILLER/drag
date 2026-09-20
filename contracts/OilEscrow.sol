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

interface IDropVault {
    function fundFromEscrow(uint256 netAmount) external;
}

contract OilEscrow {
    IERC20 public immutable drbToken;
    address public dropVault;
    address public immutable adminNftAddress;
    uint256 public immutable adminTokenId;

    uint256 public packetSize;
    uint256 public callerBounty;
    uint256 public cooldownSeconds;
    uint256 public lastFillTimestamp;

    event OilFilled(address indexed caller, uint256 netToVault, uint256 callerBountyPaid, uint256 timestamp);
    event PacketSizeUpdated(uint256 newPacketSize);
    event CallerBountyUpdated(uint256 newCallerBounty);
    event CooldownUpdated(uint256 newCooldown);
    event DropVaultUpdated(address newDropVault);

    error NotAdminNftHolder();
    error CooldownActive(uint256 timeRemaining);
    error InsufficientEscrowBalance(uint256 available, uint256 required);
    error InvalidConfiguration();

    modifier onlyAdminNft() {
        if (IERC721(adminNftAddress).ownerOf(adminTokenId) != msg.sender) {
            revert NotAdminNftHolder();
        }
        _;
    }

    constructor(
        address _drbToken,
        address _dropVault,
        address _adminNftAddress,
        uint256 _adminTokenId,
        uint256 _packetSize,
        uint256 _callerBounty,
        uint256 _cooldownSeconds
    ) {
        if (_callerBounty >= _packetSize) revert InvalidConfiguration();
        drbToken = IERC20(_drbToken);
        dropVault = _dropVault;
        adminNftAddress = _adminNftAddress;
        adminTokenId = _adminTokenId;
        packetSize = _packetSize;
        callerBounty = _callerBounty;
        cooldownSeconds = _cooldownSeconds;
    }

    function fillOil() external {
        if (block.timestamp < lastFillTimestamp + cooldownSeconds) {
            revert CooldownActive((lastFillTimestamp + cooldownSeconds) - block.timestamp);
        }

        uint256 balance = drbToken.balanceOf(address(this));
        if (balance < packetSize) {
            revert InsufficientEscrowBalance(balance, packetSize);
        }

        lastFillTimestamp = block.timestamp;
        uint256 netAmount = packetSize - callerBounty;

        // Pay fixed caller bounty directly to the keeper / player
        if (callerBounty > 0) {
            bool bountyOk = drbToken.transfer(msg.sender, callerBounty);
            require(bountyOk, "Bounty transfer failed");
        }

        // Transfer net packet to Drop Vault and trigger snapshot
        bool vaultOk = drbToken.transfer(dropVault, netAmount);
        require(vaultOk, "Vault transfer failed");

        IDropVault(dropVault).fundFromEscrow(netAmount);

        emit OilFilled(msg.sender, netAmount, callerBounty, block.timestamp);
    }

    function setPacketSize(uint256 _packetSize) external onlyAdminNft {
        if (callerBounty >= _packetSize) revert InvalidConfiguration();
        packetSize = _packetSize;
        emit PacketSizeUpdated(_packetSize);
    }

    function setCallerBounty(uint256 _callerBounty) external onlyAdminNft {
        if (_callerBounty >= packetSize) revert InvalidConfiguration();
        callerBounty = _callerBounty;
        emit CallerBountyUpdated(_callerBounty);
    }

    function setCooldown(uint256 _cooldownSeconds) external onlyAdminNft {
        cooldownSeconds = _cooldownSeconds;
        emit CooldownUpdated(_cooldownSeconds);
    }

    function setDropVault(address _dropVault) external onlyAdminNft {
        dropVault = _dropVault;
        emit DropVaultUpdated(_dropVault);
    }
}
