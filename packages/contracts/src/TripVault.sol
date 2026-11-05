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
    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 quoteId,bytes32 itemId,address merchant,string title,string location,uint256 unitPrice,uint256 quantity,uint256 total,uint256 startsAt,uint256 expiresAt)"
    );
    uint256 public constant MAX_APPROVAL_TTL = 15 minutes;
    bytes32 public constant APPROVAL_TYPEHASH =
        keccak256("Approval(uint256 proposalId,address member,uint256 amount,uint256 nonce,uint256 deadline)");

    enum ProposalStatus {
        Pending,
        Locked,
        Fulfilled,
        Refunded,
        Rejected
    }
    enum ShareState {
        Waiting,
        Auto,
        Approved,
        Rejected
    }

    struct Quote {
        bytes32 quoteId;
        bytes32 itemId;
        address merchant;
        string title;
        string location;
        uint256 unitPrice;
        uint256 quantity;
        uint256 total;
        uint256 startsAt;
        uint256 expiresAt;
    }

    struct Proposal {
        address merchant;
        uint256 total;
        uint256 deadline;
        uint256 quoteExpiresAt;
        uint256 startsAt;
        bytes32 quoteHash;
        bytes32 ticketHash;
        ProposalStatus status;
        string title;
        string location;
    }

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
    uint256 public proposalCount;
    mapping(uint256 => Proposal) private proposals;
    mapping(uint256 => address[]) private proposalMembers;
    mapping(uint256 => mapping(address => uint256)) public shareAmount;
    mapping(uint256 => mapping(address => ShareState)) public shareState;
    mapping(bytes32 => bool) public usedQuotes;
    mapping(address => uint256) public approvalNonces;
    mapping(uint256 => mapping(address => uint256)) public approvalExpiresAt;

    error InvalidConfiguration();
    error TripEnded();
    error NotMember();
    error AlreadyMember();
    error MemberLimit();
    error InvalidInvite();
    error InvalidPolicy();
    error InvalidAmount();
    error TransferMismatch();
    error OnlyAgent();
    error InvalidProposal();
    error InvalidMerchantQuote();
    error QuoteAlreadyUsed();
    error UnknownProposal();
    error InvalidProposalState();
    error NotParticipant();
    error ProposalExpired();
    error InvalidAttestation();
    error AlreadyApproved();

    event MemberJoined(address indexed member);
    event Deposited(address indexed member, uint256 amount);
    event PolicySet(address indexed member, uint256 autoApproveMax, uint256 totalCap);
    event Proposed(
        uint256 indexed proposalId, address indexed merchant, bytes32 quoteHash, uint256 total, uint256 deadline
    );
    event ShareChanged(uint256 indexed proposalId, address indexed member, ShareState state);
    event Locked(uint256 indexed proposalId);
    event Rejected(uint256 indexed proposalId, address indexed member);

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

    function quoteDigest(Quote calldata quote) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    QUOTE_TYPEHASH,
                    quote.quoteId,
                    quote.itemId,
                    quote.merchant,
                    keccak256(bytes(quote.title)),
                    keccak256(bytes(quote.location)),
                    quote.unitPrice,
                    quote.quantity,
                    quote.total,
                    quote.startsAt,
                    quote.expiresAt
                )
            )
        );
    }

    function propose(
        Quote calldata quote,
        address[] calldata participants,
        uint256[] calldata amounts,
        uint256 deadline,
        bytes calldata merchantSignature
    ) external nonReentrant returns (uint256 id) {
        _requireActive();
        if (msg.sender != agent) revert OnlyAgent();
        if (
            participants.length == 0 || participants.length > MAX_MEMBERS || participants.length != amounts.length
                || deadline <= block.timestamp || deadline > endsAt || deadline > quote.startsAt
                || quote.startsAt > endsAt || quote.unitPrice == 0 || quote.quantity == 0
                || quote.quantity > type(uint256).max / quote.unitPrice
                || quote.unitPrice * quote.quantity != quote.total || bytes(quote.title).length == 0
                || bytes(quote.title).length > 160 || bytes(quote.location).length == 0
                || bytes(quote.location).length > 160 || quote.quoteId == bytes32(0) || quote.itemId == bytes32(0)
        ) revert InvalidProposal();
        bytes32 digest = quoteDigest(quote);
        if (
            !allowedMerchants[quote.merchant] || quote.expiresAt < block.timestamp
                || !SignatureChecker.isValidSignatureNow(quote.merchant, digest, merchantSignature)
        ) revert InvalidMerchantQuote();
        if (usedQuotes[digest]) revert QuoteAlreadyUsed();
        usedQuotes[digest] = true;
        id = ++proposalCount;
        uint256 sum;
        for (uint256 i; i < participants.length; ++i) {
            address member = participants[i];
            _requireMember(member);
            uint256 amount = amounts[i];
            if (amount == 0 || shareAmount[id][member] != 0 || amount > quote.total - sum) revert InvalidProposal();
            sum += amount;
            shareAmount[id][member] = amount;
            proposalMembers[id].push(member);
        }
        if (sum != quote.total) revert InvalidProposal();
        proposals[id] = Proposal({
            merchant: quote.merchant,
            total: quote.total,
            deadline: deadline,
            quoteExpiresAt: quote.expiresAt,
            startsAt: quote.startsAt,
            quoteHash: digest,
            ticketHash: bytes32(0),
            status: ProposalStatus.Pending,
            title: quote.title,
            location: quote.location
        });
        emit Proposed(id, quote.merchant, digest, sum, deadline);
        _tryLock(id);
    }

    function getProposal(uint256 id) external view returns (Proposal memory) {
        _requireProposal(id);
        return proposals[id];
    }

    function getShares(uint256 id)
        external
        view
        returns (address[] memory participants, uint256[] memory amounts, ShareState[] memory states)
    {
        _requireProposal(id);
        participants = proposalMembers[id];
        amounts = new uint256[](participants.length);
        states = new ShareState[](participants.length);
        for (uint256 i; i < participants.length; ++i) {
            address member = participants[i];
            amounts[i] = shareAmount[id][member];
            states[i] = shareState[id][member];
            if (proposals[id].status == ProposalStatus.Pending) {
                states[i] = _manualApprovalValid(id, member)
                    ? ShareState.Approved
                    : _canAutoApprove(member, amounts[i]) ? ShareState.Auto : ShareState.Waiting;
            }
        }
    }

    function lock(uint256 id) external nonReentrant returns (bool) {
        _requireActive();
        _requirePending(id);
        _requireUnexpired(id);
        return _tryLock(id);
    }

    function reject(uint256 id) external {
        _requirePending(id);
        if (shareAmount[id][msg.sender] == 0) revert NotParticipant();
        shareState[id][msg.sender] = ShareState.Rejected;
        proposals[id].status = ProposalStatus.Rejected;
        emit ShareChanged(id, msg.sender, ShareState.Rejected);
        emit Rejected(id, msg.sender);
    }

    function approvalDigest(uint256 id, address member, uint256 nonce, uint256 deadline) public view returns (bytes32) {
        _requireProposal(id);
        return _hashTypedDataV4(
            keccak256(abi.encode(APPROVAL_TYPEHASH, id, member, shareAmount[id][member], nonce, deadline))
        );
    }

    function approve(uint256 id, uint256 nonce, uint256 deadline, bytes calldata attestation) external nonReentrant {
        _requireActive();
        _requirePending(id);
        _requireUnexpired(id);
        if (shareAmount[id][msg.sender] == 0) revert NotParticipant();
        if (_manualApprovalValid(id, msg.sender)) revert AlreadyApproved();
        if (
            nonce != approvalNonces[msg.sender] || deadline <= block.timestamp
                || deadline > block.timestamp + MAX_APPROVAL_TTL || deadline > proposals[id].deadline
                || !SignatureChecker.isValidSignatureNow(
                    verifier, approvalDigest(id, msg.sender, nonce, deadline), attestation
                )
        ) revert InvalidAttestation();
        approvalNonces[msg.sender] = nonce + 1;
        approvalExpiresAt[id][msg.sender] = deadline;
        shareState[id][msg.sender] = ShareState.Approved;
        emit ShareChanged(id, msg.sender, ShareState.Approved);
        _tryLock(id);
    }

    function _canAutoApprove(address member, uint256 amount) internal view returns (bool) {
        Policy memory policy = policies[member];
        Balance memory balance = balances[member];
        if (amount > policy.autoApproveMax || balance.spent > policy.totalCap) return false;
        uint256 remaining = policy.totalCap - balance.spent;
        return balance.locked <= remaining && amount <= remaining - balance.locked;
    }

    function _tryLock(uint256 id) internal returns (bool) {
        bool ready = true;
        address[] storage participants = proposalMembers[id];
        for (uint256 i; i < participants.length; ++i) {
            address member = participants[i];
            uint256 amount = shareAmount[id][member];
            ShareState state = _manualApprovalValid(id, member)
                ? ShareState.Approved
                : _canAutoApprove(member, amount) ? ShareState.Auto : ShareState.Waiting;
            if (shareState[id][member] != state) {
                shareState[id][member] = state;
                emit ShareChanged(id, member, state);
            }
            if (state == ShareState.Waiting || balances[member].available < amount) ready = false;
        }
        if (!ready) return false;
        proposals[id].status = ProposalStatus.Locked;
        for (uint256 i; i < participants.length; ++i) {
            address member = participants[i];
            uint256 amount = shareAmount[id][member];
            balances[member].available -= amount;
            balances[member].locked += amount;
        }
        totalAvailable -= proposals[id].total;
        totalLocked += proposals[id].total;
        emit Locked(id);
        return true;
    }

    function _manualApprovalValid(uint256 id, address member) internal view returns (bool) {
        return shareState[id][member] == ShareState.Approved && block.timestamp < approvalExpiresAt[id][member];
    }

    function _requireProposal(uint256 id) internal view {
        if (id == 0 || id > proposalCount) revert UnknownProposal();
    }

    function _requirePending(uint256 id) internal view {
        _requireProposal(id);
        if (proposals[id].status != ProposalStatus.Pending) revert InvalidProposalState();
    }

    function _requireUnexpired(uint256 id) internal view {
        if (block.timestamp >= proposals[id].deadline || block.timestamp > proposals[id].quoteExpiresAt) {
            revert ProposalExpired();
        }
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
