import { getAddress } from "viem";
import { config } from "./config";
import { type AppDatabase, createDatabase } from "./db/client";
import { AppError } from "./lib/errors";
import { AuthService } from "./modules/auth/service";
import { assertArcChain, createArcClient } from "./modules/chain/clients";
import { IndexerService } from "./modules/indexer/service";
import { createIndexSource } from "./modules/indexer/source";

export type RuntimeOptions = { db?: AppDatabase; auth?: AuthService; indexer?: IndexerService };

export function createRuntime(options: RuntimeOptions = {}) {
  let database = options.db;
  let auth = options.auth;
  let indexer = options.indexer;
  const db = () => {
    database ??= createDatabase();
    return database;
  };
  return {
    db,
    auth: () => {
      if (auth) return auth;
      if (!config.SESSION_SECRET)
        throw new AppError("AUTH_NOT_CONFIGURED", "Session signing is not configured.", 503);
      const chain = createArcClient();
      auth = new AuthService(db(), {
        origin: config.WEB_ORIGIN,
        secret: config.SESSION_SECRET,
        nonceTtlSeconds: config.AUTH_NONCE_TTL_SECONDS,
        sessionTtlSeconds: config.SESSION_TTL_SECONDS,
        verifySignature: async (input) => {
          await assertArcChain(chain);
          return chain.verifyMessage(input);
        },
      });
      return auth;
    },
    indexer: () => {
      if (indexer) return indexer;
      if (!config.TRIP_FACTORY_ADDRESS)
        throw new AppError("CHAIN_NOT_CONFIGURED", "The trip factory is not configured.", 503);
      indexer = new IndexerService(
        db(),
        createIndexSource(getAddress(config.TRIP_FACTORY_ADDRESS)),
        BigInt(config.ARC_START_BLOCK),
      );
      return indexer;
    },
    close: () => {
      indexer?.stop();
      database?.$client.close();
      database = undefined;
    },
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
