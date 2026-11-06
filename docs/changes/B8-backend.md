# B8 backend: exact balances, ordered history and member wallet actions

## Summary

Expose fixed-block money snapshots including withdrawals, numeric-order paged
vault history and prepared wallet actions. The server supplies exact calldata
and fee quantities but cannot send a transaction as a member.

## Interfaces touched

GET money/history and POST actions routes under a registered member trip.
Deposit, withdraw, policy, reject, refund and settlement transaction preparation.
The shared wallet-transaction builder is reused by creation and joining.

## Verification

Local contracts execute the returned approval/deposit and withdrawal calldata.
Tests check exact available/withdrawn accounting, actor/from/value binding,
rejection of caller-selected member fields and stable history pagination across
numeric block/log order. Full checks run before commit.

## Follow-ups

The B8 Money/Itinerary frontend consumes these endpoints and the participant-only
ticket endpoint. Wallet onboarding and signing remain in B2/B4 frontend work.
