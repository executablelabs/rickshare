// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TripVault is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_MEMBERS = 32;
    uint256 public constant MAX_MERCHANTS = 32;
    bytes32 public constant INVITE_TYPEHASH = keccak256("Invite(address member,uint256 deadline)");

    struct Balance {
        uint256 deposited;
        uint256 spent;
        uint256 locked;
        uint256 available;
        uint256 withdrawn;
    }

    struct Policy {
        uint256 autoApproveMax;
        uint256 totalCap;
    }

    IERC20 public immutable token;
    address public immutable creator;
    address public immutable agent;
    address public immutable verifier;
    uint256 public immutable endsAt;
    uint256 public totalAvailable;
    uint256 public totalLocked;
    bool public settled;
    address[] private memberList;
    mapping(address => bool) public isMember;
    mapping(address => bool) public allowedMerchants;
    mapping(address => Balance) public balances;
    mapping(address => Policy) public policies;

    error InvalidConfiguration();
    error TripEnded();
    error NotMember();
    error AlreadyMember();
    error MemberLimit();
    error InvalidInvite();
    error InvalidPolicy();
    error InvalidAmount();
    error TransferMismatch();

    event MemberJoined(address indexed member);
    event Deposited(address indexed member, uint256 amount);
    event PolicySet(address indexed member, uint256 autoApproveMax, uint256 totalCap);

    constructor(
        address token_,
        address creator_,
        address agent_,
        address verifier_,
        address[] memory members_,
        address[] memory merchants_,
        uint256 endsAt_
    ) EIP712("Rickshare TripVault", "1") {
        if (
            token_ == address(0) || creator_ == address(0) || agent_ == address(0) || verifier_ == address(0)
                || endsAt_ <= block.timestamp || members_.length == 0 || members_.length > MAX_MEMBERS
                || merchants_.length == 0 || merchants_.length > MAX_MERCHANTS
        ) revert InvalidConfiguration();
        if (IERC20Metadata(token_).decimals() != 6) revert InvalidConfiguration();
        token = IERC20(token_);
        creator = creator_;
        agent = agent_;
        verifier = verifier_;
        endsAt = endsAt_;
        for (uint256 i; i < members_.length; ++i) {
            _addMember(members_[i]);
        }
        for (uint256 i; i < merchants_.length; ++i) {
            address merchant = merchants_[i];
            if (merchant == address(0) || allowedMerchants[merchant]) revert InvalidConfiguration();
            allowedMerchants[merchant] = true;
        }
    }

    function members() external view returns (address[] memory) {
        return memberList;
    }

    function getBalance(address member) external view returns (Balance memory) {
        return balances[member];
    }

    function inviteDigest(address member, uint256 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(INVITE_TYPEHASH, member, deadline)));
    }

    function join(uint256 deadline, bytes calldata signature) external nonReentrant {
        _requireActive();
        if (
            block.timestamp > deadline
                || !SignatureChecker.isValidSignatureNow(creator, inviteDigest(msg.sender, deadline), signature)
        ) {
            revert InvalidInvite();
        }
        _addMember(msg.sender);
    }

    function deposit(uint256 amount) external nonReentrant {
        _requireActive();
        _requireMember(msg.sender);
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBalance != amount) revert TransferMismatch();
        balances[msg.sender].deposited += amount;
        balances[msg.sender].available += amount;
        totalAvailable += amount;
        emit Deposited(msg.sender, amount);
    }

    function setPolicy(uint256 autoApproveMax, uint256 totalCap) external {
        _requireActive();
        _requireMember(msg.sender);
        if (autoApproveMax > totalCap) revert InvalidPolicy();
        policies[msg.sender] = Policy({autoApproveMax: autoApproveMax, totalCap: totalCap});
        emit PolicySet(msg.sender, autoApproveMax, totalCap);
    }

    function _addMember(address member) internal {
        if (member == address(0)) revert InvalidConfiguration();
        if (isMember[member]) revert AlreadyMember();
        if (memberList.length >= MAX_MEMBERS) revert MemberLimit();
        isMember[member] = true;
        memberList.push(member);
        emit MemberJoined(member);
    }

    function _requireActive() internal view {
        if (settled || block.timestamp >= endsAt) revert TripEnded();
    }

    function _requireMember(address member) internal view {
        if (!isMember[member]) revert NotMember();
    }
}
