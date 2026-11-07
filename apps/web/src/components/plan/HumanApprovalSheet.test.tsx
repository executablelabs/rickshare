import type { HumanApprovalChallenge } from "@rickshare/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { worldApi } from "../../lib/world";
import HumanApprovalSheet from "./HumanApprovalSheet";

const mocked = vi.hoisted(() => ({
  verify: vi.fn(async (_proof: unknown) => {}),
  widget: undefined as
    | undefined
    | { handleVerify: (proof: unknown) => Promise<void>; onSuccess: () => Promise<void> },
}));
vi.mock("../../config", () => ({ config: { VITE_API_URL: "/api" } }));
vi.mock("@worldcoin/human-in-the-loop-react", () => ({
  useHumanApproval: (_message: unknown, _part: unknown) => ({
    ready: true,
    action: `rickshare:approve:${"a".repeat(64)}`,
    state: { status: "idle" },
    verify: mocked.verify,
  }),
}));
vi.mock("@worldcoin/idkit", () => ({
  proofOfHuman: (input: unknown) => input,
  IDKitRequestWidget: (props: {
    open: boolean;
    handleVerify: (proof: unknown) => Promise<void>;
    onSuccess: () => Promise<void>;
  }) => {
    mocked.widget = props;
    return props.open ? <p>World ID proof widget</p> : null;
  },
}));

const challenge: HumanApprovalChallenge = {
  appId: "app_test",
  action: `rickshare:approve:${"a".repeat(64)}`,
  signal: `rickshare-member:0x${"1".repeat(40)}`,
  rpContext: {
    rp_id: "rp_test",
    nonce: "0x01",
    signature: "0x02",
    created_at: 1,
    expires_at: 9999999999,
  },
  share: {
    chainId: 5042002,
    vaultAddress: `0x${"2".repeat(40)}`,
    member: `0x${"1".repeat(40)}`,
    proposalId: "1",
    amount: "42000000",
    nonce: "0",
    deadline: "9999999999",
    quoteExpiresAt: "9999999999",
  },
};
const attestation = {
  vaultAddress: challenge.share.vaultAddress,
  member: challenge.share.member,
  proposalId: "1",
  amount: "42000000",
  nonce: "0",
  deadline: "9999999999",
  chainId: 5042002,
  signature: "0x01",
};

beforeEach(() => {
  vi.restoreAllMocks();
  mocked.verify.mockReset().mockResolvedValue(undefined);
  mocked.widget = undefined;
});

test("the member sees their exact share and the wallet step waits for backend proof confirmation", async () => {
  vi.spyOn(worldApi, "request").mockResolvedValue({
    status: "verified",
    errorCode: null,
    attestation,
    humanApproval: null,
  });
  const onVerified = vi.fn(async () => {});
  render(
    <HumanApprovalSheet
      requestId={"r".repeat(32)}
      challenge={challenge}
      onVerified={onVerified}
      onCancel={vi.fn()}
    />,
  );
  expect(await screen.findByText("$42.00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Verify and approve my share" }));
  expect(screen.getByText("World ID proof widget")).toBeInTheDocument();
  expect(onVerified).not.toHaveBeenCalled();
  const widget = mocked.widget;
  if (!widget) throw new Error("No IDKit widget");
  await widget.handleVerify({ action: challenge.action });
  expect(mocked.verify).toHaveBeenCalled();
  expect(onVerified).not.toHaveBeenCalled();
  await widget.onSuccess();
  await waitFor(() => expect(onVerified).toHaveBeenCalledWith(attestation));
  await widget.onSuccess();
  expect(onVerified).toHaveBeenCalledTimes(1);
});

test("cancelling prevents a late World success from triggering the wallet", async () => {
  vi.spyOn(worldApi, "cancel").mockResolvedValue(undefined);
  const request = vi.spyOn(worldApi, "request");
  const onVerified = vi.fn(async () => {});
  const onCancel = vi.fn();
  render(
    <HumanApprovalSheet
      requestId={"r".repeat(32)}
      challenge={challenge}
      onVerified={onVerified}
      onCancel={onCancel}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Verify and approve my share" }));
  const widget = mocked.widget;
  if (!widget) throw new Error("No IDKit widget");
  fireEvent.click(screen.getByRole("button", { name: "Cancel approval" }));
  await waitFor(() => expect(onCancel).toHaveBeenCalled());
  await widget.onSuccess();
  expect(request).not.toHaveBeenCalled();
  expect(onVerified).not.toHaveBeenCalled();
});

test("an SDK success alone cannot authorize the wallet without the backend attestation", async () => {
  vi.spyOn(worldApi, "request").mockResolvedValue({
    status: "awaiting_proof",
    errorCode: null,
    attestation: null,
    humanApproval: challenge,
  });
  const onVerified = vi.fn(async () => {});
  render(
    <HumanApprovalSheet
      requestId={"r".repeat(32)}
      challenge={challenge}
      onVerified={onVerified}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Verify and approve my share" }));
  const widget = mocked.widget;
  if (!widget) throw new Error("No IDKit widget");
  await widget.onSuccess();
  expect(await screen.findByRole("alert")).toHaveTextContent("World has not verified this share");
  expect(onVerified).not.toHaveBeenCalled();
});
