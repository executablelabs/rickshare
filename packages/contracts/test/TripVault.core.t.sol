// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TripVault} from "../src/TripVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract TripVaultCoreTest is Test {
    MockUSDC internal usdc;
    TripVault internal vault;
    uint256 internal constant ALICE_KEY = 0xA11CE;
    uint256 internal constant MERCHANT_KEY = 0xCAFE;
    uint256 internal constant VERIFIER_KEY = 0xF00D;
    address internal alice;
    address internal bob;
    address internal agent;
    address internal verifier;
    address internal merchant;
    uint256 internal end;

    function setUp() public virtual {
        alice = vm.addr(ALICE_KEY);
        bob = makeAddr("bob");
        agent = makeAddr("agent");
        verifier = vm.addr(VERIFIER_KEY);
        merchant = vm.addr(MERCHANT_KEY);
        usdc = new MockUSDC();
        end = block.timestamp + 7 days;
        vault = _vault(end);
        _deposit(alice, 100e6);
        _deposit(bob, 100e6);
    }

    function _vault(uint256 endsAt_) internal returns (TripVault) {
        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = bob;
        address[] memory merchants = new address[](1);
        merchants[0] = merchant;
        return new TripVault(address(usdc), alice, agent, verifier, members, merchants, endsAt_);
    }

    function _deposit(address member, uint256 amount) internal {
        usdc.mint(member, amount);
        vm.startPrank(member);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function testDepositsAreOwnedPerMember() public view {
        TripVault.Balance memory balance = vault.getBalance(alice);
        assertEq(balance.deposited, 100e6);
        assertEq(balance.available, 100e6);
        assertEq(balance.spent, 0);
        assertEq(balance.locked, 0);
        assertEq(balance.withdrawn, 0);
        assertEq(vault.totalAvailable(), usdc.balanceOf(address(vault)));
        assertEq(vault.members().length, 2);
    }

    function testNonMemberCannotDepositOrSetPolicy() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(TripVault.NotMember.selector);
        vault.deposit(1);
        vm.expectRevert(TripVault.NotMember.selector);
        vault.setPolicy(0, 0);
        vm.stopPrank();
    }

    function testPolicyIsPersonalAndCanDisableAutomaticSpending() public {
        vm.prank(alice);
        vault.setPolicy(10e6, 30e6);
        (uint256 maximum, uint256 cap) = vault.policies(alice);
        assertEq(maximum, 10e6);
        assertEq(cap, 30e6);
        (maximum, cap) = vault.policies(bob);
        assertEq(maximum + cap, 0);
        vm.prank(alice);
        vault.setPolicy(0, 0);
    }

    function testInvalidPolicyAndZeroDepositRevert() public {
        vm.startPrank(alice);
        vm.expectRevert(TripVault.InvalidPolicy.selector);
        vault.setPolicy(11, 10);
        vm.expectRevert(TripVault.InvalidAmount.selector);
        vault.deposit(0);
        vm.stopPrank();
    }

    function testInvitedMemberJoinsWithoutChangingExistingBalances() public {
        address member = makeAddr("new member");
        bytes memory signature = _sign(ALICE_KEY, vault.inviteDigest(member, end));
        vm.prank(member);
        vault.join(end, signature);
        assertTrue(vault.isMember(member));
        assertEq(vault.getBalance(member).available, 0);
        assertEq(vault.getBalance(alice).available, 100e6);
        vm.prank(member);
        vm.expectRevert(TripVault.AlreadyMember.selector);
        vault.join(end, signature);
    }

    function testInviteCannotBeUsedByAnotherWalletOrVault() public {
        address member = makeAddr("new member");
        bytes memory signature = _sign(ALICE_KEY, vault.inviteDigest(member, end));
        vm.prank(bob);
        vm.expectRevert(TripVault.InvalidInvite.selector);
        vault.join(end, signature);
        TripVault other = _vault(end);
        vm.prank(member);
        vm.expectRevert(TripVault.InvalidInvite.selector);
        other.join(end, signature);
    }

    function testExpiredInviteAndEndedTripRejectChanges() public {
        address member = makeAddr("new member");
        uint256 expiry = block.timestamp + 10;
        bytes memory signature = _sign(ALICE_KEY, vault.inviteDigest(member, expiry));
        vm.warp(expiry + 1);
        vm.prank(member);
        vm.expectRevert(TripVault.InvalidInvite.selector);
        vault.join(expiry, signature);
        vm.warp(end);
        vm.startPrank(alice);
        vm.expectRevert(TripVault.TripEnded.selector);
        vault.deposit(1);
        vm.expectRevert(TripVault.TripEnded.selector);
        vault.setPolicy(0, 0);
        vm.expectRevert(TripVault.TripEnded.selector);
        vault.join(end, signature);
        vm.stopPrank();
    }

    function testPastTripEndReverts() public {
        vm.expectRevert(TripVault.InvalidConfiguration.selector);
        _vault(block.timestamp);
    }

    function testFuzzDepositPreservesExactOwnership(uint96 amount) public {
        amount = uint96(bound(amount, 1, type(uint96).max));
        _deposit(alice, amount);
        assertEq(vault.getBalance(alice).available, 100e6 + uint256(amount));
        assertEq(vault.getBalance(bob).available, 100e6);
        assertEq(vault.totalAvailable(), usdc.balanceOf(address(vault)));
    }
}
