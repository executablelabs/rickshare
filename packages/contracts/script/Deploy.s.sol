// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {TripFactory} from "../src/TripFactory.sol";

contract Deploy is Script {
    error WrongNetwork();

    function run() external returns (TripFactory factory) {
        if (block.chainid != 5042002) revert WrongNetwork();
        address[] memory merchants = new address[](3);
        merchants[0] = vm.envAddress("MERCHANT_1_ADDRESS");
        merchants[1] = vm.envAddress("MERCHANT_2_ADDRESS");
        merchants[2] = vm.envAddress("MERCHANT_3_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        factory = new TripFactory(0x3600000000000000000000000000000000000000, agent, verifier, merchants);
        vm.stopBroadcast();
    }
}
