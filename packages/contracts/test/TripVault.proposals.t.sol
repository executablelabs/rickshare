// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TripVault} from "../src/TripVault.sol";
import {TripVaultCoreTest} from "./TripVault.core.t.sol";

contract TripVaultProposalsTest is TripVaultCoreTest {
    function _quote(uint256 total) internal view returns (TripVault.Quote memory) {
        return TripVault.Quote({
            quoteId: keccak256("quote-1"),
            itemId: keccak256("activity"),
            merchant: merchant,
            title: "Elephanta guided walk",
            location: "Mumbai",
            unitPrice: total,
            quantity: 1,
            total: total,
            startsAt: block.timestamp + 1 days,
            expiresAt: block.timestamp + 10 minutes
        });
    }

    function _propose(TripVault.Quote memory quote, address[] memory participants, uint256[] memory amounts)
        internal
        returns (uint256)
    {
        bytes memory signature = _sign(MERCHANT_KEY, vault.quoteDigest(quote));
        vm.prank(agent);
        return vault.propose(quote, participants, amounts, block.timestamp + 1 hours, signature);
    }

    function _twoShares() internal view returns (address[] memory participants, uint256[] memory amounts) {
        participants = new address[](2);
        participants[0] = alice;
        participants[1] = bob;
        amounts = new uint256[](2);
        amounts[0] = 10e6;
        amounts[1] = 20e6;
    }

    function _expectProposalRevert(
        bytes4 reason,
        TripVault.Quote memory quote,
        address[] memory people,
        uint256[] memory amounts
    ) internal {
        bytes memory signature = _sign(MERCHANT_KEY, vault.quoteDigest(quote));
        vm.prank(agent);
        vm.expectRevert(reason);
        vault.propose(quote, people, amounts, block.timestamp + 1 hours, signature);
    }

    function testMixedProposalWaitsWithoutReservingAnyone() public {
        vm.prank(alice);
        vault.setPolicy(10e6, 30e6);
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        uint256 id = _propose(_quote(30e6), people, amounts);
        assertEq(uint256(vault.getProposal(id).status), uint256(TripVault.ProposalStatus.Pending));
        assertEq(uint256(vault.shareState(id, alice)), uint256(TripVault.ShareState.Auto));
        assertEq(uint256(vault.shareState(id, bob)), uint256(TripVault.ShareState.Waiting));
        assertEq(vault.totalLocked(), 0);
        assertEq(vault.getBalance(alice).available, 100e6);
    }

    function testAllAutomaticLocksExactlyTheParticipantsShares() public {
        vm.prank(alice);
        vault.setPolicy(10e6, 30e6);
        vm.prank(bob);
        vault.setPolicy(20e6, 40e6);
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        uint256 id = _propose(_quote(30e6), people, amounts);
        assertEq(uint256(vault.getProposal(id).status), uint256(TripVault.ProposalStatus.Locked));
        assertEq(vault.getBalance(alice).locked, 10e6);
        assertEq(vault.getBalance(bob).locked, 20e6);
        assertEq(vault.totalAvailable() + vault.totalLocked(), usdc.balanceOf(address(vault)));
        vm.expectRevert(TripVault.InvalidProposalState.selector);
        vault.lock(id);
    }

    function testPersonalCapCountsAlreadyLockedPurchases() public {
        vm.prank(alice);
        vault.setPolicy(30e6, 30e6);
        address[] memory people = new address[](1);
        people[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 20e6;
        _propose(_quote(20e6), people, amounts);
        TripVault.Quote memory second = _quote(20e6);
        second.quoteId = keccak256("quote-2");
        uint256 id = _propose(second, people, amounts);
        assertEq(uint256(vault.shareState(id, alice)), uint256(TripVault.ShareState.Waiting));
        assertEq(vault.getBalance(alice).locked, 20e6);
        assertEq(vault.getBalance(bob).available, 100e6);
    }

    function testPolicyRevocationIsRecheckedBeforeLock() public {
        vm.prank(alice);
        vault.setPolicy(10e6, 30e6);
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        uint256 id = _propose(_quote(30e6), people, amounts);
        vm.prank(alice);
        vault.setPolicy(0, 0);
        vm.prank(bob);
        vault.setPolicy(20e6, 40e6);
        assertFalse(vault.lock(id));
        assertEq(uint256(vault.shareState(id, alice)), uint256(TripVault.ShareState.Waiting));
        assertEq(vault.totalLocked(), 0);
    }

    function testParticipantRejectionClosesTheWholePendingProposal() public {
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        uint256 id = _propose(_quote(30e6), people, amounts);
        vm.prank(merchant);
        vm.expectRevert(TripVault.NotParticipant.selector);
        vault.reject(id);
        vm.prank(bob);
        vault.reject(id);
        assertEq(uint256(vault.getProposal(id).status), uint256(TripVault.ProposalStatus.Rejected));
        assertEq(vault.totalLocked(), 0);
        vm.expectRevert(TripVault.InvalidProposalState.selector);
        vault.lock(id);
    }

    function testOnlyAgentCanPropose() public {
        TripVault.Quote memory quote = _quote(30e6);
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        bytes memory signature = _sign(MERCHANT_KEY, vault.quoteDigest(quote));
        vm.prank(alice);
        vm.expectRevert(TripVault.OnlyAgent.selector);
        vault.propose(quote, people, amounts, block.timestamp + 1 hours, signature);
    }

    function testQuoteCannotReplayOrBeModified() public {
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        TripVault.Quote memory quote = _quote(30e6);
        _propose(quote, people, amounts);
        _expectProposalRevert(TripVault.QuoteAlreadyUsed.selector, quote, people, amounts);
        bytes memory signature = _sign(MERCHANT_KEY, vault.quoteDigest(quote));
        quote.title = "Different purchase";
        vm.prank(agent);
        vm.expectRevert(TripVault.InvalidMerchantQuote.selector);
        vault.propose(quote, people, amounts, block.timestamp + 1 hours, signature);
    }

    function testBadParticipantsAndSumsRevert() public {
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        amounts[1] = 21e6;
        _expectProposalRevert(TripVault.InvalidProposal.selector, _quote(30e6), people, amounts);
        amounts[1] = 19e6;
        _expectProposalRevert(TripVault.InvalidProposal.selector, _quote(30e6), people, amounts);
        amounts[1] = 20e6;
        people[1] = alice;
        _expectProposalRevert(TripVault.InvalidProposal.selector, _quote(30e6), people, amounts);
        people[1] = makeAddr("outsider");
        _expectProposalRevert(TripVault.NotMember.selector, _quote(30e6), people, amounts);
        people[1] = bob;
        amounts[0] = 0;
        _expectProposalRevert(TripVault.InvalidProposal.selector, _quote(20e6), people, amounts);
    }

    function testExpiredOrUnknownMerchantQuoteReverts() public {
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        TripVault.Quote memory quote = _quote(30e6);
        quote.expiresAt = block.timestamp - 1;
        _expectProposalRevert(TripVault.InvalidMerchantQuote.selector, quote, people, amounts);
        quote = _quote(30e6);
        quote.merchant = makeAddr("unlisted merchant");
        _expectProposalRevert(TripVault.InvalidMerchantQuote.selector, quote, people, amounts);
    }

    function testInvalidDeadlinesAndUnknownProposalRevert() public {
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        TripVault.Quote memory quote = _quote(30e6);
        bytes memory signature = _sign(MERCHANT_KEY, vault.quoteDigest(quote));
        vm.prank(agent);
        vm.expectRevert(TripVault.InvalidProposal.selector);
        vault.propose(quote, people, amounts, end + 1, signature);
        vm.expectRevert(TripVault.UnknownProposal.selector);
        vault.getProposal(0);
        uint256 id = _propose(quote, people, amounts);
        vm.warp(quote.expiresAt + 1);
        vm.expectRevert(TripVault.ProposalExpired.selector);
        vault.lock(id);
    }
}
