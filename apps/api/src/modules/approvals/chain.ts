import { arcTestnet } from "@rickshare/shared";
import { tripFactoryAbi, tripVaultAbi } from "@rickshare/shared/abi";
import { type Address, getAddress } from "viem";
import { AppError } from "../../lib/errors";
import { assertArcChain, createArcClient } from "../chain/clients";

export type ApprovalContext = {
  chainId: number;
  vaultAddress: Address;
  proposalId: bigint;
  member: Address;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  quoteExpiresAt: bigint;
  verifier: Address;
};
export type ApprovalReader = (
  vault: Address,
  proposalId: bigint,
  member: Address,
) => Promise<ApprovalContext>;

export function createApprovalReader(factory: Address, client = createArcClient()): ApprovalReader {
  return async (vault, proposalId, member) => {
    await assertArcChain(client);
    const registered = await client.readContract({
      address: factory,
      abi: tripFactoryAbi,
      functionName: "isVault",
      args: [vault],
    });
    if (!registered)
      throw new AppError(
        "INVALID_VAULT",
        "This vault was not created by the configured factory.",
        404,
      );
    const base = { address: vault, abi: tripVaultAbi } as const;
    const [isMember, proposal, amount, nonce, verifier] = await Promise.all([
      client.readContract({ ...base, functionName: "isMember", args: [member] }),
      client.readContract({ ...base, functionName: "getProposal", args: [proposalId] }),
      client.readContract({ ...base, functionName: "shareAmount", args: [proposalId, member] }),
      client.readContract({ ...base, functionName: "approvalNonces", args: [member] }),
      client.readContract({ ...base, functionName: "verifier" }),
    ]);
    if (!isMember || amount === 0n)
      throw new AppError("NOT_PARTICIPANT", "This purchase does not include you.", 403);
    if (proposal.status !== 0)
      throw new AppError(
        "PROPOSAL_NOT_PENDING",
        "This purchase is no longer awaiting approval.",
        409,
      );
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (proposal.deadline <= now || proposal.quoteExpiresAt < now)
      throw new AppError(
        "PROPOSAL_EXPIRED",
        "This activity quote expired. Ask the planner for a new proposal.",
        409,
      );
    return {
      chainId: arcTestnet.id,
      vaultAddress: vault,
      proposalId,
      member,
      amount,
      nonce,
      deadline: proposal.deadline,
      quoteExpiresAt: proposal.quoteExpiresAt,
      verifier: getAddress(verifier),
    };
  };
}
