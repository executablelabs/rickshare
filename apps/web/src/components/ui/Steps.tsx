import { CheckCircle, Circle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { cx } from "../../lib/cx";
import { messageOf } from "../../lib/http";

/**
 * Runs a multi-step wallet flow and tracks which step is current, so the sheet can show
 * "Prepare", "Confirm in your wallet", "Done" with a check per finished step.
 */
export function useStepRunner() {
  const [current, setCurrent] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const running = current >= 0 && error === null && current !== Number.POSITIVE_INFINITY;

  const run = useCallback(async (flow: (next: () => void) => Promise<void>) => {
    setError(null);
    setCurrent(0);
    try {
      await flow(() => setCurrent((step) => step + 1));
      setCurrent(Number.POSITIVE_INFINITY);
      return true;
    } catch (failure) {
      setError(messageOf(failure));
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setCurrent(-1);
    setError(null);
  }, []);

  return { current, error, running, run, reset };
}

export interface StepsProps {
  labels: string[];
  current: number;
  error: string | null;
}

/** The progress list for a wallet flow. Hidden until the flow starts. */
export function Steps({ labels, current, error }: StepsProps) {
  if (current < 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Progress" className="flex flex-col gap-2.5 rounded-control bg-paper p-4">
        {labels.map((label, index) => {
          const state =
            index < current ? "done" : index === current ? (error ? "error" : "active") : "todo";
          return (
            <li
              key={label}
              aria-current={state === "active" ? "step" : undefined}
              className={cx(
                "flex items-center gap-2.5 text-sm",
                state === "todo" ? "text-ink-muted" : "text-ink",
                state === "active" && "font-semibold",
              )}
            >
              {state === "done" && (
                <CheckCircle aria-hidden="true" size={20} weight="fill" className="text-stamp" />
              )}
              {state === "active" && (
                <CircleNotch
                  aria-hidden="true"
                  size={20}
                  className="animate-spin text-coral motion-reduce:animate-none"
                />
              )}
              {state === "error" && (
                <WarningCircle
                  aria-hidden="true"
                  size={20}
                  weight="fill"
                  className="text-declined"
                />
              )}
              {state === "todo" && (
                <Circle aria-hidden="true" size={20} className="text-rule-strong" />
              )}
              <span>{label}</span>
              {state === "done" && <span className="sr-only">done</span>}
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-declined">
          <WarningCircle aria-hidden="true" size={20} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
