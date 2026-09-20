// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract GateRegistry {
    address public immutable adminNftAddress;
    uint256 public immutable adminTokenId;

    struct CollectionRange {
        address collection;
        uint256 startId;
        uint256 endId;
        bool active;
    }

    CollectionRange[] public collections;

    event CollectionAdded(uint256 indexed index, address indexed collection, uint256 startId, uint256 endId);
    event CollectionStatusUpdated(uint256 indexed index, bool active);

    error NotAdminNftHolder();
    error InvalidRange();
    error InvalidIndex();

    modifier onlyAdminNft() {
        if (IERC721(adminNftAddress).ownerOf(adminTokenId) != msg.sender) {
            revert NotAdminNftHolder();
        }
        _;
    }

    constructor(address _adminNftAddress, uint256 _adminTokenId) {
        adminNftAddress = _adminNftAddress;
        adminTokenId = _adminTokenId;
    }

    function addCollection(address collection, uint256 startId, uint256 endId) external onlyAdminNft {
        if (endId < startId) revert InvalidRange();
        collections.push(CollectionRange({
            collection: collection,
            startId: startId,
            endId: endId,
            active: true
        }));
        emit CollectionAdded(collections.length - 1, collection, startId, endId);
    }

    function setCollectionActive(uint256 index, bool active) external onlyAdminNft {
        if (index >= collections.length) revert InvalidIndex();
        collections[index].active = active;
        emit CollectionStatusUpdated(index, active);
    }

    function totalEligibleNFTs() external view returns (uint256 total) {
        uint256 len = collections.length;
        for (uint256 i = 0; i < len; i++) {
            if (collections[i].active) {
                total += (collections[i].endId - collections[i].startId + 1);
            }
        }
    }

    function collectionsCount() external view returns (uint256) {
        return collections.length;
    }

    function getActiveCollections() external view returns (CollectionRange[] memory) {
        uint256 activeCount = 0;
        uint256 len = collections.length;
        for (uint256 i = 0; i < len; i++) {
            if (collections[i].active) {
                activeCount++;
            }
        }

        CollectionRange[] memory activeList = new CollectionRange[](activeCount);
        uint256 curr = 0;
        for (uint256 i = 0; i < len; i++) {
            if (collections[i].active) {
                activeList[curr] = collections[i];
                curr++;
            }
        }
        return activeList;
    }

    function isTokenEligible(address collection, uint256 tokenId) external view returns (bool) {
        uint256 len = collections.length;
        for (uint256 i = 0; i < len; i++) {
            if (collections[i].active && collections[i].collection == collection) {
                if (tokenId >= collections[i].startId && tokenId <= collections[i].endId) {
                    return true;
                }
            }
        }
        return false;
    }
}
