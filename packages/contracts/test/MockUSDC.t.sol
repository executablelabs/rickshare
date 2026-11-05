// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC private token;

    function setUp() public {
        token = new MockUSDC();
    }

    function testDecimals() public view {
        assertEq(token.decimals(), 6);
    }

    function testAnyoneCanMint() public {
        address member = makeAddr("member");
        vm.prank(makeAddr("caller"));
        token.mint(member, 42_000_000);
        assertEq(token.balanceOf(member), 42_000_000);
        assertEq(token.totalSupply(), 42_000_000);
    }

    function testMintToZeroAddressReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        token.mint(address(0), 1);
    }
}
