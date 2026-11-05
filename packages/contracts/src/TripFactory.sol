// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TripVault} from "./TripVault.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract TripFactory {
    address public immutable token;
    address public immutable agent;
    address public immutable verifier;
    address[] private merchantList;
    address[] private vaultList;
    mapping(address => bool) public isVault;

    error InvalidConfiguration();
    error CreatorMustBeMember();
    error InvalidPage();

    event TripCreated(address indexed vault, address indexed creator, uint256 endsAt);

    constructor(address token_, address agent_, address verifier_, address[] memory merchants_) {
        if (
            token_ == address(0) || agent_ == address(0) || verifier_ == address(0) || merchants_.length == 0
                || merchants_.length > 32
        ) revert InvalidConfiguration();
        if (IERC20Metadata(token_).decimals() != 6) revert InvalidConfiguration();
        token = token_;
        agent = agent_;
        verifier = verifier_;
        for (uint256 i; i < merchants_.length; ++i) {
            if (merchants_[i] == address(0)) revert InvalidConfiguration();
            for (uint256 j; j < i; ++j) {
                if (merchants_[i] == merchants_[j]) revert InvalidConfiguration();
            }
            merchantList.push(merchants_[i]);
        }
    }

    function merchants() external view returns (address[] memory) {
        return merchantList;
    }

    function createTrip(address[] calldata members, uint256 endsAt) external returns (address vault) {
        bool creatorIncluded;
        for (uint256 i; i < members.length; ++i) {
            if (members[i] == msg.sender) creatorIncluded = true;
        }
        if (!creatorIncluded) revert CreatorMustBeMember();
        vault = address(new TripVault(token, msg.sender, agent, verifier, members, merchantList, endsAt));
        isVault[vault] = true;
        vaultList.push(vault);
        emit TripCreated(vault, msg.sender, endsAt);
    }

    function vaultCount() external view returns (uint256) {
        return vaultList.length;
    }

    function vaults(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        if (offset > vaultList.length || limit > 100) revert InvalidPage();
        uint256 length = vaultList.length - offset;
        if (length > limit) length = limit;
        page = new address[](length);
        for (uint256 i; i < length; ++i) {
            page[i] = vaultList[offset + i];
        }
    }
}
