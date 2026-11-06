import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cx } from "../../lib/cx";
import { DESKTOP_QUERY, useMediaQuery } from "../../lib/use-media-query";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Bottom sheet on mobile, side panel on desktop. */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={isDesktop ? "right" : "bottom"}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Drawer.Content
          // Radix warns unless a missing description is declared explicitly.
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cx(
            "fixed z-50 flex flex-col bg-card text-ink shadow-sheet outline-none",
            isDesktop
              ? "inset-y-0 right-0 w-full max-w-[420px] rounded-l-sheet"
              : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-sheet",
          )}
        >
          {!isDesktop && <Drawer.Handle className="mt-3 bg-rule" />}
          <div className="flex items-start justify-between gap-4 px-5 pt-4">
            <div className="flex flex-col gap-1 pt-2">
              <Drawer.Title className="font-display text-xl font-semibold">{title}</Drawer.Title>
              {description && (
                <Drawer.Description className="text-sm text-ink-muted">
                  {description}
                </Drawer.Description>
              )}
            </div>
            <Drawer.Close
              aria-label="Close"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink hover:bg-paper"
            >
              <X aria-hidden="true" size={20} />
            </Drawer.Close>
          </div>
          <div className="overflow-y-auto px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
