import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "src/abi.ts",
  plugins: [
    foundry({
      project: "../contracts",
      include: [
        "ERC20.sol/ERC20.json",
        "TripVault.sol/TripVault.json",
        "TripFactory.sol/TripFactory.json",
      ],
    }),
  ],
});
