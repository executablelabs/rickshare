import { asHex } from "@rickshare/shared";
import { eq } from "drizzle-orm";
import { getAddress } from "viem";
import { config } from "./config";
import { type AppDatabase, createDatabase } from "./db/client";
import { indexedVaults, worldIdentities } from "./db/schema";
import { AppError } from "./lib/errors";
import { logger } from "./lib/logger";
import { createOpenRouterModel } from "./modules/agent/openrouter";
import { type AgentModel, type AgentService, createAgentService } from "./modules/agent/service";
import { createTavilySearch } from "./modules/agent/sources";
import type { AgentPorts } from "./modules/agent/tools";
import { createApprovalReader } from "./modules/approvals/chain";
import { WorldOidcProvider } from "./modules/approvals/oidc";
import { WorldApprovalService } from "./modules/approvals/service";
import { AuthService } from "./modules/auth/service";
import { assertArcChain, createArcClient } from "./modules/chain/clients";
import { ChatCoordinator } from "./modules/chat/coordinator";
import { type ChatStore, createChatStore } from "./modules/chat/service";
import { IndexerService } from "./modules/indexer/service";
import { createIndexSource } from "./modules/indexer/source";
import { createProposalChain } from "./modules/proposals/chain";
import { MerchantClient } from "./modules/proposals/merchants";
import { ProposalService } from "./modules/proposals/service";
import { createTripChain } from "./modules/trips/chain";
import { createItineraryStore, type ItineraryStore } from "./modules/trips/itinerary";
import { MoneyService } from "./modules/trips/money";
import { TripService } from "./modules/trips/service";

export type RuntimeOptions = {
  db?: AppDatabase;
  auth?: AuthService;
  indexer?: IndexerService;
  world?: WorldApprovalService;
  proposals?: ProposalService;
  merchants?: MerchantClient;
  trips?: TripService;
  model?: AgentModel;
  agent?: AgentService;
  agentPorts?: (tripId: string) => AgentPorts;
  chat?: ChatStore;
  itinerary?: ItineraryStore;
  coordinator?: ChatCoordinator;
  money?: MoneyService;
};

export function createRuntime(options: RuntimeOptions = {}) {
  let database = options.db;
  let auth = options.auth;
  let indexer = options.indexer;
  let world = options.world;
  let proposals = options.proposals;
  let merchants = options.merchants;
  let trips = options.trips;
  let chat = options.chat;
  let itinerary = options.itinerary;
  let agent = options.agent;
  let coordinator = options.coordinator;
  let money = options.money;
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
          onLinked: (address) => {
            const projections = runtime.indexer();
            for (const row of db()
              .select()
              .from(indexedVaults)
              .where(eq(indexedVaults.scope, projections.cursorId))
              .all()) {
              if (
                projections
                  .getTrip(row.address)
                  .members.some((member) => member.address.toLowerCase() === address.toLowerCase())
              )
                projections.refreshMetadata(row.address);
            }
          },
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
    trips: (): TripService => {
      if (trips) return trips;
      if (!config.TRIP_FACTORY_ADDRESS)
        throw new AppError("CHAIN_NOT_CONFIGURED", "The trip factory is not configured.", 503);
      trips = new TripService(
        db(),
        createTripChain(getAddress(config.TRIP_FACTORY_ADDRESS)),
        runtime.indexer(),
        { origin: runtime.auth().origin, digest: (token) => runtime.auth().digest(token) },
      );
      return trips;
    },
    chat: (): ChatStore => {
      chat ??= createChatStore(
        db(),
        () => new Date(),
        (event) => runtime.indexer().bus.publish(event),
      );
      return chat;
    },
    itinerary: (): ItineraryStore => {
      itinerary ??= createItineraryStore(db(), (event) => runtime.indexer().bus.publish(event));
      return itinerary;
    },
    agent: (): AgentService => {
      if (agent) return agent;
      const model =
        options.model ??
        (config.OPENROUTER_API_KEY ? createOpenRouterModel(config.OPENROUTER_API_KEY) : undefined);
      if (!model)
        throw new AppError("AGENT_NOT_CONFIGURED", "The trip agent is not configured.", 503);
      const search = config.TAVILY_API_KEY
        ? createTavilySearch(config.TAVILY_API_KEY)
        : async () => {
            throw new AppError("SEARCH_NOT_CONFIGURED", "Activity search is not configured.", 503);
          };
      const ports =
        options.agentPorts ??
        ((tripId: string): AgentPorts => ({
          searchActivities: search,
          listMerchants: async () =>
            (await runtime.merchants().catalog()).filter((merchant) => !!merchant.address),
          getQuote: (request) =>
            runtime.merchants().quote({ ...request, vaultAddress: getAddress(tripId) }),
          getTripState: async (requestedTrip) => {
            if (requestedTrip.toLowerCase() !== tripId.toLowerCase())
              throw new AppError(
                "TRIP_CONTEXT_MISMATCH",
                "The agent requested a different trip.",
                400,
              );
            await runtime.indexer().sync();
            return runtime.indexer().getTrip(tripId);
          },
          submitProposal: async (request) => {
            if (request.tripId.toLowerCase() !== tripId.toLowerCase())
              throw new AppError(
                "TRIP_CONTEXT_MISMATCH",
                "The agent requested a different trip.",
                400,
              );
            const submitted = await runtime.proposals().submitProposal(request);
            try {
              await runtime.indexer().sync();
            } catch {
              logger.error("AGENT_PROPOSAL_INDEX_PENDING");
            }
            const status = runtime
              .indexer()
              .proposals(tripId)
              .find((proposal) => proposal.id === submitted.proposalId)?.status;
            return { proposalId: submitted.proposalId, ...(status ? { status } : {}) };
          },
          replaceItinerary: (requestedTrip, drafts) => {
            if (requestedTrip.toLowerCase() !== tripId.toLowerCase())
              throw new AppError(
                "TRIP_CONTEXT_MISMATCH",
                "The agent requested a different trip.",
                400,
              );
            return runtime.itinerary().replace(tripId, drafts);
          },
        }));
      agent = createAgentService({
        model,
        ports,
        chat: runtime.chat(),
        ...(config.OPENROUTER_MODEL ? { modelId: config.OPENROUTER_MODEL } : {}),
      });
      return agent;
    },
    coordinator: (): ChatCoordinator => {
      coordinator ??= new ChatCoordinator(db(), runtime.agent());
      return coordinator;
    },
    money: (): MoneyService => {
      if (money) return money;
      if (!config.TRIP_FACTORY_ADDRESS)
        throw new AppError("CHAIN_NOT_CONFIGURED", "The trip factory is not configured.", 503);
      const client = createArcClient();
      money = new MoneyService(
        db(),
        createTripChain(getAddress(config.TRIP_FACTORY_ADDRESS), client),
        runtime.indexer(),
        client,
      );
      return money;
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
