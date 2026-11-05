// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TripFactory} from "../src/TripFactory.sol";
import {TripVault} from "../src/TripVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract TripFactoryTest is Test {
    MockUSDC private usdc;
    TripFactory private factory;
    address private agent = address(0xA6E);
    address private verifier = address(0xF00D);

    function setUp() public {
        usdc = new MockUSDC();
        address[] memory merchants = new address[](1);
        merchants[0] = address(0xCAFE);
        factory = new TripFactory(address(usdc), agent, verifier, merchants);
    }

    function testFactoryCreatesIndependentVaultsWithFixedRoles() public {
        address[] memory people = new address[](1);
        people[0] = address(this);
        address first = factory.createTrip(people, block.timestamp + 1 days);
        address second = factory.createTrip(people, block.timestamp + 2 days);
        assertTrue(first != second);
        assertTrue(factory.isVault(first));
        assertEq(factory.vaultCount(), 2);
        assertEq(TripVault(first).agent(), agent);
        assertEq(TripVault(first).verifier(), verifier);
        assertEq(TripVault(first).creator(), address(this));
        assertEq(factory.vaults(0, 1)[0], first);
        assertEq(factory.vaults(1, 100)[0], second);
        assertEq(factory.vaults(2, 100).length, 0);
    }

    function testCreatorMustJoinAndInvalidPaginationReverts() public {
        address[] memory people = new address[](1);
        people[0] = address(0xA11CE);
        vm.expectRevert(TripFactory.CreatorMustBeMember.selector);
        factory.createTrip(people, block.timestamp + 1 days);
        vm.expectRevert(TripFactory.InvalidPage.selector);
        factory.vaults(1, 1);
        vm.expectRevert(TripFactory.InvalidPage.selector);
        factory.vaults(0, 101);
    }

    function testZeroRolesAndDuplicateMerchantsRevert() public {
        address[] memory merchants = new address[](2);
        merchants[0] = address(0xCAFE);
        merchants[1] = address(0xCAFE);
        vm.expectRevert(TripFactory.InvalidConfiguration.selector);
        new TripFactory(address(usdc), agent, verifier, merchants);
        merchants = new address[](1);
        merchants[0] = address(0xCAFE);
        vm.expectRevert(TripFactory.InvalidConfiguration.selector);
        new TripFactory(address(usdc), address(0), verifier, merchants);
    }
}
