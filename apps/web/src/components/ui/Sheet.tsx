import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cx } from "../../lib/cx";
import { DESKTOP_QUERY, useMediaQuery } from "../../lib/use-media-query";
import { TransportMark, type Vehicle } from "../brand/TransportMark";
import "../../styles/travel.css";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  theme?: "paper" | "orange" | "navy";
  vehicle?: Vehicle;
}

/** Bottom sheet on mobile, side panel on desktop. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  theme = "paper",
  vehicle = "plane",
}: SheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={isDesktop ? "right" : "bottom"}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Drawer.Content
          // Radix warns unless a missing description is declared explicitly.
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cx(
            `travel-sheet travel-sheet--${theme} fixed z-50 flex flex-col overflow-hidden bg-card text-ink shadow-sheet outline-none`,
            isDesktop
              ? "inset-y-4 right-4 w-[calc(100%-32px)] max-w-[480px] rounded-sheet"
              : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-sheet",
          )}
        >
          {!isDesktop && <Drawer.Handle className="mt-3 bg-rule" />}
          <div className="travel-sheet__heading">
            <div className="travel-sheet__topline">
              <TransportMark vehicle={vehicle} />
              <Drawer.Close
                aria-label="Close"
                className="inline-flex size-11 items-center justify-center rounded-pill hover:bg-card/10"
              >
                <X aria-hidden="true" size={20} />
              </Drawer.Close>
            </div>
            <div>
              <Drawer.Title className="font-display text-xl font-semibold">{title}</Drawer.Title>
              {description && (
                <Drawer.Description className="text-sm text-ink-muted">
                  {description}
                </Drawer.Description>
              )}
            </div>
          </div>
          <div className="travel-sheet__body pb-[max(24px,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
