// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TripVault} from "../src/TripVault.sol";
import {TripVaultApprovalsTest} from "./TripVault.approvals.t.sol";

contract TripVaultDeliveryTest is TripVaultApprovalsTest {
    function _locked() internal returns (uint256 id) {
        id = _pending();
        _approve(id, alice, block.timestamp + 5 minutes);
        _approve(id, bob, block.timestamp + 5 minutes);
    }

    function testMerchantPaidOnlyWhenTicketIsIssued() public {
        uint256 id = _locked();
        assertEq(usdc.balanceOf(merchant), 0);
        bytes32 ticketHash = keccak256("ticket bundle");
        vm.prank(merchant);
        vault.fulfill(id, ticketHash);
        assertEq(usdc.balanceOf(merchant), 30e6);
        assertEq(vault.getBalance(alice).spent, 10e6);
        assertEq(vault.getBalance(bob).spent, 20e6);
        assertEq(vault.getBalance(alice).locked, 0);
        assertEq(vault.getProposal(id).ticketHash, ticketHash);
        assertEq(vault.totalAvailable() + vault.totalLocked(), usdc.balanceOf(address(vault)));
        vm.prank(merchant);
        vm.expectRevert(TripVault.InvalidProposalState.selector);
        vault.fulfill(id, ticketHash);
    }

    function testWrongMerchantAndEmptyTicketRevert() public {
        uint256 id = _locked();
        vm.prank(alice);
        vm.expectRevert(TripVault.OnlyMerchant.selector);
        vault.fulfill(id, keccak256("ticket"));
        vm.prank(merchant);
        vm.expectRevert(TripVault.InvalidProposal.selector);
        vault.fulfill(id, bytes32(0));
    }

    function testLateDeliveryRefundsEachOriginalShare() public {
        uint256 id = _locked();
        vm.expectRevert(TripVault.RefundNotReady.selector);
        vault.refund(id);
        vm.warp(vault.getProposal(id).deadline);
        vm.prank(merchant);
        vm.expectRevert(TripVault.ProposalExpired.selector);
        vault.fulfill(id, keccak256("late ticket"));
        vault.refund(id);
        assertEq(vault.getBalance(alice).available, 100e6);
        assertEq(vault.getBalance(bob).available, 100e6);
        assertEq(vault.totalLocked(), 0);
        assertEq(usdc.balanceOf(merchant), 0);
        vm.expectRevert(TripVault.InvalidProposalState.selector);
        vault.refund(id);
    }

    function testExpiredPendingProposalRefundDoesNotCreditUnreservedMoney() public {
        uint256 id = _pending();
        vm.warp(vault.getProposal(id).deadline);
        vault.refund(id);
        assertEq(vault.totalAvailable(), 200e6);
        assertEq(vault.totalLocked(), 0);
    }

    function testWithdrawalsCannotTakeLockedOrAnotherPersonsMoney() public {
        _locked();
        vm.prank(alice);
        vm.expectRevert(TripVault.InsufficientBalance.selector);
        vault.withdraw(91e6);
        vm.prank(alice);
        vault.withdraw(90e6);
        assertEq(usdc.balanceOf(alice), 90e6);
        assertEq(vault.getBalance(alice).withdrawn, 90e6);
        assertEq(vault.getBalance(alice).available, 0);
        assertEq(vault.getBalance(alice).locked, 10e6);
        assertEq(vault.getBalance(bob).available, 80e6);
        vm.prank(merchant);
        vm.expectRevert(TripVault.NotMember.selector);
        vault.withdraw(1);
        vm.prank(bob);
        vm.expectRevert(TripVault.InvalidAmount.selector);
        vault.withdraw(0);
    }

    function testWithdrawingDuringPendingConsentPreventsOverdraftAtFinalApproval() public {
        uint256 id = _pending();
        _approve(id, alice, block.timestamp + 5 minutes);
        vm.prank(alice);
        vault.withdraw(100e6);
        _approve(id, bob, block.timestamp + 5 minutes);
        assertEq(vault.totalLocked(), 0);
        _deposit(alice, 10e6);
        assertTrue(vault.lock(id));
        assertEq(vault.getBalance(alice).locked, 10e6);
    }

    function testSettlementKeepsRefundAndWithdrawalAvailable() public {
        uint256 id = _locked();
        vm.expectRevert(TripVault.TripNotEnded.selector);
        vault.settle();
        vm.warp(end);
        vault.settle();
        vault.refund(id);
        vm.prank(alice);
        vault.withdraw(100e6);
        assertEq(vault.getBalance(bob).available, 100e6);
        assertEq(usdc.balanceOf(alice), 100e6);
        vm.expectRevert(TripVault.AlreadySettled.selector);
        vault.settle();
    }

    function testNonParticipantNeverChangesOnSinglePersonPurchase() public {
        address[] memory people = new address[](1);
        people[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 40e6;
        uint256 id = _propose(_quote(40e6), people, amounts);
        _approve(id, alice, block.timestamp + 5 minutes);
        vm.prank(merchant);
        vault.fulfill(id, keccak256("alice ticket"));
        assertEq(vault.getBalance(bob).available, 100e6);
        assertEq(vault.getBalance(bob).spent, 0);
        assertEq(vault.getBalance(bob).locked, 0);
    }
}
