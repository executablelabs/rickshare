import { arcTestnet, asHex, contractQuote, type SignedQuote } from "@kitty/shared";
import { tripFactoryAbi, tripVaultAbi } from "@kitty/shared/abi";
import { type Address, getAddress, type Hex, parseEventLogs } from "viem";
import { AppError } from "../../lib/errors";
import { arcFees, assertArcChain, createArcClient, createArcWallet } from "../chain/clients";

export type SubmittedProposal = { proposalId: string; transactionHash: Hex };
export type ProposalChain = {
  chainId: number;
  validate(vault: Address, merchant: Address, participants: Address[]): Promise<{ endsAt: bigint }>;
  broadcast(
    quote: SignedQuote,
    shares: { member: Address; amount: bigint }[],
    deadline: bigint,
  ): Promise<Hex>;
  confirm(vault: Address, quoteHash: Hex, hash: Hex): Promise<SubmittedProposal>;
  purchase(
    vault: Address,
    proposalId: bigint,
  ): Promise<{ status: number; ticketHash: Hex; participants: Address[] }>;
};

export function createProposalChain(
  factory: Address,
  agentKey: string,
  client = createArcClient(),
): ProposalChain {
  const wallet = createArcWallet(agentKey, client.transport.url);
  return {
    chainId: arcTestnet.id,
    async validate(vault, merchant, participants) {
      await assertArcChain(client);
      if (
        !(await client.readContract({
          address: factory,
          abi: tripFactoryAbi,
          functionName: "isVault",
          args: [vault],
        }))
      )
        throw new AppError(
          "INVALID_VAULT",
          "This trip was not created by the configured factory.",
          404,
        );
      const base = { address: vault, abi: tripVaultAbi } as const;
      const [agent, allowed, endsAt, memberships] = await Promise.all([
        client.readContract({ ...base, functionName: "agent" }),
        client.readContract({ ...base, functionName: "allowedMerchants", args: [merchant] }),
        client.readContract({ ...base, functionName: "endsAt" }),
        Promise.all(
          participants.map((member) =>
            client.readContract({ ...base, functionName: "isMember", args: [member] }),
          ),
        ),
      ]);
      if (agent.toLowerCase() !== wallet.account.address.toLowerCase())
        throw new AppError(
          "AGENT_MISMATCH",
          "The configured proposer does not match this vault.",
          503,
        );
      if (!allowed)
        throw new AppError("MERCHANT_NOT_ALLOWED", "The trip cannot pay this merchant.", 403);
      if (memberships.some((member) => !member))
        throw new AppError("NOT_MEMBER", "Every share must belong to a trip member.", 400);
      return { endsAt };
    },
    async broadcast(quote, shares, deadline) {
      const vault = getAddress(quote.vaultAddress);
      const args = [
        contractQuote(quote),
        shares.map((share) => share.member),
        shares.map((share) => share.amount),
        deadline,
        asHex(quote.signature),
      ] as const;
      await client.simulateContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "propose",
        args,
        account: wallet.account,
      });
      return wallet.writeContract({
        address: vault,
        abi: tripVaultAbi,
        functionName: "propose",
        args,
        ...(await arcFees(client)),
      });
    },
    async confirm(vault, quoteHash, hash) {
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status !== "success")
        throw new AppError("PROPOSAL_REVERTED", "The proposal transaction did not complete.", 409);
      const event = parseEventLogs({
        abi: tripVaultAbi,
        eventName: "Proposed",
        logs: receipt.logs.filter((log) => log.address.toLowerCase() === vault.toLowerCase()),
        strict: true,
      }).find((log) => log.args.quoteHash.toLowerCase() === quoteHash.toLowerCase());
      if (!event)
        throw new AppError(
          "PROPOSAL_RECEIPT_INVALID",
          "The transaction did not contain the expected proposal.",
          503,
        );
      return { proposalId: event.args.proposalId.toString(), transactionHash: hash };
    },
    async purchase(vault, proposalId) {
      const [proposal, shares] = await Promise.all([
        client.readContract({
          address: vault,
          abi: tripVaultAbi,
          functionName: "getProposal",
          args: [proposalId],
        }),
        client.readContract({
          address: vault,
          abi: tripVaultAbi,
          functionName: "getShares",
          args: [proposalId],
        }),
      ]);
      return {
        status: proposal.status,
        ticketHash: proposal.ticketHash,
        participants: shares[0].map((member) => getAddress(member)),
      };
    },
  };
}
