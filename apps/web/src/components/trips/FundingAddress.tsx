import { Copy } from "@phosphor-icons/react";
import { useId, useRef } from "react";
import { useWallet } from "../../auth/wallet";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

export function FundingAddress() {
  const { address } = useWallet();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const showToast = useToast();
  if (!address) return null;

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      showToast("Wallet address copied");
    } catch {
      input.current?.focus();
      input.current?.select();
      showToast("Select and copy the wallet address below.", { tone: "error" });
    }
  }

  return (
    <div className="travel-funding min-w-0">
      <label htmlFor={id} className="text-sm font-semibold">
        Your wallet on Arc Testnet
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <input
          id={id}
          ref={input}
          value={address}
          readOnly
          onFocus={(event) => event.target.select()}
          className="h-11 min-w-0 flex-1 rounded-control bg-card px-2 text-xs text-ink ring-1 ring-inset ring-rule"
        />
        <Button
          variant="secondary"
          className="h-11 px-3"
          onClick={() => void copy()}
          aria-label="Copy wallet address"
        >
          <Copy aria-hidden="true" size={18} /> Copy
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        Fund this address with test USDC for your share and network fees.
      </p>
    </div>
  );
}
