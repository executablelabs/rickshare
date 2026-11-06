import { asHex } from "@rickshare/shared";
import { getDefaultAsset } from "@x402/evm";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createMerchantChain } from "./chain";
import { config } from "./config";
import { MerchantService } from "./service";
import { MerchantStore } from "./store";

export function createMerchantRuntime() {
  let service: MerchantService | undefined;
  let store: MerchantStore | undefined;
  return {
    service: () => {
      if (service) return service;
      const accounts = new Map<string, ReturnType<typeof privateKeyToAccount>>();
      for (const [id, key] of [
        ["elephanta-walks", config.MERCHANT_1_PRIVATE_KEY],
        ["goa-adventures", config.MERCHANT_2_PRIVATE_KEY],
        ["deccan-day-tours", config.MERCHANT_3_PRIVATE_KEY],
      ] as const) {
        if (key) accounts.set(id, privateKeyToAccount(asHex(key)));
      }
      store = new MerchantStore(config.MERCHANT_DATABASE_PATH);
      service = new MerchantService(
        store,
        config.TRIP_FACTORY_ADDRESS
          ? createMerchantChain(getAddress(config.TRIP_FACTORY_ADDRESS), config.ARC_RPC_URL)
          : undefined,
        {
          publicUrl: config.PUBLIC_URL,
          accounts,
          startBlock: BigInt(config.ARC_START_BLOCK),
          ...(config.MERCHANT_TEST_UNIT_PRICE_CAP
            ? { testUnitPriceCap: BigInt(config.MERCHANT_TEST_UNIT_PRICE_CAP) }
            : {}),
          ...(config.X402_ENABLED
            ? {
                payment: {
                  protocol: "x402" as const,
                  network: config.X402_NETWORK,
                  asset: getDefaultAsset(config.X402_NETWORK, "USDC").asset,
                },
              }
            : {}),
        },
      );
      return service;
    },
    close: () => {
      service?.stop();
      store?.close();
    },
  };
}
