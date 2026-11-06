import { expect, test } from "bun:test";
import { dnsEncode, memberLabels, toLabel, tripLabel } from "./names";

test.each([
  ["Angie", "angie"],
  ["Émile Zola", "emile-zola"],
  ["  --Goa!! 2026--  ", "goa-2026"],
  ["🌴🌴", "fallback"],
  ["a".repeat(40), "a".repeat(32)],
])("labels %j as %j", (text, expected) => {
  expect(toLabel(text, "fallback")).toBe(expected);
});

test("suffixes trip labels with the vault so equal names never collide", () => {
  expect(tripLabel("India 26", "0x3FA2c0ffee")).toBe("india-26-3fa2");
  expect(tripLabel("x".repeat(40), "0xabcd").length).toBeLessThanOrEqual(32);
});

test("keeps member labels unique and never gives a member the agent's label", () => {
  const labels = memberLabels([
    { address: "0xA1", displayName: "Angie" },
    { address: "0xA2", displayName: "angie" },
    { address: "0xA3", displayName: "Agent" },
    { address: "0xA4", displayName: "" },
  ]);
  expect([...labels.values()]).toEqual(["angie", "angie-2", "agent-2", "member-a4"]);
});

test("encodes names in DNS wire format", () => {
  expect(dnsEncode("eth")).toBe("0x0365746800");
  expect(dnsEncode("a.rickshare.eth")).toBe("0x0161097269636b73686172650365746800");
  expect(() => dnsEncode("bad..name")).toThrow();
});
