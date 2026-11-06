# A5: confirmed Arc testnet factory deployment

## Summary

Record the successfully deployed TripFactory on Arc testnet and publish its address
in the README. The manifest includes the confirmed transaction, deployment block,
USDC token and public operator/merchant roles.

## Files

- packages/shared/src/deployments/arcTestnet.json: confirmed deployment metadata.
- README.md: factory address and deployment record link.
- docs/changes/A5-arc-deployment.md: deployment and prefunding verification.

## Interfaces touched

Populate the existing shared Arc deployment manifest. No contract ABI, API route,
environment variable names or money-consent rules change. This is an interface
metadata update requiring the other track's human review.

## Verification

- Network: Arc Testnet, chain ID 5042002.
- Factory: `0x127a05d19df8201654128546f66a3f8d3eec84f3`.
- Deployment transaction: `0x43be7a4a7131a9c27c170721e079fcec608254fc0a97e611b494e86cfbfd5446`.
- Successful receipt at block 70991387; contract code is present at the receipt's deployed address.
- Onchain token, agent, verifier and all three merchants match the manifest.
- Local API, merchant and seed environments reference the confirmed factory.
- Full `bun run check`: pass (87 web, 151 API, 18 shared, 6 merchant and 98 contract tests).

## Demo prefunding

The owner bridged 1,500 test USDC from Base Sepolia through Circle CCTP to the
deployer. Confirmed Arc mint transaction:
`0xa3e6c3a11d432f47e28e6486800dd387f633f40f8b7da3dc38d41c2ea67a407f`.

Each generated demo member then received exactly 500 test USDC on Arc:

| Member | Address                                      | Funding transaction                                                  |
| ------ | -------------------------------------------- | -------------------------------------------------------------------- |
| 1      | `0xeffE7D78cCca4751643419d5B5661C190285CcC2` | `0x6821d64c03302a10e9dbc0e1037a3a036277da566b45d6fad6de28343ea25eec` |
| 2      | `0x518F519353bbC198D0fAfc8963b3AA022736FCaC` | `0x6d36164803633482232ed32a03ae45f1c66589305266533b54b33352e744d8ac` |
| 3      | `0x59A3Af68BFED8e35B1727baA8F890B601D8e04Cc` | `0x40dd87b1b75ee769fee1ece25b63b1387d021541f4a43a4ddf74f1af34a0e94e` |

All three transfer receipts succeeded and the resulting balances were verified.
This is operator prefunding, separate from the future A12 in-app crosschain deposit flow.

## Follow-ups

- A11: seed the live trip using the existing factory and funded demo members.
- A8: configure the current World Agent Pass OIDC environment and complete live approval verification.
