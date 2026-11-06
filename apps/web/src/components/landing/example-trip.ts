import type { Proposal } from "@rickshare/shared";

// Marketing illustrations only. These values never reach the API or a wallet.
export const exampleMembers = [
  { address: "0x00000000000000000000000000000000000000a1", displayName: "Angie" },
  { address: "0x00000000000000000000000000000000000000b2", displayName: "Bashy" },
  { address: "0x00000000000000000000000000000000000000c3", displayName: "Gitau" },
] satisfies [unknown, unknown, unknown];
export const exampleViewer = exampleMembers[2].address;
export const exampleTicket: Proposal = {
  id: "example",
  tripId: "example",
  merchant: "0x00000000000000000000000000000000000000d4",
  merchantName: "Goa Adventures",
  title: "Tandem paragliding, Arambol",
  location: "Arambol beach, Goa",
  startsAt: "2026-12-12T04:30:00.000Z",
  total: "84000000",
  shares: [
    { member: exampleMembers[0].address, amount: "42000000", state: "approved" },
    { member: exampleViewer, amount: "42000000", state: "waiting" },
  ],
  status: "pending",
  // The illustration is intentionally timeless; real proposals use their merchant's deadline.
  deadline: "2099-12-11T00:00:00.000Z",
  ticketHash: null,
  txHash: "0x00",
};
