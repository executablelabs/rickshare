# B2: Google and existing-wallet login

## Summary

Offer Google and existing Ethereum wallets alongside email in the Privy login modal.
Retain automatic embedded-wallet creation for users without wallets, and use the active
linked Ethereum wallet for Rickshare signing when an account has multiple wallets.
The API session still requires the selected wallet's Arc SIWE signature.

## Files

- apps/web/src/auth/PrivyWallet.tsx: login methods, Ethereum-only picker and linked active signer selection.
- apps/web/src/auth/PrivyWallet.test.tsx: provider configuration, external signer choice, unlinked/disconnected accounts and refused network switching.
- apps/web/src/auth/AuthGuard.tsx: copy describing all three choices.
- apps/web/.env.example and README.md: matching dashboard configuration and login instructions.
- docs/changes/B2-login-options-{entry,modal,wallets}-{390,1280}.png: reviewed browser captures.

## Interfaces touched

None. Existing SIWE routes, session isolation and wallet transaction boundaries are retained.
No new dependencies or environment variables. Google, email and wallet login are enabled
in the configured Privy application; its settings were checked through the public app configuration.

## Verification

- Full `bun run check`: pass (83 web, 140 API, 18 shared, 6 merchant and 98 contract tests).
- Production web build: pass.
- Real configured Privy UI: Google, email and existing-wallet choices appear at 390px and
  1280px; wallet picker opens with MetaMask, Coinbase Wallet and other supported wallets.
  No page runtime errors or horizontal overflow.
- Controlled ephemeral EIP-1193 test wallet: real Privy wallet authentication and Rickshare
  SIWE both completed. Two sign-in messages were signed; the API session matched the external
  wallet and logout revoked it. The fixture was confined to the isolated test browser and
  made no transactions or model calls. Real browser extensions and mobile WalletConnect
  were not exercised end to end.
- Google was enabled by the owner in Privy's dashboard. Full Google OAuth completion was
  explicitly deferred by the owner to rollout testing; only its live configured UI is verified.

## Follow-ups

- Rollout: owner completes Google OAuth and a real existing-wallet sign-in on the deployed origin.
- B4/B7/B8: onboarding, proposal approval and trip UI continue to use the selected account's session.
