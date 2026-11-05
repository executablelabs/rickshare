# Track A authorization handoff

## Summary

Add canonical EIP-712 message builders for quotes, invitations and approval
attestations. The original v0 Quote remains available; SignedQuote adds required
vault/chain binding and location for real merchant interactions.

## Interfaces touched

- SignedQuote: Quote plus vaultAddress, chainId and location, with bounded fields.
- quoteTypedData/contractQuote: exact TripVault Quote encoding.
- approvalTypedData and inviteTypedData: exact contract signature domains/types.

Use SignedQuote throughout B5's purchase tool rather than parsing through the
older Quote schema, which would strip the new binding fields. Signatures are
bound to a single vault/chain; no transport may substitute a different payee.

## Verification

Cryptographic tests reject modified vaults, chains, proposal ids, amounts, nonces,
titles and locations. Solidity parity is additionally exercised by the local
chain integration tests as the service implementations are completed.

## Follow-ups

A6–A10 expose the shared session, projection and merchant service interfaces.
