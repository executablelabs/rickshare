// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TripVault} from "../src/TripVault.sol";
import {TripVaultProposalsTest} from "./TripVault.proposals.t.sol";

contract TripVaultApprovalsTest is TripVaultProposalsTest {
    function _pending() internal returns (uint256) {
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        return _propose(_quote(30e6), people, amounts);
    }

    function _approve(uint256 id, address member, uint256 deadline) internal {
        uint256 nonce = vault.approvalNonces(member);
        bytes memory signature = _sign(VERIFIER_KEY, vault.approvalDigest(id, member, nonce, deadline));
        vm.prank(member);
        vault.approve(id, nonce, deadline, signature);
    }

    function testEachWalletApprovesOnlyItsOwnShare() public {
        uint256 id = _pending();
        _approve(id, alice, block.timestamp + 5 minutes);
        assertEq(vault.totalLocked(), 0);
        assertEq(vault.approvalNonces(alice), 1);
        _approve(id, bob, block.timestamp + 5 minutes);
        assertEq(vault.totalLocked(), 30e6);
        assertEq(vault.getBalance(alice).locked, 10e6);
        assertEq(vault.getBalance(bob).locked, 20e6);
        assertEq(uint256(vault.getProposal(id).status), uint256(TripVault.ProposalStatus.Locked));
    }

    function testExplicitConsentCanExceedAutomaticCap() public {
        uint256 id = _pending();
        vm.prank(alice);
        vault.setPolicy(1, 1);
        _approve(id, alice, block.timestamp + 5 minutes);
        _approve(id, bob, block.timestamp + 5 minutes);
        assertEq(vault.getBalance(alice).locked, 10e6);
    }

    function testWrongSignerMemberNonceAndExpiredAttestationsRevert() public {
        uint256 id = _pending();
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory wrongSigner = _sign(ALICE_KEY, vault.approvalDigest(id, alice, 0, deadline));
        vm.prank(alice);
        vm.expectRevert(TripVault.InvalidAttestation.selector);
        vault.approve(id, 0, deadline, wrongSigner);
        bytes memory wrongMember = _sign(VERIFIER_KEY, vault.approvalDigest(id, bob, 0, deadline));
        vm.prank(alice);
        vm.expectRevert(TripVault.InvalidAttestation.selector);
        vault.approve(id, 0, deadline, wrongMember);
        bytes memory signature = _sign(VERIFIER_KEY, vault.approvalDigest(id, alice, 0, deadline));
        vm.prank(alice);
        vm.expectRevert(TripVault.InvalidAttestation.selector);
        vault.approve(id, 1, deadline, signature);
        vm.warp(deadline);
        vm.prank(alice);
        vm.expectRevert(TripVault.InvalidAttestation.selector);
        vault.approve(id, 0, deadline, signature);
    }

    function testVerifierCannotSpendWithoutParticipantWallet() public {
        uint256 id = _pending();
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory signature = _sign(VERIFIER_KEY, vault.approvalDigest(id, alice, 0, deadline));
        vm.prank(verifier);
        vm.expectRevert(TripVault.NotParticipant.selector);
        vault.approve(id, 0, deadline, signature);
        assertEq(vault.totalLocked(), 0);
    }

    function testDoubleApprovalIsRejected() public {
        uint256 id = _pending();
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory signature = _sign(VERIFIER_KEY, vault.approvalDigest(id, alice, 0, deadline));
        vm.startPrank(alice);
        vault.approve(id, 0, deadline, signature);
        vm.expectRevert(TripVault.AlreadyApproved.selector);
        vault.approve(id, 0, deadline, signature);
        vm.stopPrank();
    }

    function testExpiredEarlierConsentCannotLockWhenLastMemberApproves() public {
        uint256 id = _pending();
        _approve(id, alice, block.timestamp + 10);
        vm.warp(block.timestamp + 11);
        _approve(id, bob, block.timestamp + 5 minutes);
        assertEq(vault.totalLocked(), 0);
        (,, TripVault.ShareState[] memory states) = vault.getShares(id);
        assertEq(uint256(states[0]), uint256(TripVault.ShareState.Waiting));
        _approve(id, alice, block.timestamp + 5 minutes);
        assertEq(vault.totalLocked(), 30e6);
    }

    function testCrossVaultAndCrossChainReplayAreRejected() public {
        uint256 id = _pending();
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory signature = _sign(VERIFIER_KEY, vault.approvalDigest(id, alice, 0, deadline));
        TripVault other = _vault(end);
        (address[] memory people, uint256[] memory amounts) = _twoShares();
        TripVault.Quote memory quote = _quote(30e6);
        bytes memory merchantSignature = _sign(MERCHANT_KEY, other.quoteDigest(quote));
        vm.prank(agent);
        uint256 otherId = other.propose(quote, people, amounts, block.timestamp + 1 hours, merchantSignature);
        vm.prank(alice);
        vm.expectRevert(TripVault.InvalidAttestation.selector);
        other.approve(otherId, 0, deadline, signature);
        vm.chainId(block.chainid + 1);
        vm.prank(alice);
        vm.expectRevert(TripVault.InvalidAttestation.selector);
        vault.approve(id, 0, deadline, signature);
    }

    function testExcessivelyLongAttestationIsRejected() public {
        uint256 id = _pending();
        uint256 deadline = block.timestamp + 16 minutes;
        bytes memory signature = _sign(VERIFIER_KEY, vault.approvalDigest(id, alice, 0, deadline));
        vm.prank(alice);
        vm.expectRevert(TripVault.InvalidAttestation.selector);
        vault.approve(id, 0, deadline, signature);
    }
}
