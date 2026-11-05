// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {TripVault} from "../src/TripVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract VaultHandler is Test {
    uint256 private constant MERCHANT_KEY = 0xCAFE;
    uint256 private constant VERIFIER_KEY = 0xF00D;
    MockUSDC public usdc;
    TripVault public vault;
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public merchant = vm.addr(MERCHANT_KEY);
    uint256 private sequence;

    constructor() {
        usdc = new MockUSDC();
        address[] memory people = new address[](2);
        people[0] = alice;
        people[1] = bob;
        address[] memory merchants = new address[](1);
        merchants[0] = merchant;
        vault = new TripVault(
            address(usdc), alice, address(this), vm.addr(VERIFIER_KEY), people, merchants, block.timestamp + 1 days
        );
    }

    function deposit(uint96 seed, bool first) external {
        if (block.timestamp >= vault.endsAt()) return;
        address member = first ? alice : bob;
        uint256 amount = bound(seed, 1, 100e6);
        usdc.mint(member, amount);
        vm.startPrank(member);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function policy(uint96 seed, bool first) external {
        if (block.timestamp >= vault.endsAt()) return;
        uint256 cap = bound(seed, 0, 200e6);
        vm.prank(first ? alice : bob);
        vault.setPolicy(cap / 2, cap);
    }

    function withdraw(uint96 seed, bool first) external {
        address member = first ? alice : bob;
        uint256 available = vault.getBalance(member).available;
        if (available == 0) return;
        address other = first ? bob : alice;
        uint256 otherBalance = vault.getBalance(other).available;
        vm.prank(member);
        vault.withdraw(bound(seed, 1, available));
        assertEq(vault.getBalance(other).available, otherBalance);
    }

    function propose(uint96 seed, bool first) external {
        uint256 end = vault.endsAt();
        if (block.timestamp + 100 >= end) return;
        uint256 amount = bound(seed, 1, 100e6);
        address[] memory people = new address[](1);
        people[0] = first ? alice : bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        TripVault.Quote memory quote = TripVault.Quote({
            quoteId: bytes32(++sequence),
            itemId: keccak256("activity"),
            merchant: merchant,
            title: "Guided walk",
            location: "Mumbai",
            unitPrice: amount,
            quantity: 1,
            total: amount,
            startsAt: end,
            expiresAt: block.timestamp + 100
        });
        vault.propose(quote, people, amounts, block.timestamp + 100, _sign(MERCHANT_KEY, vault.quoteDigest(quote)));
    }

    function approve(uint256 seed) external {
        uint256 count = vault.proposalCount();
        if (count == 0) return;
        uint256 id = bound(seed, 1, count);
        TripVault.Proposal memory proposal = vault.getProposal(id);
        if (proposal.status != TripVault.ProposalStatus.Pending || block.timestamp >= proposal.deadline) return;
        (address[] memory people,,) = vault.getShares(id);
        address member = people[0];
        if (vault.approvalExpiresAt(id, member) > block.timestamp) return;
        uint256 deadline = block.timestamp + 30;
        if (deadline > proposal.deadline) deadline = proposal.deadline;
        uint256 nonce = vault.approvalNonces(member);
        bytes memory signature = _sign(VERIFIER_KEY, vault.approvalDigest(id, member, nonce, deadline));
        vm.prank(member);
        vault.approve(id, nonce, deadline, signature);
    }

    function resolve(uint256 seed, bool deliver) external {
        uint256 count = vault.proposalCount();
        if (count == 0) return;
        uint256 id = bound(seed, 1, count);
        TripVault.Proposal memory proposal = vault.getProposal(id);
        if (proposal.status == TripVault.ProposalStatus.Pending || proposal.status == TripVault.ProposalStatus.Locked) {
            if (block.timestamp >= proposal.deadline) {
                vault.refund(id);
            } else if (deliver && proposal.status == TripVault.ProposalStatus.Locked) {
                vm.prank(merchant);
                vault.fulfill(id, keccak256(abi.encode(id)));
            }
        }
    }

    function advance(uint16 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 0, 300));
    }

    function _sign(uint256 key, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}

contract TripVaultInvariantTest is StdInvariant, Test {
    VaultHandler private handler;

    function setUp() public {
        handler = new VaultHandler();
        targetContract(address(handler));
    }

    function invariantTokenBalanceEqualsAvailablePlusLocked() public view {
        TripVault vault = handler.vault();
        assertEq(handler.usdc().balanceOf(address(vault)), vault.totalAvailable() + vault.totalLocked());
        TripVault.Balance memory alice = vault.getBalance(handler.alice());
        TripVault.Balance memory bob = vault.getBalance(handler.bob());
        assertEq(vault.totalAvailable(), alice.available + bob.available);
        assertEq(vault.totalLocked(), alice.locked + bob.locked);
    }

    function invariantEveryDepositedUnitIsStillOwnedSpentOrWithdrawn() public view {
        TripVault vault = handler.vault();
        TripVault.Balance memory alice = vault.getBalance(handler.alice());
        TripVault.Balance memory bob = vault.getBalance(handler.bob());
        assertEq(alice.deposited, alice.available + alice.locked + alice.spent + alice.withdrawn);
        assertEq(bob.deposited, bob.available + bob.locked + bob.spent + bob.withdrawn);
        assertEq(handler.usdc().balanceOf(handler.merchant()), alice.spent + bob.spent);
    }
}
