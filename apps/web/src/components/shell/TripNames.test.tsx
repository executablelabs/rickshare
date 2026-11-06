import type { Trip } from "@rickshare/shared";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TripNames } from "./TripNames";

const trip: Trip = {
  id: "trip",
  name: "Goa",
  ensName: "goa-abcd.rickshare.eth",
  vaultAddress: "0x1111111111111111111111111111111111111111",
  endsAt: "2030-01-01T00:00:00.000Z",
  members: [
    {
      address: "0x2222222222222222222222222222222222222222",
      displayName: "Alice",
      ensName: "alice.goa-abcd.rickshare.eth",
      worldLinked: false,
      policy: { autoApproveMax: "0", totalCap: "0" },
      deposited: "0",
      spent: "0",
      locked: "0",
      available: "0",
    },
  ],
};

test("shows confirmed member and agent names while keeping display labels", () => {
  render(<TripNames trip={trip} />);
  expect(screen.getByText("Group names")).toBeInTheDocument();
  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("alice.goa-abcd.rickshare.eth")).toBeInTheDocument();
  expect(screen.getByText("agent.goa-abcd.rickshare.eth")).toBeInTheDocument();
});

test("does not fabricate names before provisioning confirms", () => {
  const view = render(<TripNames trip={{ ...trip, ensName: null }} />);
  expect(view.container).toBeEmptyDOMElement();
});
