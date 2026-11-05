import { asHex } from "@kitty/shared";
import { eq } from "drizzle-orm";
import { getAddress } from "viem";
import { config } from "./config";
import { type AppDatabase, createDatabase } from "./db/client";
import { worldIdentities } from "./db/schema";
import { AppError } from "./lib/errors";
import { createApprovalReader } from "./modules/approvals/chain";
import { WorldOidcProvider } from "./modules/approvals/oidc";
import { WorldApprovalService } from "./modules/approvals/service";
import { AuthService } from "./modules/auth/service";
import { assertArcChain, createArcClient } from "./modules/chain/clients";
import { IndexerService } from "./modules/indexer/service";
import { createIndexSource } from "./modules/indexer/source";
import { createProposalChain } from "./modules/proposals/chain";
import { MerchantClient } from "./modules/proposals/merchants";
import { ProposalService } from "./modules/proposals/service";

export type RuntimeOptions = {
  db?: AppDatabase;
  auth?: AuthService;
  indexer?: IndexerService;
  world?: WorldApprovalService;
  proposals?: ProposalService;
  merchants?: MerchantClient;
};

export function createRuntime(options: RuntimeOptions = {}) {
  let database = options.db;
  let auth = options.auth;
  let indexer = options.indexer;
  let world = options.world;
  let proposals = options.proposals;
  let merchants = options.merchants;
  const db = () => {
    database ??= createDatabase();
    return database;
  };
  const runtime = {
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
        createIndexSource(
          getAddress(config.TRIP_FACTORY_ADDRESS),
          createArcClient(),
          (address) =>
            !!db()
              .select()
              .from(worldIdentities)
              .where(eq(worldIdentities.address, address.toLowerCase()))
              .get(),
        ),
        BigInt(config.ARC_START_BLOCK),
      );
      return indexer;
    },
    world: (): WorldApprovalService => {
      if (world) return world;
      if (
        !config.SESSION_SECRET ||
        !config.WORLD_ISSUER ||
        !config.WORLD_CLIENT_ID ||
        !config.WORLD_CLIENT_SECRET ||
        !config.WORLD_REDIRECT_URI ||
        !config.VERIFIER_PRIVATE_KEY ||
        !config.TRIP_FACTORY_ADDRESS
      )
        throw new AppError("WORLD_NOT_CONFIGURED", "World authentication is not configured.", 503);
      world = new WorldApprovalService(
        db(),
        runtime.auth(),
        new WorldOidcProvider({
          issuer: config.WORLD_ISSUER,
          clientId: config.WORLD_CLIENT_ID,
          clientSecret: config.WORLD_CLIENT_SECRET,
          redirectUri: config.WORLD_REDIRECT_URI,
          maxAuthAgeSeconds: config.WORLD_MAX_AUTH_AGE_SECONDS,
        }),
        createApprovalReader(getAddress(config.TRIP_FACTORY_ADDRESS)),
        {
          secret: config.SESSION_SECRET,
          verifierKey: asHex(config.VERIFIER_PRIVATE_KEY),
          attestationTtlSeconds: config.ATTESTATION_TTL_SECONDS,
          issuer: config.WORLD_ISSUER,
          clientId: config.WORLD_CLIENT_ID,
        },
      );
      return world;
    },
    merchants: (): MerchantClient => {
      merchants ??= new MerchantClient(config.MERCHANTS_URL, config.MERCHANTS_API_SECRET);
      return merchants;
    },
    proposals: (): ProposalService => {
      if (proposals) return proposals;
      if (!config.AGENT_PRIVATE_KEY || !config.TRIP_FACTORY_ADDRESS)
        throw new AppError("AGENT_NOT_CONFIGURED", "The purchase proposer is not configured.", 503);
      proposals = new ProposalService(
        db(),
        createProposalChain(getAddress(config.TRIP_FACTORY_ADDRESS), config.AGENT_PRIVATE_KEY),
        runtime.merchants(),
        () => runtime.indexer().sync(),
      );
      return proposals;
    },
    close: () => {
      indexer?.stop();
      database?.$client.close();
      database = undefined;
    },
  };
  return runtime;
}

export type Runtime = ReturnType<typeof createRuntime>;
